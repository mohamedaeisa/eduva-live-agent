
import { Type } from "@google/genai";
import { 
  GenerationRequest, QuizType, AtomCore, GeneratedQuestion, Language, Difficulty, QuizData, QuizQuestion 
} from '../../types';
import { ensureAtoms } from './ingestionService';
import { getAtomsForContent, getCachedQuiz, setQuizCache } from '../storageService';
import { getAiClient, callAiWithRetry } from './client';
import { QUIZ_GENERATION_PROMPT_V7 } from '../../constants';
import { hydrateAtomList } from '../hydrationService';
import { normalizeSubjectName } from '../../utils/subjectUtils';

const GENERATED_QUIZ_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          atomId: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['MCQ', 'TrueFalse', 'FillInTheBlank'] },
          bloomLevel: { type: Type.NUMBER },
          stem: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          hintLadder: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['id', 'atomId', 'type', 'bloomLevel', 'stem', 'correctAnswer', 'explanation', 'hintLadder']
      }
    }
  },
  required: ['questions']
};

/**
 * EDUVA v7 Mastery Band Resolver
 */
const calculateMasteryBand = (atoms: AtomCore[], masteryMap: Record<string, number> = {}): string => {
  if (atoms.length === 0) return "band_0.0";
  const sum = atoms.reduce((acc, a) => acc + (masteryMap[a.atomId] || 0), 0);
  const avg = sum / atoms.length;
  // Group into 0.2 increments
  const band = (Math.floor(avg * 5) / 5).toFixed(1);
  return `band_${band}`;
};

/**
 * QuizGeneratorV2 (EDUVA v7)
 * Synthesizes dynamic assessments at runtime from decoupled Knowledge Atoms.
 * NEVER persists assessment content to storage.
 */
