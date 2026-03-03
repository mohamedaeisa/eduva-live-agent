
import { Type } from "@google/genai";
import { getAiClient, callAiWithRetry } from '../ai/client';
import { AI_MODELS } from '../ai/constants';
import { AtomCore, QuizQuestionV2, UserProfile } from '../../types';
import { resolveAllowedQuestionTypes, type QuizOrigin, type QuizScope } from '../../utils/quizPolicyResolver';

// Session-level focus for intelligent level distribution
export type SessionFocus = 'reinforce' | 'challenge' | 'diagnose' | 'balanced';

type LevelDistribution = {
  1: number; // Count of L1 questions per atom
  2: number; // Count of L2 questions per atom  
  3: number; // Count of L3 questions per atom
};

const FOCUS_DISTRIBUTIONS: Record<SessionFocus, LevelDistribution> = {
  reinforce: { 1: 1, 2: 1, 3: 1 },   // Standard Ladder
  challenge: { 1: 1, 2: 2, 3: 2 },   // (Ignored by Challenge Mode override anyway)
  diagnose: { 1: 1, 2: 1, 3: 1 },    // Standard Ladder
  balanced: { 1: 1, 2: 1, 3: 1 }     // Standard Ladder
};

// ✅ ROOT CAUSE FIX: Schema enum is built DYNAMICALLY from effectiveTypes.
// A hardcoded enum overrides the prompt, causing forbidden type generation.
// minItems forces the model to generate the exact count (prevents early termination).
const buildBatchSchema = (allowedTypes: string[], minQuestions: number, allowedDifficulties: string[] = ["1", "2", "3", "4"]) => ({
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      minItems: minQuestions,
      maxItems: minQuestions,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: allowedTypes, description: `ONLY use types from this list: [${allowedTypes.join(', ')}]. You MUST distribute questions EVENLY across ALL listed types.` },
          difficulty: { type: Type.STRING, enum: allowedDifficulties, description: `Cognitive Level: [${allowedDifficulties.join(', ')}]. 1=Recall, 2=Application, 3=Analysis, 4=Synthesis/Judgment.` },
          stem: { type: Type.STRING },
          explanation: { type: Type.STRING },
          sourceRef: { type: Type.STRING, description: "Exact Atom ID" },
          options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 plausible word options for MCQ and FillIn (one must be the correct answer). For TrueFalse: ['True', 'False']. NULL for Match only." },
          correctIndex: { type: Type.NUMBER, description: "STRICT: The 0-based index of the correct option (0, 1, 2, or 3)." },
          answer: { type: Type.STRING, nullable: true, description: "Required for FillIn (the exact word)." },
          pairs: {
            type: Type.ARRAY,
            items: { type: Type.ARRAY, items: { type: Type.STRING } },
            nullable: true,
            description: "Exactly 3 pairs for matching."
          }
        },
        required: ['type', 'difficulty', 'stem', 'explanation', 'sourceRef', 'options', 'correctIndex']
      }
    }
  },
  required: ['questions']
});

const CHALLENGE_SYSTEM_PROMPT = `
ROLE:
You are the EDUVA Master Challenge Architect.

MISSION (ABSOLUTE):
This session is CHALLENGE MODE.
The learner has already MASTERED Levels 1–3.
You must operate strictly at LEVEL 4 (SYNTHESIS / JUDGMENT).

COGNITIVE LEVEL LOCK (NON-NEGOTIABLE):
- Level 1 (Recall): FORBIDDEN
- Level 2 (Application): FORBIDDEN
- Level 3 (Analysis): FORBIDDEN
- ONLY Level 4 questions are allowed

LEVEL 4 DEFINITION:
A Level 4 question MUST:
- Combine multiple concepts or constraints
- Require evaluation, prioritization, or trade-off analysis
- Present a novel or unfamiliar scenario
- Ask for the BEST or MOST EFFECTIVE decision
- Require reasoning beyond any single Atom
- The scenario MUST NOT resemble any example, wording, or structure found in the source material.
- The learner must TRANSFER knowledge to a new context.


QUESTION DESIGN RULES:
- No definitions
- No direct factual recall
- No single-step problems
- No pattern repetition
- No obvious answers

ATOM USAGE:
- Atoms are conceptual anchors ONLY
- You MUST NOT restate atom text
- Assume the learner already knows the atom
- EVERY question MUST depend on at least TWO atoms.
- If a question can be solved using a single atom, it is INVALID.


FORMAT LOCK:
- ALLOWED TYPES: [MCQ]
- EXACTLY 4 options
- One BEST answer (judgment-based)
- Distractors must be plausible trade-offs
- No “All of the above”
- No trick wording


FAIL-SAFE (MANDATORY SELF-CHECK):
Before finalizing each question, ask:
1) Can this be answered without combining multiple source atoms?
2) Does this scenario look like any example in the source material?
3) Is there a single 'rule' that solves this without weighing trade-offs?

If the answer to ANY is YES → DISCARD and regenerate. Every challenge question MUST be a high-stakes decision or complex synthesis that requires mastering all provided concepts.


OUTPUT REQUIREMENT:
Return ONLY valid Level 4 challenge questions.
`.trim();

