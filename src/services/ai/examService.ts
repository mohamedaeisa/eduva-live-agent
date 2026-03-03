
import { Type } from "@google/genai";
import {
  type ExamIntent,
  type ExamBlueprint,
  type ExamSession,
  type ExamItem,
  type UserProfile,
  type ExamMode,
  Difficulty
} from '../../types';
import { getLocalAtoms, getRecentExamAtomUsage } from '../storageService';
import { hydrateAtomList, fetchAtomsForSession, fetchGlobalAtomsBySubject } from '../hydrationService';
import { sha256 } from '../../utils/hashUtils';
import { getAiClient, callAiWithRetry } from './client';
import { AI_MODELS } from './constants';

const BLOOM_SCALE: Record<string, number> = {
  'RECALL': 1,
  'APPLICATION': 2,
  'ANALYSIS': 3,
  'EVALUATION': 4,
  'CREATION': 5
};

const DIFFICULTY_SCALE: Record<string, number> = {
  'LOW': 1,
  'MEDIUM': 2,
  'HIGH': 3
};

// ------------------------------------------------------------------
// 0. SCHEMA DEFINITIONS (V2 LOCKED)
// ------------------------------------------------------------------

const EXAM_QUESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    atomId: { type: Type.STRING },
    questionText: { type: Type.STRING },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    correctAnswerIndex: { type: Type.NUMBER }
  },
  required: ["atomId", "questionText", "options", "correctAnswerIndex"]
};

// V3 BATCH SCHEMA
const EXAM_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    batchId: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          atomId: { type: Type.STRING },
          questionText: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswerIndex: { type: Type.NUMBER },
          status: { type: Type.STRING, enum: ["SUCCESS", "FAILED"], description: "Defaults to SUCCESS. Set to FAILED if generation is impossible." },
          reason: { type: Type.STRING }
        },
        required: ["atomId", "questionText", "options", "correctAnswerIndex"]
      }
    }
  },
  required: ["batchId", "questions"]
};

// ------------------------------------------------------------------
// 1. INTENT MAPPING (PURE DATA LAYER)
// ------------------------------------------------------------------

export const IntentToAtomProfileMap: Record<ExamIntent, {
  tags: string[];
  bloomLevel: 'RECALL' | 'APPLICATION' | 'ANALYSIS';
  preferredType: 'MCQ' | 'TEXT' | 'SCENARIO';
}> = {
  'CORE_KNOWLEDGE': {
    tags: ['definition', 'concept', 'structure'],
    bloomLevel: 'RECALL',
    preferredType: 'MCQ'
  },
  'APPLICATION': {
    tags: ['application', 'problem-solving', 'usage'],
    bloomLevel: 'APPLICATION',
    preferredType: 'SCENARIO'
  },
  'EXPERIMENTAL_METHODOLOGY': {
    tags: ['experiment', 'method', 'procedure', 'analysis'],
    bloomLevel: 'ANALYSIS',
    preferredType: 'TEXT'
  },
  'DATA_INTERPRETATION': {
    tags: ['data', 'graph', 'chart', 'trend'],
    bloomLevel: 'ANALYSIS',
    preferredType: 'MCQ'
  }
};

interface ResolveQueryInput {
  intent: ExamIntent;
  subjectFromSource?: string;
}

export const resolveAtomQuery = (input: ResolveQueryInput) => {
  const profile = IntentToAtomProfileMap[input.intent];
  return {
    tags: profile.tags,
    bloom: profile.bloomLevel,
    type: profile.preferredType
  };
};

// ------------------------------------------------------------------
// 2. BLUEPRINT GENERATOR (DETERMINISTIC ARCHITECT)
// ------------------------------------------------------------------

interface BlueprintConfig {
  durationMinutes: number;
  difficulty?: 'LOW' | 'MEDIUM' | 'HIGH';
  mode?: ExamMode;
}

