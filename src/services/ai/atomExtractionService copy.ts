
import { Type } from "@google/genai";
import {
  GenerationRequest, AtomCore, UserProfile, ChunkState, LocalTrainingSource
} from '../../types';
import { IngestionLedger } from '../../types/ingestion';
import { getAiClient, callAiWithRetry } from './client';
import { AI_MODELS } from './constants';
import { sha256 } from '../../utils/hashUtils';
import { getPdfTextBatches } from '../pdfUtils';
import { computeDocFingerprint } from '../../utils/fingerprintUtils';
import { stageAtomsForGlobalReview } from '../globalSharingService';
import {
  getLocalAtoms,
  getLibraryItemByContentId,
  saveLocalTrainingSource,
  getLocalTrainingSources,
  saveAtoms,
  getAtomsForContent,
  getCompletedChunks,
  saveChunkStatus
} from '../storageService';
import { auth, db } from '../firebaseConfig';
import { finalizeAtom } from './finalizeAtom';
import { getDB } from '../idbService';
import { logger } from '../../utils/logger';
import { ATOM_EXTRACTION_PROMPT_V7, resolveAtomExtractionPrompt } from '../../constants';

const BATCH_SIZE_PAGES = 15;
const SYNTHESIS_TIMEOUT_MS = 380000;
const CHUNK_STRATEGY_VERSION = "v7_text";

// 💾 PDF TEXT CACHE (Session-Scoped)
// Prevents expensive re-extraction when an AI failure triggers a FRESH retry
// within the same browser session. Keyed by document fingerprint.
const pdfTextCache: Map<string, { batches: { text: string; pageStart: number; pageEnd: number }[]; createdAt: number }> = new Map();
const PDF_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// 🔒 DETERMINISTIC LANGUAGE RECOGNITION (v1.2+)
// This is the fallback layer if UI metadata is missing/ambiguous.
// DEPRECATED: v1.4+ relies on AI model detection via prompt instructions.
function detectContentLanguage(text: string, metadataLanguage?: string): string {
  return metadataLanguage || 'English';
}

const cleanJson = (text: string) => {
  if (!text) return "";
  let clean = text.trim();
  // Strip Markdown code blocks
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

  // Robustly extract JSON object if surrounded by other text
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    clean = clean.substring(start, end + 1);
  }

  return clean;
};

// Removed ARABIC_ATOM_PROMPT (using ARABIC_ATOM_PROMPT_BATCH via import)

const ATOM_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    atoms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metadata: {
            type: Type.OBJECT,
            properties: {
              conceptTag: { type: Type.STRING },
              relatedConceptTags: { type: Type.ARRAY, items: { type: Type.STRING } },
              sourcePageRefs: { type: Type.ARRAY, items: { type: Type.NUMBER } }
            },
            required: ['conceptTag', 'relatedConceptTags', 'sourcePageRefs']
          },
          coreRepresentation: {
            type: Type.OBJECT,
            properties: {
              definition: { type: Type.STRING },
              keyRule: { type: Type.STRING },
              formula: { type: Type.STRING },
              primaryExample: { type: Type.STRING }
            },
            required: ['definition', 'keyRule', 'formula', 'primaryExample']
          },
          extendedRepresentation: {
            type: Type.OBJECT,
            properties: {
              fullExplanation: { type: Type.STRING },
              analogy: { type: Type.STRING },
              misconceptions: { type: Type.ARRAY, items: { type: Type.STRING } },
              realWorldAnalogy: { type: Type.STRING },
              proTips: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['fullExplanation', 'misconceptions']
          },
          assessmentMetadata: {
            type: Type.OBJECT,
            properties: {
              difficultyCeiling: { type: Type.INTEGER },
              highestBloomObserved: { type: Type.NUMBER },
              essentialKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              cognitiveLoad: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
              prerequisiteConceptTags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['difficultyCeiling', 'highestBloomObserved', 'essentialKeywords', 'cognitiveLoad', 'prerequisiteConceptTags']
          },
          trustScore: { type: Type.NUMBER }
        },
        required: ['metadata', 'coreRepresentation', 'extendedRepresentation', 'assessmentMetadata', 'trustScore']
      }
    }
  },
  required: ['atoms']
};

