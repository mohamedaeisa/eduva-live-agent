import { Type } from "@google/genai";
import {
  GenerationRequest, AtomCore, UserProfile, ChunkState, LocalTrainingSource
} from '../../types';
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
import { resolveAtomExtractionPrompt } from '../../constants';

// v1.3: Non-Breakable Ingestion
import { classifyError, FailureType, getRetryDelay, isTerminal } from '../ingestion/errorClassifier';
import {
  updateLedgerFromChunks,
  createLedger,
  getLedger,
  markPdfExtracted
} from '../ingestion/ledgerService';

const BATCH_SIZE_PAGES = 15;
const SYNTHESIS_TIMEOUT_MS = 180000;
const CHUNK_STRATEGY_VERSION = "v7_text";

// Helper to clean AI output (strip Markdown code blocks)
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
            required: ['fullExplanation', 'analogy', 'misconceptions']
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
  promptName: string,  // NEW: For logging which prompt is used
  onStatus?: (msg: string) => void
): Promise<AtomCore[]> => {
  const log = (msg: string) => onStatus?.(`[CHUNK_${chunk.batchIndex + 1}] ${msg}`);
  const idb = await getDB();

  // Persistence: Update State to PROCESSING
  chunk.status = 'PROCESSING';
  chunk.updatedAt = Date.now();
  await idb.put('chunks', chunk);

  const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
  const userPrompt = `TASK: Extract atoms for pages ${chunk.pageStart}-${chunk.pageEnd}. FINGERPRINT: ${docFingerprint}.`;

  try {

    log(`Sending text payload (${textContent.length} chars) to AI...`);
    logger.ingestion(`Processing Chunk ${chunk.batchIndex + 1}`, {
      start: chunk.pageStart,
      end: chunk.pageEnd,
      textLen: textContent.length,
      prompt: userPrompt
    });

    // AI Call: TEXT ONLY, Temperature 0.0, Thinking Budget 4096
    const response = await Promise.race([
      callAiWithRetry(ai, {
        contents: [
          { role: 'user', parts: [{ text: userPrompt + `\n\nCONTEXT:\n${textContent}` }] }
        ],
        config: {
          systemInstruction: masterInstruction,
          responseMimeType: 'application/json',
          responseSchema: ATOM_EXTRACTION_SCHEMA,
          temperature: config.temperature,
          topP: config.topP,
          topK: config.topK,
          maxOutputTokens: config.maxOutputTokens,
          // @ts-ignore - thinkingConfig is valid for Gemini 3
          thinkingConfig: { thinkingBudget: 4096 }
        }
      }, 'ingestion', [], apiKey),
      new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), SYNTHESIS_TIMEOUT_MS))
    ]) as any;

    const rawText = response.text || '';
    const cleanedText = cleanJson(rawText);

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      logger.error('INGESTION', "[ATOM_PIPELINE] JSON Parse Failure", e);
      logger.error('INGESTION', "Failed Payload: " + cleanedText.substring(0, 500) + "...");
      throw new Error("AI returned malformed JSON");
    }

    const rawAtoms = Array.isArray(parsed.atoms) ? parsed.atoms : [];
    logger.ingestion(`Raw Atoms Received: ${rawAtoms.length} for Chunk ${chunk.batchIndex + 1}`);

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
        const narrativeSequence = narrativeBase + idx;
        // Deterministic ID: Fingerprint + Concept + Sequence
        const atomId = await sha256(`${docFingerprint}:${sanitized.metadata.conceptTag}:${narrativeSequence}`);

        return {
          atomId,
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
        } as AtomCore;
      } catch (e) {
        logger.error('INGESTION', "[ATOM_PIPELINE] Skipping invalid atom", e);
        return null;
      }
    }))).filter(a => a !== null) as AtomCore[];

    // ATOM COMMIT PHASE
    if (processedAtoms.length > 0) {
      log(`Committing ${processedAtoms.length} atoms to storage...`);
      await saveAtoms(processedAtoms, 'notes');
      logger.ingestion(`[ATOM_COMMIT] Successfully saved ${processedAtoms.length} atoms for chunk ${chunk.batchIndex}`);
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
    // v1.3: Classify error to determine recovery strategy
    const failureType = classifyError(err);
    logger.error('INGESTION', "[CHUNK_PROCESS_ERROR]", { error: err.message, type: failureType });

    // 🔒 HARD RULE: Different handling based on failure type
    if (failureType === FailureType.EXTERNAL_QUOTA) {
      chunk.status = 'PAUSED_QUOTA';
      chunk.retryAfter = Date.now() + getRetryDelay(failureType);
      chunk.error = 'Quota exhausted. Scheduled for retry.';
      logger.ingestion(`[PAUSED] Chunk ${chunk.batchIndex} waiting for quota reset`);
    } else if (failureType === FailureType.TRANSIENT_TIMEOUT) {
      chunk.status = 'FAILED_TRANSIENT';
      chunk.retryCount = (chunk.retryCount || 0) + 1;
      chunk.error = err.message;
      logger.ingestion(`[TRANSIENT] Chunk ${chunk.batchIndex} will auto-retry`);
    } else if (isTerminal(failureType)) {
      // 🔒 TERMINAL: FAILED_LOGIC or FATAL - never auto-retry
      chunk.status = 'FAILED_LOGIC';
      chunk.error = err.message;
      logger.error('INGESTION', `[TERMINAL] Chunk ${chunk.batchIndex} failed with logic error - needs investigation`);
    } else {
      chunk.status = 'FAILED';
      chunk.error = err.message;
    }

    chunk.failureType = failureType;
    chunk.updatedAt = Date.now();
    await idb.put('chunks', chunk);

    // Update ledger to reflect chunk state change
    await updateLedgerFromChunks(docFingerprint);

    // 🔒 Only throw for terminal failures - external failures are handled gracefully
    if (isTerminal(failureType)) {
      throw err;
    }
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
      log("[FINALIZATION] Document analysis complete. Initiating Global Staging...");
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
          log(`[FINALIZATION] ${coreAtoms.length} atoms staged for global review.`);
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
    log(`[SEAL] Progress: ${progressPercent}%`);
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
    const recovered = await getLibraryItemByContentId(contentKey, auth.currentUser.uid);
    if (recovered && recovered.data) { activePdf = recovered.data; }
  }

  let contentId = contentKey;
  if ((!contentId || contentId === 'GLOBAL') && activePdf) {
    contentId = await computeDocFingerprint(activePdf);
  } else if (!contentId || contentId === 'GLOBAL') {
    contentId = await sha256(`TOPIC:${req.topic}:${req.language}`);
  }

  logger.ingestion("Ensuring Atoms", { contentId, hasPdf: !!activePdf });

  log("Scanning Intelligent Cache...");
  const atomsInCache = await getAtomsForContent(contentId, 'notes');
  const completedMarkers = await getCompletedChunks(contentId, 'notes');

  if (atomsInCache.length > 0 && completedMarkers.length >= 1) {
    log("Neural Link Established (v7 Cache Hit).");
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
  log("Executing Topic-Based Extraction (T=0.0)...");
  const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
  const modelToUse = config.defaultModel;

  const userId = auth.currentUser?.uid || 'anonymous';
  const userGrade = req.year || 'Grade 10';

  // v1.3: Use subject-based prompt resolver
  console.log(`[PROMPT_DEBUG] Calling resolver with subject: "${req.subject}"`);
  const selectedPrompt = resolveAtomExtractionPrompt(req.subject);

  // Detect which prompt was returned
  const promptName = selectedPrompt.includes('Master Teacher') && selectedPrompt.includes('STRICT LANGUAGE MIRRORING')
    ? 'ATOM_EXTRACTION_DEFAULT'
    : selectedPrompt.includes('TASK-FIRST EXTRACTION RULE')
      ? 'ATOM_EXTRACTION_ENGLISH'
      : 'UNKNOWN_PROMPT';

  console.log(`[PROMPT_DEBUG] Resolved to: ${promptName}`);
  logger.info('INGESTION', `[PROMPT] Using: ${promptName}`, { subject: req.subject });

  const masterInstruction = selectedPrompt
    .replace(/\$\{gradeLevel\}/g, userGrade)
    .replace(/\$\{subject\}/g, req.subject)
    .replace(/\$\{language\}/g, req.language)
    .replace(/\$\{docFingerprint\}/g, contentId)
    .replace(/\$\{maxAtoms\}/g, '10');

  log(`Synthesizing core knowledge for: ${req.topic}...`);
  logger.ingestion("Generating from Topic (No PDF)");

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

    return {
      ...a,
      atomId: await sha256(`${contentId}:${a.metadata.conceptTag}:${i}`),
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
      }
    };
  }));

  await saveAtoms(processedAtoms, 'notes');
  await saveChunkStatus({ id: `${contentId}_notes_1`, contentId, feature: 'notes', chunkIndex: 1, status: 'COMPLETE' });

  return { contentId, isCacheHit: false };
};