export const generateBlueprint = async (
  source: { type: 'SUBJECT' | 'MATERIAL', id: string, title: string },
  intents: ExamIntent[],
  config: BlueprintConfig
): Promise<ExamBlueprint> => {
  const totalQuestions = Math.min(60, Math.max(10, Math.floor(config.durationMinutes / 1.5)));
  const blueprintId = `bp_${await sha256(`${source.id}_${intents.join('')}_${config.durationMinutes}`)}`;

  const sections = intents.map((intent, index) => {
    const profile = IntentToAtomProfileMap[intent];
    const sectionCount = Math.floor(totalQuestions / intents.length);
    const marks = profile.bloomLevel === 'ANALYSIS' ? 5 : (profile.bloomLevel === 'APPLICATION' ? 3 : 1);

    return {
      id: `sect_${index}_${intent}`,
      title: `Section ${String.fromCharCode(65 + index)}: ${intent.replace(/_/g, ' ')}`,
      description: `Focus on ${profile.tags.join(', ')}`,
      atomProfile: {
        type: profile.preferredType,
        tags: profile.tags,
        bloomLevel: profile.bloomLevel,
        complexity: config.difficulty || 'MEDIUM'
      },
      count: sectionCount,
      marksPerQuestion: marks
    };
  });

  const allocated = sections.reduce((sum, s) => sum + s.count, 0);
  if (allocated < totalQuestions && sections.length > 0) {
    sections[0].count += (totalQuestions - allocated);
  }

  const totalMarks = sections.reduce((sum, s) => sum + (s.count * s.marksPerQuestion), 0);

  return {
    id: blueprintId,
    sourceType: source.type,
    sourceId: source.id,
    intent: intents,
    title: `${source.title} - ${config.difficulty || 'Standard'} Exam`,
    mode: config.mode || 'STANDARD',
    config: {
      durationMinutes: config.durationMinutes,
      allowBacktracking: true
    },
    sections,
    totalMarks,
    totalQuestions
  };
};

// ------------------------------------------------------------------
// 3. SKELETON FACTORY (STREAM & FREEZE ARCHITECTURE)
// ------------------------------------------------------------------

import { logger } from '../../utils/logger'; // Import Logger

// ... (rest of imports)

// ...

// ------------------------------------------------------------------
// 3. SKELETON FACTORY (STREAM & FREEZE ARCHITECTURE)
// ------------------------------------------------------------------

/**
 * Creates the Exam Skeleton.
 * Locks the Atom Sequence and creates items in 'PENDING' state.
 * Returns immediately (<200ms).
 */