const processChunk = async (
  chunk: ChunkState,
  textContent: string, // TEXT ONLY
  user: UserProfile,
  masterInstruction: string,
  docFingerprint: string,
  req: GenerationRequest,
  promptName: string,
  onStatus?: (msg: string) => void
): Promise<AtomCore[]> => {
  const log = (msg: string) => onStatus?.(`[PAGE_LEVEL][CHUNK_${chunk.batchIndex + 1}] ${msg} `);
  const idb = await getDB();

  // 🔒 IDEMPOTENCY GUARD: Double-check freshness
  if (chunk.status === 'COMPLETED') {
    logger.ingestion(`[PAGE_LEVEL][GUARD] Skipping already completed chunk ${chunk.batchIndex + 1} `);
    return [];
  }

  // Persistence: Update State to PROCESSING
  chunk.status = 'PROCESSING';
  chunk.startedAt = Date.now();
  chunk.updatedAt = Date.now();
  await idb.put('chunks', chunk);

  const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
  const userPrompt = `TASK: Extract atoms for pages ${chunk.pageStart} - ${chunk.pageEnd}.FINGERPRINT: ${docFingerprint}.`;

  try {
    log(`Sending text payload(${textContent.length} chars) to AI...`);
    logger.ingestion(`[PAGE_LEVEL] Processing Chunk ${chunk.batchIndex + 1} `, {
      start: chunk.pageStart,
      end: chunk.pageEnd,
      key: keyName,
      prompt: masterInstruction.substring(0, 500) // Log simplified prompt
    });

    // AI Call: TEXT ONLY, Temperature 0.0
    // NOTE: thinkingConfig is now injected by the router (client.ts) based on model capability.
    // This prevents 400 errors when Flash Lite is used as fallback (Issue 2 fix).
    const response = await Promise.race([
      callAiWithRetry(ai, {
        contents: [
          { role: 'user', parts: [{ text: userPrompt + `\n\nCONTEXT: \n${textContent} ` }] }
        ],
        config: {
          systemInstruction: masterInstruction,
          responseMimeType: 'application/json',
          responseSchema: ATOM_EXTRACTION_SCHEMA,
          temperature: config.temperature,
          topP: config.topP,
          topK: config.topK,
          maxOutputTokens: config.maxOutputTokens
        }
      }, 'ingestion', [], apiKey),
      new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), SYNTHESIS_TIMEOUT_MS))
    ]) as any;

    const rawText = response.text || '';

    // [RAW_MODELS_RESPONSE] Log what the model actually returned
    console.log(`%c[RAW_MODELS_RESPONSE][CHUNK_${chunk.batchIndex + 1}]`, 'background: #9d174d; color: #fff; font-weight: bold; padding: 2px 4px; border-radius: 4px;');
    console.log(rawText);

    const cleanedText = cleanJson(rawText);

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      logger.error("INGESTION", "[ATOM_PIPELINE] JSON Parse Failure", {
        error: e instanceof Error ? e.message : String(e),
        chunkIndex: chunk.batchIndex + 1,
        rawTextPreview: rawText.substring(0, 500),
        cleanedTextPreview: cleanedText.substring(0, 500)
      });
      throw new Error(`AI returned malformed JSON in chunk ${chunk.batchIndex + 1}`);
    }

    const rawAtoms = Array.isArray(parsed.atoms) ? parsed.atoms : [];
    logger.ingestion(`[PAGE_LEVEL] Raw Atoms Received: ${rawAtoms.length} for Chunk ${chunk.batchIndex + 1}`);

    const narrativeBase = chunk.batchIndex * 1000;

    // Process & Sanitize Atoms
    const processedAtoms = (await Promise.all(rawAtoms.map(async (raw: any, idx: number) => {
      try {
        // Validation Injection: Ensure Page Refs exist
        if (!raw.metadata) raw.metadata = {};
        if (!raw.metadata.sourcePageRefs || !Array.isArray(raw.metadata.sourcePageRefs) || raw.metadata.sourcePageRefs.length === 0) {
          raw.metadata.sourcePageRefs = [chunk.pageStart];
        }

        const sanitized = finalizeAtom(raw, docFingerprint);

        // LEL-X FIX: Force Request Language (Trust User/Context over AI)
        sanitized.metadata.language = req.language;
        // LEL-X Language Validation Removed (v1.2) - relies on Prompt Routing only.

        const narrativeSequence = narrativeBase + idx;

        // Construct partial atom for key generation
        const partialAtomForId: AtomCore = {
          atomId: '', // Placeholder
          trustScore: sanitized.trustScore || 1.0,
          metadata: {
            ...sanitized.metadata,
            subject: req.subject,
            language: req.language,
            narrativeSequence,
            sourceDocumentId: docFingerprint,
            updatedAt: Date.now(),
            userId: user.id,
            gradeLevel: parseInt((user.preferences.defaultYear || "10").replace(/[^0-9]/g, '')) || 10
          },
          coreRepresentation: sanitized.coreRepresentation,
          extendedRepresentation: sanitized.extendedRepresentation,
          assessmentMetadata: sanitized.assessmentMetadata
        };

        // ✅ UNIFIED IDENTITY: Use Global Identity Key as local atomId
        // This ensures local atoms match global registry and fix join issues
        const atomId = await import('../globalSharingService').then(m => m.generateGlobalIdentityKey(partialAtomForId));

        return {
          ...partialAtomForId,
          atomId // Set the real ID
        } as AtomCore;
      } catch (e) {
        logger.error("INGESTION", "[ATOM_PIPELINE] Skipping invalid atom", e);
        return null;
      }
    }))).filter(a => a !== null) as AtomCore[];

    // ATOM COMMIT PHASE
    if (processedAtoms.length > 0) {
      log(`Committing ${processedAtoms.length} atoms to storage...`);
      await saveAtoms(processedAtoms, 'notes');
      logger.ingestion(`[PAGE_LEVEL][ATOM_COMMIT] Successfully saved ${processedAtoms.length} atoms for chunk ${chunk.batchIndex + 1}`);
    } else {
      log("Warning: No valid atoms extracted in this batch.");
    }

    // Persistence: Update State to COMPLETED
    chunk.status = 'COMPLETED';
    chunk.atomCount = processedAtoms.length;
    chunk.updatedAt = Date.now();
    await idb.put('chunks', chunk);

    return processedAtoms;
  } catch (err: any) {
    logger.error("INGESTION", "[CHUNK_PROCESS_ERROR]", err);
    chunk.status = 'FAILED';
    chunk.error = err.message;
    chunk.updatedAt = Date.now();
    await idb.put('chunks', chunk);
    throw err;
  }
};