export const callBatchQSE = async (
  atoms: AtomCore[],
  triggerLevel: 1 | 2 | 3,
  user: UserProfile,
  allowedTypes: string[] = ['MCQ', 'TrueFalse', 'FillIn', 'Match'],
  isChallengeMode: boolean = false,
  origin?: QuizOrigin,
  scope?: QuizScope,
  sessionFocus: SessionFocus = 'balanced',
  source?: 'ADAPTIVE' | 'COMPASS' // ✅ NEW: Explicit Source Signal
): Promise<QuizQuestionV2[]> => {
  console.group(`%c[QSE_ENGINE] Synthesizing Matrix [Src: ${source || 'Unknown'}]`, "color: #ec4899; font-weight: bold;");

  if (atoms.length === 0) {
    console.warn("[QSE_ENGINE] ⚠️ No atoms provided to synthesizer.");
    console.groupEnd();
    return [];
  }

  // ✅ BACKEND GUARD: Enforce question type policy
  // Never trust the caller - filter types based on quiz mode
  let effectiveTypes = allowedTypes;
  if (origin && scope) {
    effectiveTypes = resolveAllowedQuestionTypes(
      origin,
      scope,
      allowedTypes as any[]
    );
  }

  console.log(`[QSE_DEBUG] 📋 Ingesting ${atoms.length} atoms:`, atoms.map(a => a.atomId));
  console.log(`[QSE_DEBUG] 🚩 Session Focus: ${sessionFocus} | Challenge: ${isChallengeMode}`);
  console.log(`[QSE_DEBUG] 🏷️ Effective Types: ${effectiveTypes.join(', ')}`);

  // Log policy violations for debugging
  if (effectiveTypes.length !== allowedTypes.length) {
    const filtered = allowedTypes.filter(t => !effectiveTypes.includes(t));
    console.warn(`[QSE_POLICY] Filtered forbidden types in ${origin} mode:`, filtered.join(', '));
    console.warn(`[QSE_POLICY] Effective types:`, effectiveTypes.join(', '));
  }

  const { ai, apiKey, config: aiConfig } = getAiClient('quiz');

  const ALL_TYPES = ['MCQ', 'TrueFalse', 'FillIn', 'Match'];

  const forbiddenTypes = ALL_TYPES.filter(t => !effectiveTypes.includes(t));
  const isArabic = user.preferences.defaultLanguage === 'Arabic';

  // Dynamic Grading Protocol based on Language
  const gradingProtocol = isArabic
    ? `- MCQ: Exactly 4 distinct options. No "None of the above".
       - True/False: Options: ["صواب", "خطأ"]. 0=صواب, 1=خطأ.
       - LANGUAGE LOCK: ALL CONTENT MUST BE IN ARABIC (Modern Standard Arabic). NO LATIN CHARACTERS. Ensure natural RTL sentence structure.`
    : `- MCQ: Exactly 4 distinct options. No "None of the above".
       - True/False: Options: ["True", "False"]. 0=True, 1=False.`;

  // GAP 3 FIX: Determine level distribution based on session focus
  const distribution = FOCUS_DISTRIBUTIONS[sessionFocus];

  // ✅ PROMPT FIX: Relax "EXACTLY" constraint for Repair/File modes OR Adaptive Source
  // If origin is REPAIR, scope is FILE, or source is ADAPTIVE, we need strict 1:1 mapping (or up to capacity).
  const isStrictLadder = origin === 'REPAIR' || scope === 'FILE' || source === 'ADAPTIVE';

  // ✅ STRICT STANDARDIZATION: Total 12 questions (4 per level for standard, 12 Level 4 for Challenge)
  const totalExpectedQuestions = 12;
  const expectedTotal = Math.max(1, Math.ceil(totalExpectedQuestions / atoms.length));

  const quantityConstraint = `
QUANTITY CONTRACT (NON-NEGOTIABLE):
• You are provided with ${atoms.length} atoms.
• You MUST generate EXACTLY ${expectedTotal} questions per atom.
• TARGET: You MUST return a total of EXACTLY ${totalExpectedQuestions} questions.
• Under-generating or over-generating will result in a system fault.`;

  const questionsPerAtom = Math.floor(totalExpectedQuestions / atoms.length);
  const ladderInstruction = isChallengeMode
    ? `For EACH atom, try to generate questions such that you reach a total of ${totalExpectedQuestions} Level 4 (Synthesis) questions. Scenarios MUST be unique.`
    : `QUANTITY CONTRACT (NON-NEGOTIABLE):
- Total Questions: 12
- Level 1 (Recall): Exactly 4
- Level 2 (Application): Exactly 4
- Level 3 (Analysis): Exactly 4
Distribute these 12 questions across the provided ${atoms.length} atoms as evenly as possible.`;

  const standardInstruction = `
ROLE:
You are the EDUVA Master Assessment Architect.
You design exam-grade, diagnostic questions suitable for a long-term question bank.

ATOM AUTHORITY RULE:
The provided atom is the ONLY source of truth.
You must not introduce external facts or reinterpret the concept beyond the atom.

EXAMPLE USAGE RULE (CRITICAL):
The PRIMARY EXAMPLE (EX) shows the concept pattern.
You MUST NOT replicate its grammatical structure or sentence form.
Use it to understand the concept, not as a template to copy.
Generate fresh scenarios that test the same principle.

LADDER LOGIC (MANDATORY):
${ladderInstruction}

LEVEL 1 — RECALL
• Direct check of definition or key rule
• No scenarios
• Tests factual accuracy only

LEVEL 2 — APPLICATION
• Simple, concrete scenario
• Student must apply the rule
• Fresh context, NOT copied from EX

LEVEL 3 — ANALYSIS
• Requires reasoning, comparison, or error detection
• Must NOT be solvable by memorization alone

If a true Level 3 is not possible:
→ Generate the most challenging application variant possible and label it as Level 3.

DISTRACTOR RULE:
• Incorrect options must be plausible
• When misconceptions are provided, at least one distractor should reflect them
• Never use silly or obviously wrong answers

QUESTION BANK SAFETY:
• Questions must be reusable
• Do NOT reference "this text", "the passage", or page numbers
• Avoid document-specific wording

QUIZ MODE LOCK:
- ALLOWED TYPES: [${effectiveTypes.join(', ')}]
- FORBIDDEN TYPES: [${forbiddenTypes.join(', ')}]
Violating this invalidates the response.

GRADING PROTOCOL:
${gradingProtocol}

SOURCE LINKING:
• sourceRef MUST match the atomId exactly.
• Ensure every atom ID provided in the context is used to generate its corresponding questions.

QUALITY CHECK (INTERNAL):
• Count the questions: Are there exactly ${totalExpectedQuestions}?
• Check the types: Are they only [${effectiveTypes.join(', ')}]?
• If no, regenerate before returning.

OUTPUT FORMAT (MANDATORY):
Return a single JSON object with exactly this structure:
{"questions": [ ...array of question objects... ]}
Each question object MUST have these fields:
- type: string (one of: ${effectiveTypes.join(', ')})
- difficulty: number (1, 2, or 3)
- stem: string
- explanation: string
- sourceRef: string (exact Atom ID)
- options: array of strings (4 for MCQ, 2 for TrueFalse: ["True","False"])
- correctIndex: number (0-based index of correct option)
- answer: string or null (only for FillIn)
- pairs: array or null (only for Match)
Do NOT return a raw array. You MUST wrap it in {"questions": [...]}
  `.trim();

  // If Challenge Mode, use restricted prompt + output format override
  // Inject Arabic constraints into Challenge Prompt if needed
  // DYNAMIC: Respect user-selected question types even in Challenge Mode
  const challengeTypesRestriction = `- ALLOWED TYPES: [${effectiveTypes.join(', ')}]
- FORBIDDEN TYPES: [${ALL_TYPES.filter(t => !effectiveTypes.includes(t)).join(', ')}]`;

  let finalChallengePrompt = CHALLENGE_SYSTEM_PROMPT.replace(
    '- ALLOWED TYPES: [MCQ]',
    challengeTypesRestriction
  );

  if (isArabic) {
    finalChallengePrompt += `\n\nLANGUAGE LOCK: OUTPUT MUST BE 100% ARABIC (Fusha). NO ENGLISH. Options must be Arabic phrases.`;
  }

  const systemInstruction = isChallengeMode
    ? finalChallengePrompt + "\n\nIMPORTANT: Use difficulty label '4' for ALL questions in this session. This is a STRICT REQUIREMENT for Challenge Mode."
    : standardInstruction;

  const context = atoms.map(a => {
    const base = `
ID: ${a.atomId}
TAG: ${a.metadata.conceptTag}
DEF: ${a.coreRepresentation.definition}
RULE: ${a.coreRepresentation.keyRule}
EX: ${a.coreRepresentation.primaryExample}
LOAD: ${a.assessmentMetadata.cognitiveLoad}
`.trim();

    const misconceptions =
      a.extendedRepresentation?.misconceptions?.length
        ? `\nMISCONCEPTIONS: ${a.extendedRepresentation.misconceptions.join('; ')}`
        : '';

    return base + misconceptions;
  }).join('\n---\n');

  // ✅ ROOT CAUSE FIX 2: Use config-driven model, NOT a hardcoded constant.
  // Previously this was AI_MODELS.FLASH regardless of what was set in constants.ts.
  const modelToUse = isChallengeMode ? AI_MODELS.FALLBACK : aiConfig.defaultModel;
  console.log(`[QSE_DEBUG] 🛰️ Model: ${modelToUse} | Params: T=${aiConfig.temperature}, P=${aiConfig.topP}, K=${aiConfig.topK}, Max=${aiConfig.maxOutputTokens}`);

  console.groupCollapsed(`[QSE_DEBUG] 📝 FULL PROMPT (System + User)`);
  console.log(`%c[SYSTEM INSTRUCTION]`, "color: #3b82f6; font-weight: bold;");
  console.log(systemInstruction);
  console.log(`%c[USER PROMPT]`, "color: #10b981; font-weight: bold;");
  console.log(`Target Grade: ${user.preferences.defaultYear}. Atoms to process:\n${context}`);
  console.groupEnd();

  // ✅ Build schema dynamically from effectiveTypes with minItems enforcement.
  const allowedDifficulties = isChallengeMode ? ["4"] : ["1", "2", "3"];
  const BATCH_SCHEMA = buildBatchSchema(effectiveTypes, totalExpectedQuestions, allowedDifficulties);
  console.log(`[QSE_DEBUG] 📐 Schema: enum=[${effectiveTypes.join(',')}] | difficulties=[${allowedDifficulties.join(',')}] | minItems=${totalExpectedQuestions}`);

  try {
    const response = await callAiWithRetry(ai, {
      model: modelToUse,
      contents: [{ role: 'user', parts: [{ text: `Target Grade: ${user.preferences.defaultYear}. Atoms to process:\n${context}` }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: BATCH_SCHEMA,
        systemInstruction,
        temperature: aiConfig.temperature,
        topP: aiConfig.topP,
        topK: aiConfig.topK,
        maxOutputTokens: aiConfig.maxOutputTokens
      }
    }, 'quiz', [], apiKey);

    const rawText = response.text || '{"questions":[]}';
    console.log(`[QSE_DEBUG] 📥 Raw AI Response (len: ${rawText.length}):`, rawText);

    // ✅ Robust JSON parsing: handle both {questions:[...]} and raw [...] formats
    let questions: any[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        // Model returned a raw array instead of {questions: [...]}
        console.warn(`[QSE_DEBUG] ⚠️ AI returned raw array (not wrapped). Auto-wrapping.`);
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else {
        // Object but no questions key — look for first array property
        const firstArray = Object.values(parsed).find(v => Array.isArray(v)) as any[] | undefined;
        if (firstArray) {
          console.warn(`[QSE_DEBUG] ⚠️ AI returned unexpected key. Used first array found.`);
          questions = firstArray;
        }
      }
    } catch (parseErr) {
      console.error(`[QSE_FAULT] JSON parse failed:`, parseErr, `Raw:`, rawText.substring(0, 500));
      console.groupEnd();
      return [];
    }

    console.log(`[QSE_DEBUG] 📊 AI generated ${questions.length} questions initially.`);

    const results = questions
      .filter((q: any) => {
        const allowed = effectiveTypes.includes(q.type);
        if (!allowed) console.warn(`[QSE_DEBUG] 🚫 Filtering out question type "${q.type}" (Not in allowed: ${effectiveTypes.join(', ')})`);
        return allowed;
      })
      .map((q: any) => ({
        id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        atomId: q.sourceRef,
        difficulty: parseInt(q.difficulty, 10) || 1,
        questionType: q.type,
        stem: q.stem,
        explanation: q.explanation,
        options: q.options,
        correctIndex: typeof q.correctIndex === 'string' ? parseInt(q.correctIndex, 10) : q.correctIndex,
        answer: q.answer,
        pairs: q.pairs,
        userAnswer: null
      }));

    console.log(`[QSE_DEBUG] ✅ Final accepted questions: ${results.length}`);
    const atomMapCount: Record<string, number> = {};
    results.forEach(r => atomMapCount[r.atomId] = (atomMapCount[r.atomId] || 0) + 1);
    console.log(`[QSE_DEBUG] 📍 Coverage per Atom:`, atomMapCount);

    console.groupEnd();
    return results;
  } catch (e) {
    console.error(`[QSE_FAULT] Matrix synthesis failed:`, e);
    console.groupEnd();
    return [];
  }
};