export const createExamSkeleton = async (
  blueprint: ExamBlueprint,
  user: UserProfile
): Promise<ExamSession> => {
  logger.exam(`[Skeleton] Creating Exam Skeleton`, { blueprintId: blueprint.id, source: blueprint.sourceId });

  const items: ExamItem[] = [];
  let globalOrderIndex = 1;



  // 1. Resolve Atoms (Allocated Pool) - V2 GLOBAL HYDRATION
  const startLoad = Date.now();
  let sourceAtoms: any[] = []; // Initialized once here

  if (blueprint.sourceType === 'MATERIAL') {
    const fileIds = blueprint.sourceId.split(',');

    // TIER 1 & 2: Local Check + Global Hydration (Per File)
    const atomPromises = fileIds.map(async (fid) => {
      const id = fid.trim();
      // 1. Try Local Fast Path
      const local = await getLocalAtoms(user.id, id);
      if (local && local.length > 0) return local.map(a => a.core);

      // 2. Global Fallback (Network)
      logger.exam(`[Skeleton] Local miss for ${id}. Attempting Global Hydration...`);
      const hydration = await fetchAtomsForSession(user.id, id);
      if (hydration.status === 'ready') return hydration.atoms;

      return [];
    });

    const results = await Promise.all(atomPromises);
    sourceAtoms = results.flat();

  } else {
    // SUBJECT-BASED EXAM
    // 1. Try Local
    const allLocal = await getLocalAtoms(user.id);
    sourceAtoms = allLocal.map(a => a.core).filter(a =>
      a.metadata?.subject?.toLowerCase().includes(blueprint.sourceId.toLowerCase()) ||
      blueprint.sourceId === 'General'
    );

    // 2. Global Fallback if Local is Empty
    if (sourceAtoms.length === 0 && blueprint.sourceId !== 'General') {
      logger.exam(`[Skeleton] No local atoms for ${blueprint.sourceId}. Attempting Global Hydration...`);

      const hydration = await fetchGlobalAtomsBySubject(
        user.id,
        blueprint.sourceId,
        {
          educationSystem: user.preferences?.defaultCurriculum,
          grade: user.preferences?.defaultYear,
          language: user.preferences?.defaultLanguage
        }
      );

      if (hydration.status === 'ready') {
        sourceAtoms = hydration.atoms;
        logger.exam(`[Skeleton] Hydrated ${sourceAtoms.length} atoms from Global Grid (${user.preferences?.defaultCurriculum}/${user.preferences?.defaultYear}).`);
      }
    }
  }

  logger.exam(`[Skeleton] Source Atoms Resolved: ${sourceAtoms.length} (Duration: ${Date.now() - startLoad}ms)`);

  // 1.5 Fetch Exam History for Rotation (New V1 Logic)
  let recentUsage = new Set<string>();
  try {
    // Lookback 5 exams to ensure rotation
    const history = await getRecentExamAtomUsage(user.id, blueprint.sourceId, 5);
    recentUsage = history.usedAtomIds;
    logger.exam(`[Skeleton] History Loaded: ${recentUsage.size} recently used atoms. (Exclusion List: ${Array.from(recentUsage).slice(0, 5).join(', ')}...)`);
  } catch (e) {
    console.warn("[Skeleton] Failed to load exam history, defaulting to zero-knowledge.", e);
  }

  // 2. Allocation
  const usedAtomIds = new Set<string>();

  for (const section of blueprint.sections) {
    const candidates = sourceAtoms.filter(atom => {
      if (usedAtomIds.has(atom.atomId)) return false;

      // ELASTIC ELIGIBILITY RULES (V2 FIX)
      const sectionIntent = section.id.split('_').slice(2).join('_') as ExamIntent;
      const sectionBloom = BLOOM_SCALE[section.atomProfile.bloomLevel] || 1;
      const atomBloom = atom.assessmentMetadata?.highestBloomObserved || 1;

      const sectionDiff = DIFFICULTY_SCALE[section.atomProfile.complexity] || 2;
      const atomDiff = atom.assessmentMetadata?.difficultyCeiling || 3; // Default to high capacity

      // 1. Elastic Bloom: Atom must support the section's cognitive load
      // EXCEPTION: Core Knowledge (Recall) accepts everything as it is foundational
      if (atomBloom < sectionBloom) {
        return sectionIntent === 'CORE_KNOWLEDGE';
      }

      // 2. Advisory Tags (Bonus only, NOT BLOCKING)
      // We removed the strict tag filter here. The Blueprint "Focus on..." is a guide for the AI, 
      // but the Skeleton Allocator should be permissive to ensure content coverage.

      return true;
    });

    // 3. Mode-Based Selection Logic (V1 Modes)
    const mode = blueprint.mode || 'STANDARD';

    // A. Filter by History (Rotation)
    const historyFiltered = candidates.filter(a => !recentUsage.has(a.atomId));

    if (candidates.length - historyFiltered.length > 0) {
      logger.exam(`[Skeleton] Section ${section.id}: Filtered ${candidates.length - historyFiltered.length} recently used atoms.`);
    }

    // Graceful Degradation: If we filter too aggressively and run out, fallback to full pool
    let finalPool = historyFiltered.length >= section.count ? historyFiltered : candidates;

    if (finalPool !== historyFiltered) {
      logger.exam(`[Skeleton] Section ${section.id}: History filter exhausted pool. Falling back to full candidates.`);
    }

    // B. Weighting Function
    const getAtomWeight = (atom: any) => {
      // Mastery: 0.0 to 1.0 (default 0.5)
      const masteryMap = user.gamification?.masteryMap || {};
      const mastery = masteryMap[atom.atomId] ?? 0.5;

      let weight = 0;

      // Base entropy (0-15) to ensure some randomness even with identical mastery
      weight += Math.random() * 15;

      if (mode === 'PRACTICE') {
        // Weakness Bias: Lower mastery = Higher weight
        // (1 - mastery) * 100 -> Weakest gets +100
        weight += (1 - mastery) * 100;
      } else if (mode === 'CHALLENGE') {
        // Mastery Bias: Higher mastery = Higher weight (Test what you know harder)
        // PLUS Difficulty Bias
        const diff = atom.assessmentMetadata?.difficultyCeiling || 1;
        weight += (mastery * 30);
        weight += (diff * 20);
      } else if (mode === 'ADAPTIVE') {
        // Balanced: Target 0.4-0.6 range (Zone of Proximal Development)
        const distFromEdge = 0.5 - Math.abs(mastery - 0.5); // Peak at 0.5
        weight += distFromEdge * 100;
      } else {
        // STANDARD: Light bias towards weakness but mostly balanced
        weight += (1 - mastery) * 30;
      }

      return weight;
    };

    // C. Weighted Sort
    if (mode === 'STANDARD') {
      // Standard is pure shuffle (with history rotation above)
      // Actually, let's keep the light weighting for "Intelligent Standard" or just pure random?
      // User requested: "Standard: Random/Mixed". 
      // Let's use pure shuffle for Standard to ensure credibility of "randomness".
      finalPool.sort(() => Math.random() - 0.5);
    } else {
      // Sort by calculated weight descending
      finalPool.sort((a, b) => getAtomWeight(b) - getAtomWeight(a));
    }

    const selected = finalPool.slice(0, section.count);

    const realCount = selected.length;

    // Bunker Fill: REMOVED (Strict Content Only)
    // If we don't have enough content, we simply return fewer questions.
    // This communicates scarcity to the user rather than showing "Mock" junk.
    if (selected.length < section.count) {
      logger.exam(`[Skeleton] Section ${section.id} partial fill: ${selected.length}/${section.count} available items.`);
    }

    // Log Allocation Details
    logger.exam(`[Skeleton] Section ${section.id} Allocated: ${selected.length} items.`);
    logger.exam(`[Skeleton] Selected Atoms: [${selected.map(a => a.atomId).join(', ')}]`);

    for (const atom of selected) {
      usedAtomIds.add(atom.atomId);
      items.push({
        order: globalOrderIndex++,
        atomId: atom.atomId,
        sectionId: section.id,
        // LOCK THE ATOM SNAPSHOT
        atomSnapshot: atom,
        status: 'PENDING',
        flags: { flaggedForReview: false, timeSpentMs: 0, interactionCount: 0 }
      });
    }
  }

  return {
    id: `sess_${Date.now()}_${blueprint.id}`,
    blueprint,
    studentId: user.id,
    startedAt: Date.now(),
    status: 'INITIATED',
    items,
    eiAuditLog: []
  };
};