const sealDocumentStatus = async (userId: string, fingerprint: string, log: (m: string) => void) => {
  const idb = await getDB();
  const chunks = await idb.getAllFromIndex('chunks', 'by_doc', fingerprint);
  const activeChunks = chunks.filter(c => c.id.includes(CHUNK_STRATEGY_VERSION));
  const completed = activeChunks.filter(c => c.status === 'COMPLETED').length;
  const total = activeChunks.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const localSources = await getLocalTrainingSources(userId);
  let source = localSources.find(s => s.fileHash === fingerprint);

  if (source) {
    const isFullyDone = progressPercent === 100 && total > 0;

    // --- GLOBAL STAGING TRIGGER (At Finalization) ---
    if (isFullyDone) {
      log("[PAGE_LEVEL] [FINALIZATION] Document analysis complete. Initiating Global Staging...");
      try {
        // Fetch ALL atoms for this document to stage as a complete package
        const allAtoms = await getLocalAtoms(userId, fingerprint);
        const coreAtoms = allAtoms.map(vm => vm.core);

        if (coreAtoms.length > 0) {
          await stageAtomsForGlobalReview(
            userId,
            fingerprint,
            source.subject,
            source.grade || 'Grade 10',
            coreAtoms,
            source.fileName,
            source.educationSystem || 'IGCSE'
          );
          log(`[PAGE_LEVEL][FINALIZATION] ${coreAtoms.length} atoms staged for global review.`);
        }
      } catch (e) {
        console.warn("[FINALIZATION] Staging failed (non-critical).", e);
      }


    }

    const updatedSource: LocalTrainingSource = {
      ...source,
      status: isFullyDone ? 'Completed' : (completed > 0 ? 'Training' : 'Failed'),
      progress: progressPercent,
      updatedAt: Date.now()
    };
    await saveLocalTrainingSource(updatedSource);
    log(`[PAGE_LEVEL][SEAL] Progress: ${progressPercent}% `);
  }
};