// Fix: Corrected return type from object literal to QuizData to match App.tsx requirements
export const generateQuiz = async (
  req: GenerationRequest, 
  onStatus?: (msg: string) => void,
  masteryMap: Record<string, number> = {}
): Promise<QuizData> => {
  console.group("%c[QuizGeneratorV2] Synthesis Engine", "color: #4f46e5; font-weight: bold;");
  
  let atoms: AtomCore[] = [];
  let contentId = req.contentId || 'dynamic_repair';

  // --- REPAIR GUARDRAIL & HYDRATION START ---
  if (req.struggleAtoms && req.struggleAtoms.length > 0) {
      console.info(`[QuizGeneratorV2] Repair Mode Active. Filtering for ${req.struggleAtoms.length} target atoms.`);
      if (onStatus) onStatus("Hydrating Targeted Repair Matrix...");
      
      // 1. Hydrate specific atoms (Local + Cloud Fallback)
      atoms = await hydrateAtomList(req.struggleAtoms);

      // 2. FALLBACK: Deterministic Re-Extraction
      // If atoms missing locally AND globally, but we have source contentId, regenerate them.
      if (atoms.length === 0 && req.contentId) {
          console.warn("[QuizGeneratorV2] Weak atoms missing. Attempting regeneration from source...");
          if (onStatus) onStatus("Re-synthesizing missing knowledge...");
          
          try {
              // This triggers local extraction from the cached PDF/Source
              // Since IDs are deterministic (SHA256), they will match the requested struggleAtoms
              await ensureAtoms(req, onStatus);
              
              // Retry hydration from local (now populated)
              atoms = await hydrateAtomList(req.struggleAtoms);
          } catch (e) {
              console.error("[QuizGeneratorV2] Regeneration failed", e);
          }
      }

      // 3. Filter by subject REMOVED for Repair Mode (Trust ID)

      // GUARDRAIL: If filtration results in empty set, ABORT.
      if (atoms.length === 0) {
          console.error("[QuizGeneratorV2] Repair Guardrail Triggered: Target atoms not found in content.");
          console.groupEnd();
          throw new Error("Repair mission cannot proceed without weak atoms. Content missing locally or globally.");
      }
  } else {
      // STANDARD FLOW
      if (onStatus) onStatus("Hydrating Knowledge Matrix...");
      const res = await ensureAtoms(req, onStatus);
      contentId = res.contentId;
      atoms = await getAtomsForContent(contentId, 'notes');
  }
  // --- REPAIR GUARDRAIL END ---

  if (atoms.length === 0) throw new Error("Knowledge pool empty. Synthesis aborted.");

  // 3. Resolve Mastery Band & Check Cache
  const mBand = calculateMasteryBand(atoms, masteryMap);
  // v7: Key logic now accepts an array of types to ensure uniqueness for mixed sessions
  const qTypes = [req.quizType]; 
  const cached = await getCachedQuiz(atoms.map(a => a.atomId), req.difficulty, qTypes, mBand);
  
  if (cached && !req.struggleAtoms?.length) {
    console.info("[QuizGeneratorV2] Cache Hit. Delivering short-lived buffer.");
    console.groupEnd();
    // Fix: Returned object now fully implements QuizData interface
    return { 
      title: `Assessment: ${req.topic}`, 
      topic: req.topic,
      questions: cached as any, 
      contentId,
      timestamp: Date.now()
    };
  }

  // 4. Prepare Context (Knowledge Atoms)
  const atomContext = atoms.map(a => ({
    id: a.atomId,
    tag: a.metadata.conceptTag,
    definition: a.coreRepresentation.definition,
    keyRule: a.coreRepresentation.keyRule,
    misconceptions: a.extendedRepresentation.misconceptions,
    keywords: a.assessmentMetadata.essentialKeywords
  }));

  const { ai, apiKey } = getAiClient('quiz', onStatus);
  if (onStatus) onStatus(`Synthesizing adaptive assessment layer...`);

  // Synthesis via Gemini 3 Pro for high-reasoning distractors
  const response = await callAiWithRetry(ai, {
    model: 'gemini-3-pro-preview',
    contents: `ATOMS:\n${JSON.stringify(atomContext)}\n\nCONFIG:\nDifficulty: ${req.difficulty}\nType: ${req.quizType}\nCount: ${req.questionCount}\nLanguage: ${req.language}\nMastery Band: ${mBand}`,
    config: {
        systemInstruction: QUIZ_GENERATION_PROMPT_V7,
        responseMimeType: 'application/json',
        responseSchema: GENERATED_QUIZ_SCHEMA,
        temperature: 0.3 // Standardized for assessment variety
    }
  }, undefined, [], apiKey);

  const raw = JSON.parse(response.text || '{"questions":[]}');
  const questions: GeneratedQuestion[] = raw.questions.map((q: any) => ({
      ...q,
      id: q.id || `q_v7_${Math.random().toString(36).substr(2, 9)}`
  }));

  // Fix: Mapped GeneratedQuestion to QuizQuestion for UI display stability
  // CRITICAL FIX: Pass atomId to QuizQuestion to ensure telemetry tracking works correctly
  const quizQuestions: QuizQuestion[] = questions.map(q => ({
    id: q.id,
    atomId: q.atomId, // Preserved for telemetry
    type: q.type,
    difficulty: req.difficulty,
    topic: req.topic,
    cognitiveLevel: q.bloomLevel.toString(),
    question: q.stem,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation
  }));

  // 5. Canonical Caching
  if (questions.length > 0) {
    setQuizCache(atoms.map(a => a.atomId), req.difficulty, qTypes, mBand, questions);
  }

  console.info(`[QuizGeneratorV2] Synthesis Complete. Produced ${questions.length} dynamic units.`);
  console.groupEnd();

  // Fix: Returned object fully implements mandatory QuizData properties
  return {
    title: `Assessment: ${req.topic}`,
    topic: req.topic,
    questions: quizQuestions,
    contentId,
    timestamp: Date.now()
  };
};

/**
 * generateGapCloserQuiz
 * Specialized targeted assessment for remedial pathing.
 */
export const generateGapCloserQuiz = async (req: GenerationRequest, mistakes: any[], onStatus?: (msg: string) => void): Promise<QuizData> => {
    if (onStatus) onStatus("Targeting knowledge gaps...");
    // The base adaptive quiz engine already supports targeting struggleAtoms
    return await generateQuiz(req, onStatus);
};