// ------------------------------------------------------------------
// 4. MATERIALIZATION WORKER (AI RENDERER)
// ------------------------------------------------------------------

/**
 * Gate to prevent system atoms (placeholders) from leaking into AI.
 */
const isEligibleExamAtom = (atom: any): boolean => {
  if (!atom) return false;
  // 1. Check ID Pattern
  if (typeof atom.atomId === 'string' && atom.atomId.startsWith('mock_')) return false;
  // 2. Check Metadata Marker
  if (atom.metadata?.conceptTag === 'Exam Placeholder') return false;
  // 3. Robustness
  if (!atom.coreRepresentation?.definition && !atom.coreRepresentation?.text) return false;

  return true;
};

/**
 * Materializes a single item using the Locked V2 Prompt.
 * Idempotent: If status is READY, returns immediately.
 */
export const materializeItem = async (
  item: ExamItem,
  blueprint: ExamBlueprint,
  user: UserProfile
): Promise<ExamItem> => {
  if (item.status === 'READY') return item;

  const section = blueprint.sections.find(s => s.id === item.sectionId);
  if (!section) throw new Error("Section definition missing");

  const atom = item.atomSnapshot;

  // RULE 1: ATOM ELIGIBILITY GATE
  if (!isEligibleExamAtom(atom)) {
    logger.exam(`[Materializer] Gate Blocked: ${item.atomId} (Marking FAILED)`);
    return {
      ...item,
      status: 'FAILED',
      failureReason: 'INSUFFICIENT_ATOMS',
      // No question object tailored here - purely structural failure
    };
  }

  try {
    const { ai, apiKey, keyName, config } = getAiClient('exam', undefined); // No UI logging for background tasks
    const model = config.defaultModel;

    // Locked V2 Prompt Construction
    const PROMPT = `SYSTEM:
You are the EDUVA Exam Question Renderer.

You convert EXISTING KNOWLEDGE ATOMS into EXAM QUESTIONS
that measure cognitive mastery with high validity and zero bias.

CORE CONSTRAINTS:
1. TRUTH: Do NOT invent knowledge or introduce concepts not found in the atom.
2. INDEPENDENCE: Generate exactly ONE question that measures ONLY the provided atom.
3. COGNITIVE LOAD: Complexity must come from the cognitive task (Bloom level), not reading difficulty.
4. POSITIVE FRAMING: Avoid "NOT" or "EXCEPT" unless the atom explicitly requires negative discrimination.
5. DISTRACTOR LOGIC: Incorrect options must reflect plausible misconceptions.
6. SYMMETRY: Options must be grammatically consistent and similar in length.

INPUT CONTEXT:
- Subject: ${blueprint.sourceId}
- Strategy: ${blueprint.intent.join(', ')}
- Section Type: ${section.atomProfile.type}
- Target Bloom Level: ${section.atomProfile.bloomLevel}

KNOWLEDGE ATOM:
- atomId: ${atom.atomId}
- concept: ${atom.metadata.conceptTag}
- details: ${atom.coreRepresentation.definition || atom.coreRepresentation.text}

OUTPUT (JSON ONLY):
{
  "atomId": "${atom.atomId}",
  "questionText": "...",
  "options": ["...", "...", "...", "..."] | null,
  "correctAnswerIndex": number | null
}`;

    logger.exam(`[Materializer] Calling AI for ${item.atomId}`, { model, keyName });

    const response = await callAiWithRetry(ai, {
      model,
      contents: PROMPT, // V2 Prompt injected directly
      config: {
        responseMimeType: 'application/json',
        responseSchema: EXAM_QUESTION_SCHEMA,
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        maxOutputTokens: config.maxOutputTokens
      }
    }, undefined, [], apiKey, keyName);

    const data = JSON.parse(response.text || '{}');

    logger.exam(`[Materializer] Success: ${item.atomId}`);

    return {
      ...item,
      status: 'READY',
      question: {
        text: data.questionText,
        options: data.options,
        correctAnswerIndex: data.correctAnswerIndex,
        isFallback: false
      }
    };

  } catch (e) {
    logger.error('EXAM', `[ExamMaterializer] Failed to materialize ${item.atomId}`, e);

    // V2 Lock: Fail-Fast (No Assessment Fabrication)
    return {
      ...item,
      status: 'FAILED',
      failureReason: 'AI_ERROR' // Could distinguish quota vs other errors if needed, but generic failure suffices for UI
    };
  }
};