const buildProxyUser = (fbUser: any, req: GenerationRequest): UserProfile => {
  return {
    id: fbUser.uid,
    name: fbUser.displayName || 'Student',
    email: fbUser.email || '',
    role: 'STUDENT', // Default role
    preferences: {
      defaultYear: req.year || 'Grade 10',
      defaultCurriculum: req.curriculum || 'Standard' as any,
      defaultLanguage: req.language || 'English' as any,
      defaultSubject: req.subject || 'General',
      subjects: [req.subject || 'General'],
      theme: 'light',
      enableNotifications: true,
      enableVibration: true
    },
    gamification: { xp: 0, level: 1, streak: 0, lastStudyDate: 0, earnedBadges: [] },
    dailyStats: { date: new Date().toISOString(), filesProcessed: 0, actionsPerformed: 0 },
    joinedAt: Date.now(),
    lastLoginAt: Date.now()
  } as UserProfile;
};

export const ensureAtoms = async (
  req: GenerationRequest,
  onStatus?: (msg: string) => void
) => {
  const log = (msg: string) => {
    if (onStatus) onStatus(msg);
    logger.ingestion(msg);
  };

  let activePdf = req.studyMaterialFile;
  const contentKey = req.studyMaterialUrl || req.contentId || 'GLOBAL';

  if (!activePdf && contentKey !== 'GLOBAL' && auth.currentUser) {
    // 1. Try Library Items
    const recovered = await getLibraryItemByContentId(contentKey, auth.currentUser.uid);
    if (recovered && recovered.data) { activePdf = recovered.data; }

    // 2. Try Local Training Sources (If not in Library)
    if (!activePdf) {
      const sources = await getLocalTrainingSources(auth.currentUser.uid);
      const matched = sources.find(s => s.fileHash === contentKey || s.id === contentKey);
      if (matched && matched.data) {
        activePdf = matched.data;
        logger.ingestion(`[PAGE_LEVEL][RECOVERY] Recovered PDF source from local training cache for ${contentKey}`);
      }
    }
  }

  let contentId = contentKey;
  if ((!contentId || contentId === 'GLOBAL') && activePdf) {
    contentId = await computeDocFingerprint(activePdf);
  } else if (!contentId || contentId === 'GLOBAL') {
    contentId = await sha256(`TOPIC:${req.topic}:${req.language} `);
  }

  logger.ingestion("[PAGE_LEVEL] Ensuring Atoms", { contentId, hasPdf: !!activePdf });

  log("[PAGE_LEVEL] Scanning Intelligent Cache...");
  const atomsInCache = await getAtomsForContent(contentId, 'notes');
  const completedMarkers = await getCompletedChunks(contentId, 'notes');

  if (atomsInCache.length > 0 && completedMarkers.length >= 1) {
    log("[PAGE_LEVEL] Neural Link Established (v7 Cache Hit).");



    return { contentId, isCacheHit: true };
  }

  // 🔒 SINGLE SOURCE OF TRUTH: DELEGATE PDF PARSING
  if (activePdf) {
    if (!auth.currentUser) throw new Error("Authentication required for PDF ingestion.");

    const proxyUser = buildProxyUser(auth.currentUser, req);

    // Inject PDF back into req if it was recovered
    const delegationReq = { ...req, studyMaterialFile: activePdf };

    // Delegate to extractAtomsFromDocument which handles cache/resume and PDF worker
    await extractAtomsFromDocument(delegationReq, proxyUser, onStatus);
    return { contentId, isCacheHit: false };
  }

  // TOPIC-ONLY GENERATION (No PDF Parsing)
  log("[TOPIC_GEN] Executing Topic-Based Extraction (T=0.0)...");
  const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
  const modelToUse = config.defaultModel;

  const userId = auth.currentUser?.uid || 'anonymous';
  const userGrade = req.year || 'Grade 10';

  // v1.3: Use subject-based prompt resolver (Topic Mode)
  const selectedPrompt = resolveAtomExtractionPrompt(req.subject);

  // Detect which prompt was returned
  const promptName = selectedPrompt.includes('Master Teacher') && selectedPrompt.includes('STRICT LANGUAGE MIRRORING')
    ? 'ATOM_EXTRACTION_DEFAULT'
    : selectedPrompt.includes('TASK-FIRST EXTRACTION RULE')
      ? 'ATOM_EXTRACTION_ENGLISH'
      : 'UNKNOWN_PROMPT';

  logger.ingestion(`[TOPIC_GEN] Using Prompt: ${promptName}`, { subject: req.subject });

  const masterInstruction = selectedPrompt
    .replace('${gradeLevel}', userGrade)
    .replace('${subject}', req.subject)
    .replace('${docFingerprint}', contentId)
    .replace('${maxAtoms}', '10');

  log(`[TOPIC_GEN] Synthesizing core knowledge for: ${req.topic}...`);
  logger.ingestion(`[TOPIC_GEN] Generating Topic(No PDF) | Key: ${keyName} `, { prompt: masterInstruction.substring(0, 200) });

  const response = await callAiWithRetry(ai, {
    contents: [{ role: 'user', parts: [{ text: `Extract Knowledge Atoms for topic: ${req.topic}.` }] }],
    config: {
      systemInstruction: masterInstruction,
      responseMimeType: 'application/json',
      responseSchema: ATOM_EXTRACTION_SCHEMA,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens
    }
  }, 'ingestion', [], apiKey);

  const cleanedText = cleanJson(response.text || '');
  const atoms = JSON.parse(cleanedText || '{"atoms":[]}').atoms;

  const processedAtoms: AtomCore[] = await Promise.all(atoms.map(async (a: any, i: number) => {
    if (!a.metadata) a.metadata = {};
    a.metadata.sourcePageRefs = [1];

    // LEL-X FIX: Force Request Language (Trust User/Context over AI)
    a.metadata.language = req.language;
    // LEL-X Language Validation Removed (v1.2)

    // Construct partial atom for key generation
    const partialAtom: AtomCore = {
      ...a,
      atomId: '', // Placeholder
      trustScore: a.trustScore || 1.0,
      metadata: {
        ...a.metadata,
        subject: req.subject,
        language: req.language,
        sourceDocumentId: contentId,
        narrativeSequence: i,
        updatedAt: Date.now(),
        userId: userId,
        gradeLevel: parseInt((req.year || "10").replace(/[^0-9]/g, '')) || 10
      },
      coreRepresentation: a.coreRepresentation || {},
      extendedRepresentation: a.extendedRepresentation || {},
      assessmentMetadata: a.assessmentMetadata || {}
    };

    // ✅ UNIFIED IDENTITY: Use Global Identity Key
    const unifiedId = await import('../globalSharingService').then(m => m.generateGlobalIdentityKey(partialAtom));

    return {
      ...partialAtom,
      atomId: unifiedId
    };
  }));

  await saveAtoms(processedAtoms, 'notes'); // Issue 7 fix: removed duplicate saveAtoms call
  await saveChunkStatus({ id: `${contentId} _notes_1`, contentId, feature: 'notes', chunkIndex: 1, status: 'COMPLETE' });



  return { contentId, isCacheHit: false };
};