export const extractAtomsFromDocument = async (
  req: GenerationRequest,
  user: UserProfile,
  onStatus?: (msg: string) => void
): Promise<AtomCore[]> => {
  const log = (msg: string) => onStatus?.(msg);

  // 1. Resolve Source PDF (Memory Only)
  let sourcePdf = req.studyMaterialFile;
  const contentKey = req.studyMaterialUrl || req.contentId || 'GLOBAL';

  // Attempt recovery from Library if missing in request (e.g. from UI retry)
  if (!sourcePdf && contentKey !== 'GLOBAL' && auth.currentUser) {
    // Logic for retrieving transient data if available
  }

  if (!sourcePdf) throw new Error("Source missing. Please re-upload PDF to resume extraction.");

  // 2. Identity & Fingerprint
  const docFingerprint = await computeDocFingerprint(sourcePdf);
  logger.ingestion(`Document Fingerprint: ${docFingerprint}`);
  const idb = await getDB();

  // v1.3: Ensure ledger exists
  let ledger = await getLedger(docFingerprint);
  if (!ledger) {
    ledger = await createLedger({
      docFingerprint,
      subject: req.subject,
      language: req.language,
      userId: user.id
    });
    logger.ingestion(`[LEDGER] Created for ${docFingerprint}`);
  }

  // 3. Resume Logic: Load existing ChunkStates
  const existingChunks = await idb.getAllFromIndex('chunks', 'by_doc', docFingerprint);
  // Filter for current version to avoid schema mismatch
  const relevantChunks = existingChunks.filter(c => c.id.includes(CHUNK_STRATEGY_VERSION));
  logger.ingestion(`Found ${relevantChunks.length} existing chunks in cache.`);

  // 🔒 RESUME INVARIANT (EDUVA v7)
  const hasChunks = relevantChunks.length > 0;
  const allChunksCompleted = hasChunks && relevantChunks.every(c => c.status === 'COMPLETED');

  if (allChunksCompleted) {
    logger.ingestion("All chunks previously completed. Returning cached atoms.");
    // Ensure global staging triggers if missed
    await sealDocumentStatus(user.id, docFingerprint, log);
    const finalAtoms = await getLocalAtoms(user.id, docFingerprint);
    return finalAtoms.map(a => a.core);
  }

  // 4. Text-First Extraction (Memory Only)
  // ONLY REACHED IF WORK REMAINS
  log("Extracting plain text layers...");
  const batches = await getPdfTextBatches(sourcePdf, BATCH_SIZE_PAGES);

  logger.ingestion('[DEBUG] PDF extraction result', { batches: batches.length });

  // 🔒 MANDATORY INVARIANT: Extraction Failure Guard
  if (batches.length === 0) {
    throw new Error('[INGESTION] PDF text extraction failed. No text was produced.');
  }

  // v1.3: Mark PDF as extracted and set totalChunks (immutable after this)
  if (ledger && ledger.totalChunks === 0) {
    await markPdfExtracted(docFingerprint, batches.length);
    logger.ingestion(`[LEDGER] PDF extracted: ${batches.length} chunks`);
  }

  const tasks: { chunk: ChunkState, text: string }[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const chunkId = `chunk_${docFingerprint}_${i}_${CHUNK_STRATEGY_VERSION}`;

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

    // Resume Condition: Only process if NOT completed
    if (state.status !== 'COMPLETED') {
      tasks.push({ chunk: state, text: batch.text });
    } else {
      log(`Skipping Batch ${i + 1} (Already Completed)`);
    }
  }

  if (tasks.length === 0) {
    logger.ingestion("All chunks previously completed. Returning cached atoms.");
    // Even if no tasks, we trigger seal to ensure global staging happens if missed previously
    await sealDocumentStatus(user.id, docFingerprint, log);
    return (await getLocalAtoms(user.id, docFingerprint)).map(a => a.core);
  }

  // v1.3: Use subject-based prompt resolver
  console.log(`[PROMPT_DEBUG] Calling resolver with subject: "${req.subject}"`);
  const selectedPrompt = resolveAtomExtractionPrompt(req.subject);

  // Detect which prompt was returned
  const promptName = selectedPrompt.includes('Master Teacher') && selectedPrompt.includes('STRICT LANGUAGE MIRRORING')
    ? 'ATOM_EXTRACTION_DEFAULT'
    : selectedPrompt.includes('TASK-FIRST EXTRACTION RULE')
      ? 'ATOM_EXTRACTION_ENGLISH'
      : 'UNKNOWN_PROMPT';

  console.log(`[PROMPT_DEBUG] Resolved to: ${promptName}`);
  logger.info('INGESTION', `[PROMPT] Using: ${promptName}`, { subject: req.subject });

  const masterInstruction = selectedPrompt
    .replace(/\$\{gradeLevel\}/g, user.preferences.defaultYear || 'Grade 10')
    .replace(/\$\{subject\}/g, req.subject)
    .replace(/\$\{language\}/g, req.language)
    .replace(/\$\{docFingerprint\}/g, docFingerprint)
    .replace(/\$\{maxAtoms\}/g, '10');

  logger.ingestion(`Processing ${tasks.length} pending batches with 2x Concurrency.`);


  // 5. Bounded Parallelism (Concurrency = 2)
  const CONCURRENCY_LIMIT = 2;
  let failed = false;

  for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
    if (failed) break;

    const batchGroup = tasks.slice(i, i + CONCURRENCY_LIMIT);

    try {
      await Promise.all(batchGroup.map(async (task) => {
        if (failed) return;
        try {
          await processChunk(task.chunk, task.text, user, masterInstruction, docFingerprint, req, promptName, onStatus);
          await sealDocumentStatus(user.id, docFingerprint, log);
        } catch (e) {
          failed = true;
          throw e;
        }
      }));

      if (i + CONCURRENCY_LIMIT < tasks.length) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      log(`Sequence Aborted due to failure.`);
      logger.error('INGESTION', `Batch execution failed.`, e);
      break;
    }
  }

  const finalAtoms = await getLocalAtoms(user.id, docFingerprint);

  // v1.3: Final ledger update to ensure completion state is accurate
  await updateLedgerFromChunks(docFingerprint);

  return finalAtoms.map(a => a.core);
};