// ------------------------------------------------------------------
// LEGACY ADAPTER (To Prevent App.tsx Breakage)
// ------------------------------------------------------------------
import { GenerationRequest, ExamData } from '../../types';
import { hydrateExam } from '../storageService';
import { ensureAtoms } from './ingestionService';

/** @deprecated Use generateBlueprint + createExamSkeleton */
export const generateExamPaper = async (req: GenerationRequest, onStatus?: (msg: string) => void): Promise<ExamData> => {
  // If request has contentId, mock legacy return
  return await hydrateExam('', req.subject, req.year, '60 min', Difficulty.MEDIUM);
};

// Deprecated alias for backward compatibility until refactor complete
export const initializeSession = async (
  blueprint: ExamBlueprint,
  user: UserProfile,
  selfReportedConfidence?: 'READY' | 'NERVOUS'
): Promise<ExamSession> => {
  // Forward to new method, but note that items will be PENDING
  // UI must handle PENDING state
  console.warn("Using deprecated initializeSession. Use createExamSkeleton.");
  return createExamSkeleton(blueprint, user);
};

/**
 * Materializes a BATCH of items (Hybrid Batched Streaming V3).
 * Reduces AI calls by ~80% and allows instant start.
 */
// ------------------------------------------------------------------
// 5. PAYLOAD SAFETY (V3.2 LOCKED)
// ------------------------------------------------------------------