// 🔒 INGESTION MODES (EDUVA v8 Final)
export type IngestionMode = 'FRESH' | 'RESUME';

export const extractAtomsFromDocument = async (
  req: GenerationRequest,
  user: UserProfile,
  onStatus?: (msg: string) => void,
  ingestionMode: IngestionMode = 'RESUME'
): Promise<AtomCore[]> => {
  const log = (msg: string) => onStatus?.(msg);

  // 1. Resolve Source PDF (Memory Only)
  let sourcePdf = req.studyMaterialFile;
  const contentKey = req.studyMaterialUrl || req.contentId || 'GLOBAL';

  // Attempt recovery from Library if missing in request (e.g. from UI retry)
  if (!sourcePdf && contentKey !== 'GLOBAL' && auth.currentUser) {
    const sources = await getLocalTrainingSources(auth.currentUser.uid);
    const matched = sources.find(s => s.fileHash === contentKey || s.id === contentKey);
    if (matched && matched.data) {
      sourcePdf = matched.data;
      logger.ingestion(`[PAGE_LEVEL][RECOVERY] Recovered PDF source from local training cache for ${contentKey}`);
    }
  }

  if (!sourcePdf) throw new Error("Source missing. Please re-upload PDF to resume extraction.");

  // 2. Identity & Fingerprint
  const docFingerprint = await computeDocFingerprint(sourcePdf);
  logger.ingestion(`[PAGE_LEVEL] Document Fingerprint: ${docFingerprint} `);
  const idb = await getDB();

  // 3. Mode Logic
  if (ingestionMode === 'FRESH') {
    logger.ingestion(`[PAGE_LEVEL] Starting FRESH ingestion.Purging cache...`);
    // Force Purge of any existing chunks for this fingerprint
    const staleChunks = await idb.getAllFromIndex('chunks', 'by_doc', docFingerprint);
    if (staleChunks.length > 0) {
      const tx = idb.transaction('chunks', 'readwrite');
      for (const c of staleChunks) { await tx.store.delete(c.id); }
      await tx.done;
      logger.ingestion(`[PAGE_LEVEL] Purged ${staleChunks.length} stale chunks.`);
    }
  }

  // 🔒 FINAL INGESTION LOCK
  // If the document is already marked as 'Completed' or 'Training' with 100% progress,
  // we strictly forbid restarting it unless there's an explicit FORCE mode (which we don't use yet).
  const source = (await getLocalTrainingSources(user.id)).find(s => s.fileHash === docFingerprint);
  if (source?.status === 'Completed' || (source?.progress === 100 && source?.status !== 'Failed')) {
    logger.ingestion(`[PAGE_LEVEL][LOCK] Document is already COMPLETED. Prevention double - ingestion loop.`);

    // v1.3 FIX: Ensure Ledger is COMPLETED so UI shows Success
    try {
      const ledger = await idb.get('ingestion_ledgers', docFingerprint) as IngestionLedger | undefined;
      if (!ledger || ledger.status !== 'COMPLETED') {
        const now = Date.now();
        const newLedger: IngestionLedger = ledger || {
          docFingerprint,
          subject: req.subject,
          language: req.language,
          userId: user.id,
          totalChunks: 0,
          completedChunks: [],
          failedExternalChunks: [],
          failedLogicChunks: [],
          pdfTextCacheKey: docFingerprint,
          createdAt: now,
          updatedAt: now,
          status: 'COMPLETED',
          safeToConsume: true
        };
        newLedger.status = 'COMPLETED';
        newLedger.safeToConsume = true;
        newLedger.updatedAt = now;

        await idb.put('ingestion_ledgers', newLedger);
        logger.ingestion(`[PAGE_LEVEL][LOCK] Forced Ledger to COMPLETED for UI sync.`);


      }
    } catch (err) {
      console.error('[PAGE_LEVEL][LOCK] Failed to update ledger:', err);
    }
    // Ensure atoms are actually there before returning
    const finalAtoms = await getLocalAtoms(user.id, docFingerprint);
    if (finalAtoms.length > 0) {
      return finalAtoms.map(a => a.core);
    }
    logger.ingestion(`[PAGE_LEVEL][LOCK] Warm cache empty ? Retrying...`);
  }



  // 4. Resume Logic: Load existing ChunkStates (will be empty if FRESH)
  const existingChunks = await idb.getAllFromIndex('chunks', 'by_doc', docFingerprint);
  // Filter for current version to avoid schema mismatch
  const relevantChunks = existingChunks.filter(c => c.id.includes(CHUNK_STRATEGY_VERSION));

  if (ingestionMode === 'RESUME' && relevantChunks.length > 0) {
    logger.ingestion(`[PAGE_LEVEL][RESUME_LOGIC] Found ${relevantChunks.length} chunks.Resuming...`);
  } else {
    logger.ingestion(`[PAGE_LEVEL] No valid cache found.Starting from scratch.`);
  }

  // 🔒 RESUME INVARIANT (EDUVA v7)
  const hasChunks = relevantChunks.length > 0;
  const allChunksCompleted = hasChunks && relevantChunks.every(c => c.status === 'COMPLETED');

  if (allChunksCompleted) {
    logger.ingestion("[PAGE_LEVEL] All chunks previously completed. Returning cached atoms.");
    // Ensure global staging triggers if missed
    await sealDocumentStatus(user.id, docFingerprint, log);
    const finalAtoms = await getLocalAtoms(user.id, docFingerprint);
    return finalAtoms.map(a => a.core);
  }

  // 4. Text-First Extraction (Memory Only)
  // ONLY REACHED IF WORK REMAINS
  log("[PAGE_LEVEL] Extracting plain text layers...");

  // 💾 PDF CACHE CHECK (Issue 4 fix): Avoid re-extracting on retry
  let batches: { text: string; pageStart: number; pageEnd: number }[];
  const cached = pdfTextCache.get(docFingerprint);
  if (cached && (Date.now() - cached.createdAt) < PDF_CACHE_TTL_MS) {
    logger.ingestion(`[PAGE_LEVEL][PDF_CACHE] ⚡ Cache hit. Skipping PDF re-extraction.`);
    batches = cached.batches;
  } else {
    batches = await getPdfTextBatches(sourcePdf, BATCH_SIZE_PAGES);
    pdfTextCache.set(docFingerprint, { batches, createdAt: Date.now() });
    logger.ingestion(`[PAGE_LEVEL][PDF_CACHE] 📎 PDF text cached for session.`);
  }

  logger.ingestion('[PAGE_LEVEL] [DEBUG] PDF extraction result', { batches: batches.length });

  // 🔒 MANDATORY INVARIANT: Extraction Failure Guard
  if (batches.length === 0) {
    throw new Error('[PAGE_LEVEL] PDF text extraction failed. No text was produced.');
  }

  const tasks: { chunk: ChunkState, text: string }[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const chunkId = `chunk_${docFingerprint}_${i}_${CHUNK_STRATEGY_VERSION} `;

    // Check if we already processed this
    let state = relevantChunks.find(c => c.id === chunkId);

    if (!state) {
      // Create New State
      state = {
        id: chunkId,
        docFingerprint: docFingerprint,
        batchIndex: i,
        status: 'PENDING',
        retryCount: 0,
        atomCount: 0,
        updatedAt: Date.now(),
        pageStart: batch.pageStart,
        pageEnd: batch.pageEnd
      };
      await idb.put('chunks', state);
    }

    // 🔒 STALL RECOVERY: If stalled (>2m), explicitly fail it so we can retry cleanly
    if (state.status === 'PROCESSING' && (Date.now() - (state.updatedAt || 0) > 120000)) {
      logger.ingestion(`[PAGE_LEVEL][RESUME_LOGIC] Marking stalled chunk ${chunkId} as FAILED.`);
      state.status = 'FAILED';
      state.error = 'Stalled (Timeout)';
      await idb.put('chunks', state);
    }

    // Resume Condition: Only process if NOT completed
    if (state.status !== 'COMPLETED') {
      tasks.push({ chunk: state, text: batch.text });
    } else {
      log(`[PAGE_LEVEL] Skipping Batch ${i + 1} (Already Completed)`);
    }
  }

  if (tasks.length === 0) {
    logger.ingestion("[PAGE_LEVEL] All chunks previously completed. Returning cached atoms.");
    // Even if no tasks, we trigger seal to ensure global staging happens if missed previously
    await sealDocumentStatus(user.id, docFingerprint, log);
    return (await getLocalAtoms(user.id, docFingerprint)).map(a => a.core);
  }

  // 6. Language Pre-Detection (v2.0: AI-Powered, One-Shot)
  // This cheap call (~100 tokens) detects the predominant language ONCE,
  // then injects it as a hard directive into every chunk's prompt.
  // This guarantees 100% language consistency across all parallel chunks.
  let detectedLanguage = req.language || 'English';
  try {
    const sampleText = tasks.slice(0, 2).map(t => t.text).join('\n').substring(0, 2000);
    const { ai: langAi, apiKey: langKey } = getAiClient('ingestion', onStatus);
    logger.ingestion(`[PAGE_LEVEL][LANG_DETECT] Detecting predominant language...`);

    const langResult = await callAiWithRetry(langAi, {
      contents: [{ role: 'user', parts: [{ text: `What is the predominant language of the EDUCATIONAL CONTENT in this text? Ignore English headers, labels, or metadata. Reply with ONLY the language name (e.g., "French", "Arabic", "English").\n\nTEXT SAMPLE:\n${sampleText}` }] }],
      config: {
        maxOutputTokens: 20,
        temperature: 0.0,
      }
    }, 'ingestion', [], langKey);

    const rawLang = (langResult.text || '').trim().replace(/[^a-zA-Z\u0600-\u06FF]/g, '');
    if (rawLang.length > 0 && rawLang.length < 30) {
      detectedLanguage = rawLang;
    }
    logger.ingestion(`[PAGE_LEVEL][LANG_DETECT] ✅ Detected: "${detectedLanguage}"`);
    console.log(`%c[LANG_DETECT] Predominant Language: ${detectedLanguage}`, 'background: #065f46; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;');
  } catch (langErr) {
    // v1.6: Subject-Aware Fallback
    // If detection fails, use the normalized subject as a hint (e.g., Arabic, French)
    // instead of defaulting to English, which causes prompt confusion.
    const fallbackHint = (req.subject || '').toLowerCase();
    if (fallbackHint.includes('arabic')) detectedLanguage = 'Arabic';
    else if (fallbackHint.includes('french') || fallbackHint.includes('frensh')) detectedLanguage = 'French';
    else if (fallbackHint.includes('english')) detectedLanguage = 'English';

    logger.warn('INGESTION', `[PAGE_LEVEL][LANG_DETECT] ⚠️ Detection failed, using fallback: "${detectedLanguage}"`, langErr);
  }

  // v1.3: Use subject-based prompt resolver
  console.log(`[PROMPT_DEBUG] Calling resolver with subject: "${req.subject}"`);
  const selectedPrompt = resolveAtomExtractionPrompt(req.subject);

  // v1.5: Subject Normalization (Helping the AI identify Predominant Language)
  const normalizedSubject = req.subject
    .replace(/frensh/i, 'French')
    .replace(/arabic/i, 'Arabic')
    .replace(/english/i, 'English')
    .replace(/science/i, 'Science');

  // Detect which prompt was returned
  const promptName = selectedPrompt.includes('SCIENCE KNOWLEDGE AUTHORING')
    ? 'ATOM_EXTRACTION_SCIENCE'
    : selectedPrompt.includes('TASK-FIRST EXTRACTION RULE')
      ? 'ATOM_EXTRACTION_ENGLISH'
      : (selectedPrompt.includes('Master Teacher') &&
        (selectedPrompt.includes('MANDATORY OUTPUT LANGUAGE') || selectedPrompt.includes('STRICT LANGUAGE MIRRORING')))
        ? 'ATOM_EXTRACTION_DEFAULT'
        : 'UNKNOWN_PROMPT';

  console.log(`[PROMPT_DEBUG] Resolved to: ${promptName}`);
  logger.info('INGESTION', `[PROMPT] Using: ${promptName}`, { subject: req.subject });

  const masterInstruction = selectedPrompt
    .replace('${gradeLevel}', user.preferences.defaultYear || 'Grade 10')
    .replace('${subject}', normalizedSubject)
    .replace('${docFingerprint}', docFingerprint)
    .replace('${maxAtoms}', '10')
    .replace(/\$\{language\}/g, detectedLanguage);

  logger.ingestion(`[PAGE_LEVEL] Processing ${tasks.length} pending batches with 2x Concurrency.`);

  // 5. Bounded Parallelism (Concurrency = 2)
  const CONCURRENCY_LIMIT = 2;

  logger.ingestion(`[PAGE_LEVEL][RESUME_LOGIC] Resuming extraction for ${tasks.length} chunks(${relevantChunks.length - tasks.length} already completed).`);
  logger.ingestion(`[PAGE_LEVEL] Processing ${tasks.length} pending batche(s) with ${CONCURRENCY_LIMIT}x Concurrency.`);

  for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
    const batchGroup = tasks.slice(i, i + CONCURRENCY_LIMIT);

    // 🛡️ Issue 3 Fix: Use Promise.allSettled instead of Promise.all
    // This allows healthy sibling chunks to complete even if one fails.
    // Previously: one failure killed the whole batch including in-flight siblings.
    const results = await Promise.allSettled(batchGroup.map(async (task, idx) => {
      if (idx > 0) await new Promise(r => setTimeout(r, 500 * idx));
      await processChunk(task.chunk, task.text, user, masterInstruction, docFingerprint, req, promptName, onStatus);
      await sealDocumentStatus(user.id, docFingerprint, log);
    }));

    // Log any failures, but continue processing remaining batches
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      failures.forEach(f => {
        logger.error('INGESTION', '[PAGE_LEVEL] Chunk failed (siblings continued):', (f as PromiseRejectedResult).reason);
      });
      // If ALL chunks in this batch group failed, abort the remaining batches
      if (failures.length === batchGroup.length) {
        logger.error('INGESTION', '[PAGE_LEVEL] All chunks in batch group failed. Aborting remaining batches.');
        break;
      }
    }

    if (i + CONCURRENCY_LIMIT < tasks.length) await new Promise(r => setTimeout(r, 500));
  }

  const finalAtoms = await getLocalAtoms(user.id, docFingerprint);
  return finalAtoms.map(a => a.core);
};