const PAYLOAD_LIMITS = {
  MAX_TOKENS: 6000,
  MAX_ATOMS: 5,
  MAX_ATOM_COST: 1800 // Hard cap per atom
};

const estimateAtomCost = (atom: any): number => {
  const def = atom.coreRepresentation?.definition || "";
  const rule = atom.coreRepresentation?.keyRule || "";
  const expl = atom.extendedRepresentation?.fullExplanation || "";
  const ex = atom.extendedRepresentation?.examples || "";

  // Rough char-to-token estimate (4 chars ~ 1 token)
  return Math.ceil((def.length + rule.length + expl.length + ex.length) / 4);
};

export const materializeQuestionBatch = async (
  items: ExamItem[],
  blueprint: ExamBlueprint,
  user: UserProfile
): Promise<ExamItem[]> => {
  if (items.length === 0) return [];

  // Filter out already READY items
  const pendingItems = items.filter(i => i.status !== 'READY' && i.status !== 'FAILED');
  if (pendingItems.length === 0) return items;

  // 🛡️ GUARDRAIL 3: SECTION BOUNDARY RESPECT
  const refItem = pendingItems[0];
  const section = blueprint.sections.find(s => s.id === refItem.sectionId);
  if (!section) throw new Error(`Section def missing for ${refItem.sectionId}`);

  // --- BUDGET-AWARE BATCHING ---
  const validBatch: ExamItem[] = [];
  let currentTokens = 0;

  for (const item of pendingItems) {
    const cost = estimateAtomCost(item.atomSnapshot);

    // 0. MOCK FILTER (Defensive)
    if (typeof item.atomId === 'string' && item.atomId.startsWith('mock_')) {
      logger.exam(`[Payload] Mock Atom Detected: ${item.atomId}. Marking FAILED.`);
      // We'll mark it FAILED in the mapping phase, but skip processing here
      // Actually, we must NOT add it to validBatch.
      continue;
    }

    // 1. POISON ISOLATION
    if (cost > PAYLOAD_LIMITS.MAX_ATOM_COST) {
      logger.exam(`[Payload] Atom too large (${cost} toks). Skipping ${item.atomId}.`);
      // We mark this item as processed in this run (effectively handled outside)
      // Actually we need to return it as FAILED in the result set immediately? 
      // The function contract returns mapped items.
      // Strategy: We only build a batch of VALID items. The Loop/Caller handles leftovers
      // or we return the subset processed + unprocessed?
      // Wait, this function processes the *whole input list* in one go? 
      // The original V3 logic took `items` and returned `items`. 
      // If we only process a subset (the budget limit), we leave the rest pending?
      // But the caller expects *something* to happen. 
      // If we implement "materializeQuestionBatch", it implies "materialize THIS batch".
      // But the streaming hook calls this with *all pending items in a chunk*.
      // Let's assume the caller gives us a chunk. If the chunk is too big, we process the first fit subset.
      // AND we must mark the "Too Large" ones as FAILED so they don't block forever.
    }

    if (cost > PAYLOAD_LIMITS.MAX_ATOM_COST) {
      // We will handle this failure mapping at the end
      continue;
    }

    // 2. BUDGET CHECK
    if (validBatch.length + 1 > PAYLOAD_LIMITS.MAX_ATOMS || currentTokens + cost > PAYLOAD_LIMITS.MAX_TOKENS) {
      break; // Batch full
    }

    validBatch.push(item);
    currentTokens += cost;
  }

  // Identify items that are skipped due to budget (to be processed next tick) vs Poison
  const batchIds = new Set(validBatch.map(i => i.atomId));

  // EXECUTE BATCH (Recursive Retry Wrapper)
  const executeSafeBatch = async (batchItems: ExamItem[]): Promise<Map<string, any>> => {
    if (batchItems.length === 0) return new Map();

    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const { ai, apiKey, keyName, config } = getAiClient('exam', undefined);
    const model = config.defaultModel;

    // Construct Context
    const atomList = batchItems.map(i => ({
      atomId: i.atomId,
      concept: i.atomSnapshot.metadata.conceptTag,
      details: i.atomSnapshot.coreRepresentation.definition || i.atomSnapshot.coreRepresentation.text
    }));

    const PROMPT = `SYSTEM:
You are the EDUVA Exam Question Renderer (Batch Mode).
INPUT: List of Knowledge Atoms.
OUTPUT: List of Exam Questions (JSON).
CONSTRAINT: 1 Atom = 1 Question. Preserve IDs.
Bloom Level: ${section.atomProfile.bloomLevel}.
Subject: ${blueprint.sourceId}.

ATOMS:
${JSON.stringify(atomList, null, 2)}

OUTPUT SCHEMA: { "batchId": "${batchId}", "questions": [{ "atomId": "...", "questionText": "...", "options": [...], "correctAnswerIndex": 0, "status": "SUCCESS" | "FAILED" }] }`;

    try {
      const response = await callAiWithRetry(ai, {
        model,
        contents: PROMPT,
        config: {
          responseMimeType: 'application/json',
          responseSchema: EXAM_BATCH_SCHEMA,
          temperature: config.temperature,
          topP: config.topP,
          topK: config.topK,
          maxOutputTokens: config.maxOutputTokens
        }
      }, undefined, [], apiKey, keyName);

      const data = JSON.parse(response.text || '{"questions":[]}');
      const map = new Map();
      (data.questions || []).forEach((q: any) => map.set(q.atomId, q));
      return map;

    } catch (e) {
      logger.error('EXAM', `[Payload] Batch Failed (${batchItems.length} items).`, e);

      // RETRY POLICY: SPLIT & RETRY
      if (batchItems.length > 1) {
        logger.exam(`[Payload] Splitting batch for retry...`);
        const mid = Math.floor(batchItems.length / 2);
        const left = batchItems.slice(0, mid);
        const right = batchItems.slice(mid);

        const resultsLeft = await executeSafeBatch(left);
        const resultsRight = await executeSafeBatch(right);

        // Merge maps
        return new Map([...resultsLeft, ...resultsRight]);
      }

      // If single item failed, return empty (effectively failing it)
      return new Map();
    }
  };

  // Run the batch
  const resultMap = await executeSafeBatch(validBatch);

  // Map Results
  return items.map(item => {
    // 1. If not pending, ignore
    if (!pendingItems.find(p => p.atomId === item.atomId)) return item;

    const cost = estimateAtomCost(item.atomSnapshot);

    // 2. Handle Poison
    if (cost > PAYLOAD_LIMITS.MAX_ATOM_COST) {
      return { ...item, status: 'FAILED', failureReason: 'PAYLOAD_TOO_LARGE' };
    }

    // 2.5 Handle Mocks (Defensive)
    if (typeof item.atomId === 'string' && item.atomId.startsWith('mock_')) {
      return { ...item, status: 'FAILED', failureReason: 'INSUFFICIENT_ATOMS' };
    }

    // 3. Handle Budgeted (processed in this batch)
    if (batchIds.has(item.atomId)) {
      const gen = resultMap.get(item.atomId);
      if (gen) {
        if (gen.status === 'FAILED') return { ...item, status: 'FAILED', failureReason: 'AI_GENERATION_FAILED' };
        return {
          ...item,
          status: 'READY',
          question: {
            text: gen.questionText,
            options: gen.options,
            correctAnswerIndex: gen.correctAnswerIndex,
            isFallback: false
          }
        };
      } else {
        // Batch succeeded but this item missing? Or sub-batch failed?
        return { ...item, status: 'FAILED', failureReason: 'AI_MISSING_OUTPUT' };
      }
    }

    // 4. Handle Deferred (Next Tick)
    // If it wasn't poison and wasn't in batchIds, it simply wasn't processed yet.
    // Return explicit PENDING to keep it in queue
    return item;
  });
};

// ------------------------------------------------------------------
// 6. MICRO-LOOPS (STAGE 6 - CORRECTION ENGINE)
// ------------------------------------------------------------------

import { MicroLoopSession } from '../../types';

const MICRO_LOOP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    loopId: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scaffoldLevel: { type: Type.STRING, enum: ["RECALL", "CONCEPT", "APPLICATION", "MISCONCEPTION"] },
          questionText: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswerIndex: { type: Type.NUMBER }
        },
        required: ["scaffoldLevel", "questionText", "options", "correctAnswerIndex"]
      }
    }
  },
  required: ["loopId", "questions"]
};

/**
 * Generates a surgical 3-5 question loop for a single atom.
 * Uses strict payload safety (Batch Size 1).
 */
export const generateMicroLoop = async (
  atomId: string,
  user: UserProfile,
  sourceExamId?: string
): Promise<MicroLoopSession> => {
  logger.exam(`[MicroLoop] Generating loop for atom ${atomId}`);

  // 1. Fetch Atom (Local First)
  // We assume the atom exists in recent history or local storage
  const allAtoms = await getLocalAtoms(user.id);
  const atom = allAtoms.find(a => a.core.atomId === atomId)?.core;

  if (!atom) {
    throw new Error(`Atom ${atomId} not found locally.`);
  }

  // 2. Construct Prompt (Escalating Scaffolding)
  const { ai, apiKey, keyName, config } = getAiClient('exam', undefined);
  const model = config.defaultModel;
  const loopId = `loop_${Date.now()}_${atomId.substring(0, 6)}`;

  const PROMPT = `SYSTEM:
You are the EDUVA Remediation Engine.
GOAL: Create a "Micro-Loop" to fix a specific student misconception.
STRATEGY: Generate 3 escalating questions for the provided atom.

SCAFFOLDING LEVELS:
1. RECALL: Simple memory check (Did they read it?).
2. CONCEPT: Conceptual understanding (Why does it work?).
3. APPLICATION: Scenario-based application (How is it used?).

KNOWLEDGE ATOM:
- Concept: ${atom.metadata.conceptTag}
- Definition: ${atom.coreRepresentation.definition || (atom.coreRepresentation as any).text}
- Rule: ${atom.coreRepresentation.keyRule || "N/A"}

OUTPUT JSON SCHEMA:
{
  "loopId": "${loopId}",
  "questions": [
    { "scaffoldLevel": "RECALL", "questionText": "...", "options": [...], "correctAnswerIndex": 0 },
    { "scaffoldLevel": "CONCEPT", "questionText": "...", "options": [...], "correctAnswerIndex": 0 },
    { "scaffoldLevel": "APPLICATION", "questionText": "...", "options": [...], "correctAnswerIndex": 0 }
  ]
}`;

  try {
    const response = await callAiWithRetry(ai, {
      model,
      contents: PROMPT,
      config: {
        responseMimeType: 'application/json',
        responseSchema: MICRO_LOOP_SCHEMA,
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK
      }
    }, undefined, [], apiKey, keyName);

    const data = JSON.parse(response.text || '{}');

    // 3. Map to ExamItems
    const questions: ExamItem[] = (data.questions || []).map((q: any, idx: number) => ({
      atomId: atom.atomId,
      sectionId: 'MICRO_LOOP',
      atomSnapshot: atom, // Embed snapshot
      status: 'READY',
      question: {
        text: q.questionText,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        isFallback: false
      },
      flags: { flaggedForReview: false, timeSpentMs: 0, interactionCount: 0 },
      order: idx + 1
    }));

    return {
      id: loopId,
      userId: user.id,
      sourceExamId,
      atomId,
      questions,
      status: 'PENDING',
      startedAt: Date.now()
    };

  } catch (e) {
    logger.error('EXAM', `[MicroLoop] Failed generation`, e);
    throw e;
  }
};
