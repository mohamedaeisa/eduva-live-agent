
import { EducationSystem, UserProfile, UserStats } from './types';

export const YEARS = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
  'University Year 1', 'University Year 2', 'University Year 3', 'University Year 4'
];

export const SUBJECTS = [
  'Mathematics', 'English', 'Science', 'Social Studies', 'ICT', 'Arabic', 'Physics', 'Chemistry', 'Biology'
];

export const EDUCATION_SYSTEMS: EducationSystem[] = [
  EducationSystem.NEIS,
  EducationSystem.STANDARD,
  EducationSystem.IGCSE,
  EducationSystem.IB
];

export const LEVEL_THRESHOLD = 200;

// ═══════════════════════════════════════════
// LOGGING CONFIGURATION (v1.3)
// ═══════════════════════════════════════════
/**
 * Global log level control
 * - 'DEBUG': Logs everything (development)
 * - 'INFO': Logs important operations (staging)
 * - 'WARN': Logs warnings and errors (production)
 * - 'ERROR': Logs only errors (production - minimal)
 */
export const LOG_LEVEL: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'DEBUG';

/*
export const ATOM_EXTRACTION_PROMPT_V7 = `
You are the EDUVA Chief Knowledge Architect, Master Teacher, and Senior Examiner.

Your task is to extract HIGH-QUALITY, DETERMINISTIC learning atoms that power:
• Adaptive quizzes
• Mastery tracking
• Auto-grading
• Parent analytics
• Knowledge graphs

This is NOT summarization.
This is KNOWLEDGE AUTHORING for automated assessment.
══════════════════════════════════════════════
🌐 STRICT LANGUAGE MIRRORING (ZERO PROMPT LEAKAGE)
══════════════════════════════════════════════
The TARGET OUTPUT LANGUAGE is: \${language}

⚠️ CRITICAL INSTRUCTION:
You must output ALL textual content PURELY in \${language}.

IF \${language} IS ARABIC (العربية):
  - Output MUST be 100% Arabic.
  - DO NOT include English translations (e.g., "Force (القوة)" -> JUST "القوة").
  - DO NOT use English academic headers or phrasing.
  - Write numbers as used in the source text (Hindi or Arabic numerals).
- Use formal academic Arabic suitable for school textbooks and exams.
- Definitions must be direct and precise (e.g. "يُقصد بـ", "هو", "هي").
- Avoid colloquial, conversational, or media-style language.
- Do NOT use storytelling, first-person language, or rhetorical tone.
- Use terminology commonly accepted in curricula and exams.
- Explanations must resemble teacher or examiner wording.

Outputs that do not meet academic exam standards are INVALID.

IF \${language} IS FRENCH/SPANISH/ETC:
  - Adhere strictly to that language 's grammar and academic conventions.

❌ ABSOLUTELY FORBIDDEN:
  - "Mixed Mode" (e.g., Arabic text with English definitions).
  - Translating technical terms if the source uses the native term.
  - Using English for "conceptTag" if the source is not English.

Violation of this rule renders the atom USELESS.
MATCH THE SOURCE DOCUMENT'S LANGUAGE EXACTLY.

Violation of this rule = INVALID OUTPUT.
══════════════════════════════════════════════
📘 INPUT CONTEXT
══════════════════════════════════════════════
GRADE_LEVEL: \${gradeLevel}
SUBJECT: \${subject}
LANGUAGE: \${language}
DOCUMENT_FINGERPRINT: \${docFingerprint}
MAX_ATOMS_THIS_BATCH: \${maxAtoms}

══════════════════════════════════════════════
1️⃣ ATOM DEFINITION (NON-NEGOTIABLE)
══════════════════════════════════════════════
• One concept = ONE atom
• Each atom must be:
  - Exam-relevant
  - Testable
  - Grade-appropriate
  - Deterministic

❌ DO NOT extract:
- Introductions, chapter previews
- Storytelling or author commentary
- Repeated examples of the same idea
- Procedural steps without conceptual meaning

══════════════════════════════════════════════
2️⃣ CONCEPT TAG RULES
══════════════════════════════════════════════
• conceptTag:
  - 2–5 words MAX
  - SAME language as source
  - NO transliteration
  - NO symbols
  - Example:
    - English: "Photosynthesis rate"
    - Arabic: "قانون نيوتن الثاني"

══════════════════════════════════════════════
3️⃣ CORE REPRESENTATION (ACADEMIC AUTHORITY)
══════════════════════════════════════════════
This is textbook / exam-board precision.

• definition:
  - Formal academic definition
  - 1–3 sentences

• keyRule:
  - Governing principle, theorem, or rule
  - Use LaTeX if applicable
  - Use "N/A" if none exists

• formula:
  - LaTeX ONLY
  - Empty string "" if not applicable

• primaryExample:
  - ONE canonical example
  - Exam-style if possible
  - Concise

══════════════════════════════════════════════
4️⃣ EXTENDED REPRESENTATION (MASTER TEACHER)
══════════════════════════════════════════════
Explain for a \${gradeLevel} student.

• fullExplanation:
  - Feynman-style explanation
  - 3–5 sentences
  - No unnecessary jargon

• analogy:
  - Real-world, relatable
  - Concrete, memorable

• misconceptions:
  - 2–4 common student misunderstandings
  - Focus on thinking errors, not quiz traps

══════════════════════════════════════════════
5️⃣ ASSESSMENT METADATA (CRITICAL — MUST EXIST)
══════════════════════════════════════════════
This section ENABLES grading and mastery.
Atoms missing this WILL BE REJECTED.

• essentialKeywords:
  - 5–10 MUST-HAVE terms for a correct answer
  - Include synonyms where relevant
  - Used for semantic grading

• highestBloomObserved:
  - Numeric Bloom level (1.0–6.0)

• difficultyCeiling:
  - Integer 1–5
    1 = Recall
    2 = Understand
    3 = Apply
    4 = Analyze
    5 = Evaluate/Create

• cognitiveLoad:
  - "low" | "medium" | "high"

• prerequisiteConceptTags:
  - Related concepts required first
  - Empty array if none

══════════════════════════════════════════════
6️⃣ DOCUMENT TRACEABILITY (MANDATORY)
══════════════════════════════════════════════
• sourcePageRefs:
  - PDF page numbers where concept appears
  - Example: [12, 13]

• narrativeSequence:
  - Reading order within document
  - Earlier concept → lower number

• sourceDocumentId:
  - MUST EXACTLY MATCH:
    \${docFingerprint}
  - DO NOT modify

══════════════════════════════════════════════
7️⃣ TRUST SCORE
══════════════════════════════════════════════
Rate extraction confidence:

1.0 = explicitly defined + examples  
0.9 = clearly stated  
0.8 = strongly implied  
0.7 = inferred but important  

⚠️ If trustScore < 0.7 → SKIP unless critical

══════════════════════════════════════════════
⚠️ STRICT OUTPUT RULES
══════════════════════════════════════════════
• OUTPUT: PURE JSON ONLY
• MUST match ATOM_EXTRACTION_SCHEMA exactly
• NO markdown
• NO commentary
• NO missing fields
• QUALITY > QUANTITY
• Maximum \${maxAtoms} atoms

══════════════════════════════════════════════
🎯 EXTRACTION PRIORITY
══════════════════════════════════════════════
1. Exam definitions
2. Laws, formulas, rules
3. Processes & classifications
4. Core examples used in exams

══════════════════════════════════════════════
🚀 BEGIN EXTRACTION
══════════════════════════════════════════════
Analyze the provided document segment and return:

{
  "atoms": [ ... ] }
`;

// ═══════════════════════════════════════════
// ATOM EXTRACTION PROMPTS (Subject-Based v1.3)
// ═══════════════════════════════════════════

/**
 * Default prompt for most subjects (Math, Science, Physics, etc.)
 * Supports multilingual extraction with strict language mirroring
 */
export const ATOM_EXTRACTION_DEFAULT = `
You are the EDUVA Chief Knowledge Architect, Master Teacher, and Senior Examiner.

Your task is to extract HIGH-QUALITY, DETERMINISTIC learning atoms that power:
• Adaptive quizzes
• Mastery tracking
• Auto-grading
• Parent analytics
• Knowledge graphs

This is NOT summarization.
This is KNOWLEDGE AUTHORING for automated assessment.
══════════════════════════════════════════════
🌐 MANDATORY OUTPUT LANGUAGE
══════════════════════════════════════════════
⚠️ NON-NEGOTIABLE:
TARGET_OUTPUT_LANGUAGE: \${targetLanguage}

You MUST output ALL textual content in \${targetLanguage}.
This includes: conceptTag, definition, keyRule, primaryExample, fullExplanation, analogy, misconceptions, essentialKeywords.

- DO NOT translate technical terms if the source uses the native term.
- DO NOT mix languages.
- DO NOT let English headers, meta-text, or instructions override this directive.
- Use formal academic grammar suitable for textbooks and exams.

Violation of this rule renders the atom INVALID.
══════════════════════════════════════════════
══════════════════════════════════════════════
📘 INPUT CONTEXT
══════════════════════════════════════════════
GRADE_LEVEL: \${gradeLevel}
SUBJECT: \${subject}
DOCUMENT_FINGERPRINT: \${docFingerprint}
MAX_ATOMS_THIS_BATCH: \${maxAtoms}

══════════════════════════════════════════════
1️⃣ ATOM DEFINITION (NON-NEGOTIABLE)
══════════════════════════════════════════════
• One concept = ONE atom
• Each atom must be:
  - Exam-relevant
  - Testable
  - Grade-appropriate
  - Deterministic

❌ DO NOT extract:
- Introductions, chapter previews
- Storytelling or author commentary
- Repeated examples of the same idea
- Procedural steps without conceptual meaning

══════════════════════════════════════════════
2️⃣ CONCEPT TAG RULES
══════════════════════════════════════════════
• conceptTag:
  - 2–5 words MAX
  - SAME language as source
  - NO transliteration
  - NO symbols
  - Example:
    - English: "Photosynthesis rate"
    - Arabic: "قانون نيوتن الثاني"

══════════════════════════════════════════════
3️⃣ CORE REPRESENTATION (ACADEMIC AUTHORITY)
══════════════════════════════════════════════
This is textbook / exam-board precision.

• definition:
  - Formal academic definition
  - 1–3 sentences

• keyRule:
  - Governing principle, theorem, or rule
  - Use LaTeX if applicable
  - Use "N/A" if none exists

• formula:
  - LaTeX ONLY
  - Empty string "" if not applicable

• primaryExample:
  - ONE canonical example
  - Exam-style if possible
  - Concise

══════════════════════════════════════════════
4️⃣ EXTENDED REPRESENTATION (MASTER TEACHER)
══════════════════════════════════════════════
Explain for a \${gradeLevel} student.

• fullExplanation:
  - Feynman-style explanation
  - 3–5 sentences
  - No unnecessary jargon

• analogy:
  - Real-world, relatable
  - Concrete, memorable

• misconceptions:
  - 2–4 common student misunderstandings
  - Focus on thinking errors, not quiz traps

══════════════════════════════════════════════
5️⃣ ASSESSMENT METADATA (CRITICAL — MUST EXIST)
══════════════════════════════════════════════
This section ENABLES grading and mastery.
Atoms missing this WILL BE REJECTED.

• essentialKeywords:
  - 5–10 MUST-HAVE terms for a correct answer
  - Include synonyms where relevant
  - Used for semantic grading

• highestBloomObserved:
  - Numeric Bloom level (1.0–6.0)

• difficultyCeiling:
  - Integer 1–5
    1 = Recall
    2 = Understand
    3 = Apply
    4 = Analyze
    5 = Evaluate/Create

• cognitiveLoad:
  - "low" | "medium" | "high"

• prerequisiteConceptTags:
  - Related concepts required first
  - Empty array if none

══════════════════════════════════════════════
6️⃣ DOCUMENT TRACEABILITY (MANDATORY)
══════════════════════════════════════════════
• sourcePageRefs:
  - PDF page numbers where concept appears
  - Example: [12, 13]

• narrativeSequence:
  - Reading order within document
  - Earlier concept → lower number

• sourceDocumentId:
  - MUST EXACTLY MATCH:
    \${docFingerprint}
  - DO NOT modify

══════════════════════════════════════════════
7️⃣ TRUST SCORE
══════════════════════════════════════════════
Rate extraction confidence:

1.0 = explicitly defined + examples  
0.9 = clearly stated  
0.8 = strongly implied  
0.7 = inferred but important  

⚠️ If trustScore < 0.7 → SKIP unless critical

══════════════════════════════════════════════
⚠️ STRICT OUTPUT RULES
══════════════════════════════════════════════
• OUTPUT: PURE JSON ONLY
• MUST match ATOM_EXTRACTION_SCHEMA exactly
• NO markdown
• NO commentary
• NO missing fields
• QUALITY > QUANTITY
• Maximum \${maxAtoms} atoms
• NO trailing commas (Standard JSON)
• NO comments inside JSON

══════════════════════════════════════════════
🎯 EXTRACTION PRIORITY
══════════════════════════════════════════════
1. Exam definitions
2. Laws, formulas, rules
3. Processes & classifications
4. Core examples used in exams

═══════════════════════════════════════════════
🚀 BEGIN EXTRACTION
══════════════════════════════════════════════
Analyze the provided document segment and return:

{
  "atoms": [ ... ]
}
`;

/**
 * English-specific prompt
 * Optimized for language learning: grammar, vocabulary, word formation
 */
export const ATOM_EXTRACTION_ENGLISH = `
You are the EDUVA Chief Knowledge Architect and Senior Examiner.

Your task is to extract HIGH-QUALITY learning atoms that are:
• Directly testable
• Exam-aligned
• Derived strictly from the document
• Suitable for automated quizzes and grading

THIS IS NOT SUMMARIZATION.
THIS IS EXAM ATOM AUTHORING.

════════════════════════════════════
🌐 MANDATORY OUTPUT LANGUAGE
════════════════════════════════════
⚠️ NON-NEGOTIABLE:
TARGET_OUTPUT_LANGUAGE: \${targetLanguage}
• You MUST output ALL content in \${targetLanguage}.
• DO NOT be distracted by English meta-text or worksheet instructions.
• Use academic, exam-appropriate tone.
• No storytelling, filler, or definitions outside schema.
• Do NOT invent content beyond the document.

════════════════════════════════════
📘 INPUT CONTEXT
════════════════════════════════════
Grade Level: \${gradeLevel}
Subject: English
Document: School workbook / exam practice
Max atoms: \${maxAtoms}

════════════════════════════════════
1️⃣ ATOM SELECTION (CRITICAL)
════════════════════════════════════
Extract ONLY concepts that satisfy ALL of the following:

✔ Appears in exercises, tasks, or exam questions
✔ Can generate a question WITHOUT being generic
✔ Has observable student mistakes
✔ Can be tested via:
   - gap-fill
   - multiple choice
   - sentence correction
   - word formation
   - contextual selection

❌ DO NOT extract:
- Pure topic titles (e.g. “Folk-tales” alone)
- Broad theory without task usage
- Cross-curricular mentions unless assessed
- Decorative reading headings

If a concept appears ONLY as a heading and NOT as a task → SKIP IT.

════════════════════════════════════
2️⃣ TASK-FIRST EXTRACTION RULE
════════════════════════════════════
If the document contains:
• Fill in the blanks
• Choose the correct word
• Use the word in capitals
• Complete the sentence
• Correct the mistake

THEN:
→ Extract the ATOM around the TASK, not the topic.

Example:
❌ “Word Formation”
✅ “Word Formation: Derivational Suffixes (-ful, -less)”

════════════════════════════════════
3️⃣ JSON STRUCTURE (STRICT – DO NOT CHANGE)
════════════════════════════════════
Each atom MUST match this schema exactly:

{
  "metadata": {
    "conceptTag": "2–5 words",
    "relatedConceptTags": ["string"],
    "sourcePageRefs": [number]
  },
  "coreRepresentation": {
    "definition": "Precise exam definition (1–2 sentences)",
    "keyRule": "Rule students must apply (or N/A)",
    "formula": "",
    "primaryExample": "EXAM-STYLE sentence or gap-fill"
  },
  "extendedRepresentation": {
    "fullExplanation": "3–5 sentences explaining HOW to apply it",
    "analogy": "Optional or N/A",
    "misconceptions": ["Common student error", "Another error"],
    "realWorldAnalogy": "Optional or N/A",
    "proTips": ["Exam tip", "Mark-scoring tip"]
  },
  "assessmentMetadata": {
    "difficultyCeiling": 1–5,
    "highestBloomObserved": 1.0–6.0,
    "essentialKeywords": ["5–10 grading keywords"],
    "cognitiveLoad": "low | medium | high",
    "prerequisiteConceptTags": []
  },
  "trustScore": 0.7–1.0
}

════════════════════════════════════
4️⃣ PRIMARY EXAMPLE (MANDATORY & STRICT)
════════════════════════════════════
The primaryExample MUST be one of the following:
• A gap-fill sentence
• A corrected sentence
• A word-formation sentence
• A short exam MCQ stem

If you cannot write such an example → DISCARD THE ATOM.

════════════════════════════════════
5️⃣ QUALITY GATE (SELF-CHECK)
════════════════════════════════════
Before outputting an atom, ask:

“Can this atom produce a NON-GENERIC exam question
without adding new information?”

If NO → DELETE THE ATOM.

QUALITY > QUANTITY.

════════════════════════════════════
🚀 OUTPUT RULES
════════════════════════════════════
• Output JSON only
• No markdown
• No comments
• No missing fields
• Skip weak atoms silently

Return ONLY:
{
  "atoms": [ ... ]
}
`;

/**
 * Science-specific prompt (Biology, Chemistry, Physics, General Science)
 * Optimized for: laws, formulas, classifications, experiments, processes
 */
export const ATOM_EXTRACTION_SCIENCE = `
You are the EDUVA Chief Science Knowledge Architect, Master Teacher, and Senior Examiner.

Your task is to extract HIGH-QUALITY, DETERMINISTIC science learning atoms that power:
• Adaptive quizzes (MCQ, true/false, fill-in)
• Lab and experiment recall
• Formula and law recall
• Process and classification mastery

══════════════════════════════════════════════
⚠️ LATEX COMPLIANCE (WORLD-CLASS RENDERING)
══════════════════════════════════════════════
You MUST use proper LaTeX for ALL formulas and equations.
❌ NEVER use HTML entities (e.g., &#215;).
❌ NEVER use cross symbols (e.g., ×).
✅ ALWAYS use LaTeX commands:
  - Multiplication: \times (e.g., F = m \times a)
  - Division: \div or \frac{}{}
  - Superscripts/Subscripts: ^{} and _{} (e.g., E = mc^{2})
  - Greek letters: \alpha, \beta, \Delta, etc.
  - Symbols: \approx, \neq, \le, \ge, \to

All LaTeX must be RAW (NO $ signs around it in the JSON).
The UI will wrap it automatically.

This is NOT summarization.
This is SCIENCE KNOWLEDGE AUTHORING for automated assessment.
══════════════════════════════════════════════
🌐 MANDATORY OUTPUT LANGUAGE
══════════════════════════════════════════════
⚠️ NON-NEGOTIABLE:
TARGET_OUTPUT_LANGUAGE: \${targetLanguage}

You MUST output ALL textual content in \${targetLanguage}.
- DO NOT let English headers, worksheet indicators, or meta-text override this.
- DO NOT translate. DO NOT mix languages.
- Use raw LaTeX for all mathematical expressions.
══════════════════════════════════════════════

══════════════════════════════════════════════
📘 INPUT CONTEXT
══════════════════════════════════════════════
GRADE_LEVEL: \${gradeLevel}
SUBJECT: \${subject}
DOCUMENT_FINGERPRINT: \${docFingerprint}
MAX_ATOMS_THIS_BATCH: \${maxAtoms}

══════════════════════════════════════════════
1️⃣ SCIENCE ATOM TYPES (Extract ALL that apply)
══════════════════════════════════════════════
Prioritize in this order:

1. LAWS & PRINCIPLES   (e.g. Newton's Laws, Ohm's Law, Cell Theory)
2. FORMULAS & EQUATIONS (e.g. F=ma, E=mc², photosynthesis equation)
3. CLASSIFICATIONS      (e.g. Kingdom, Phylum; types of bonds; states of matter)
4. PROCESSES & CYCLES   (e.g. Mitosis, Krebs Cycle, Water Cycle)
5. DEFINITIONS & TERMS  (e.g. osmosis, catalyst, velocity)
6. EXPERIMENTAL METHODS (e.g. how to identify an acid; Benedict's test)

❌ DO NOT extract:
- Chapter titles without scientific content
- Decorative diagrams with no text value
- Repeated examples of same concept

══════════════════════════════════════════════
2️⃣ CONCEPT TAG RULES
══════════════════════════════════════════════
• 2–5 words, in source language
• NO transliteration, NO symbols
• Examples:
  - English: "Newton second law", "Mitosis phases", "Photosynthesis equation"
  - Arabic: "قانون نيوتن الثاني", "مراحل الانقسام الميتوزي"

══════════════════════════════════════════════
3️⃣ CORE REPRESENTATION (EXAM-BOARD PRECISION)
══════════════════════════════════════════════
• definition:   Formal, precise scientific definition (1–3 sentences)
• keyRule:      The law, theorem, or principle. Use LaTeX for equations (use \times for multiplication).
• formula:      LaTeX ONLY. Strict \times usage. Use "" if not applicable.
• primaryExample: ONE canonical exam-style example (calculation, scenario, or identification task)

══════════════════════════════════════════════
4️⃣ EXTENDED REPRESENTATION (MASTER TEACHER)
══════════════════════════════════════════════
• fullExplanation:   Feynman-style, grade-appropriate (3–5 sentences)
• analogy:           Real-world science analogy
• misconceptions:    2–4 common student errors (e.g. confusing mass and weight)
• realWorldAnalogy:  Optional but strongly preferred for science
• proTips:           Exam tips specific to this concept

══════════════════════════════════════════════
5️⃣ ASSESSMENT METADATA (CRITICAL)
══════════════════════════════════════════════
• essentialKeywords:       5–10 terms required for a correct answer
• highestBloomObserved:    1.0 (recall) – 6.0 (evaluate/create)
• difficultyCeiling:       1 (recall) – 5 (evaluate)
• cognitiveLoad:           "low" | "medium" | "high"
• prerequisiteConceptTags: Related concepts the student must know first

══════════════════════════════════════════════
6️⃣ DOCUMENT TRACEABILITY (MANDATORY)
══════════════════════════════════════════════
• sourcePageRefs:    Page numbers where concept appears. Example: [12, 13]
• sourceDocumentId: MUST EXACTLY MATCH: \${docFingerprint}

══════════════════════════════════════════════
7️⃣ TRUST SCORE
══════════════════════════════════════════════
1.0 = explicitly stated with formula/example
0.9 = clearly stated
0.8 = strongly implied
0.7 = inferred (include only if core curriculum)
If trustScore < 0.7 → SKIP

══════════════════════════════════════════════
⚠️ STRICT OUTPUT RULES
══════════════════════════════════════════════
• OUTPUT: PURE JSON ONLY matching ATOM_EXTRACTION_SCHEMA
• NO markdown, NO commentary, NO trailing commas
• QUALITY > QUANTITY
• Maximum \${maxAtoms} atoms

Return ONLY:
{
  "atoms": [ ... ]
}
`;

// ═══════════════════════════════════════════
// PROMPT REGISTRY & RESOLVER
// ═══════════════════════════════════════════

/**
 * Subject-specific prompts registry
 * Partial<Record> allows subjects without prompts to use default
 */
export const ATOM_EXTRACTION_PROMPTS: Partial<Record<string, string>> = {
  English: ATOM_EXTRACTION_ENGLISH,
  Science: ATOM_EXTRACTION_SCIENCE,
  Biology: ATOM_EXTRACTION_SCIENCE,
  Chemistry: ATOM_EXTRACTION_SCIENCE,
  Physics: ATOM_EXTRACTION_SCIENCE,
  // Math: ATOM_EXTRACTION_MATH,      // TODO: Add Math-specific prompt
  // Arabic: ATOM_EXTRACTION_ARABIC,  // TODO: Add Arabic-specific prompt
};

/**
 * Resolve the appropriate extraction prompt for a subject
 * 
 * @param subject - Subject name (user-provided)
 * @returns Appropriate prompt (subject-specific or default)
 */
export function resolveAtomExtractionPrompt(subject: string): string {
  // Robust case-insensitive lookup
  const exactKey = Object.keys(ATOM_EXTRACTION_PROMPTS).find(
    key => key.toLowerCase() === (subject || '').toLowerCase()
  );

  const prompt = ATOM_EXTRACTION_PROMPTS[exactKey || subject];

  if (!prompt) {
    const msg = `[ATOM_EXTRACTION] No subject-specific prompt found for "${subject}". Using DEFAULT.`;
    const available = Object.keys(ATOM_EXTRACTION_PROMPTS);
    console.warn(msg, { subject, available });
    return ATOM_EXTRACTION_DEFAULT;
  }

  // Log which prompt was selected
  const promptName = (exactKey || subject) === 'English' ? 'ENGLISH' :
    (exactKey || subject) === 'Math' ? 'MATH' :
      (exactKey || subject) === 'Arabic' ? 'ARABIC' : 'CUSTOM';

  console.log(`[ATOM_EXTRACTION] ✓ Selected: ATOM_EXTRACTION_${promptName} for subject "${subject}" (Matched: "${exactKey}")`, {
    promptLength: prompt.length
  });

  return prompt;
}

// ═══════════════════════════════════════════
// LEGACY PROMPT (Keep for backwards compatibility)
// ═══════════════════════════════════════════

/**
 * @deprecated Use resolveAtomExtractionPrompt(subject) instead
 * Kept for backward compatibility with existing code
 */
export const ATOM_EXTRACTION_PROMPT_V7 = ATOM_EXTRACTION_DEFAULT;



export const QUIZ_GENERATION_PROMPT_V7 = `
You are the EDUVA v7 Adaptive Assessment Engine.
MISSION: Synthesize a dynamic quiz from provided Knowledge Atoms.

INPUTS:
- Atoms: Core knowledge units.
- Student Context: Current mastery scores and target difficulty.

STRICT CONSTRAINTS:
1. NEVER restate definitions verbatim.
2. Distractors MUST be derived from the 'misconceptions' field in the Atom.
3. Every question must have a 'hintLadder' (3 progressive hints).
4. Output JSON array of questions.
`;

export const BADGES = [
  { id: 'first_step', nameKey: 'badgeFirstStep', icon: '🐣', condition: (user: UserProfile, stats: UserStats) => stats.totalHistory > 0 },
  { id: 'quiz_master', nameKey: 'badgeQuizMaster', icon: '⚡', condition: (user: UserProfile, stats: UserStats) => stats.quizCount >= 10 },
  { id: 'note_taker', nameKey: 'badgeNoteTaker', icon: '📝', condition: (user: UserProfile, stats: UserStats) => stats.notesCount >= 5 },
  { id: 'streak_3', nameKey: 'badgeStreak3', icon: '🔥', condition: (user: UserProfile) => user.gamification.streak >= 3 },
  { id: 'scholar', nameKey: 'badgeScholar', icon: '🎓', condition: (user: UserProfile) => user.gamification.level >= 5 }
];

export const TRANSLATIONS = {
  English: {
    // ═══════════════════════════════════════════
    // COMMON (Shared across platform)
    // ═══════════════════════════════════════════
    appTitle: "EDUVA-Me",
    developedBy: "Developed by Mohamed Eisa",
    back: "Back",
    exit: "Exit",
    logout: "Logout",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    loading: "Loading...",
    error: "Error",
    success: "Success",
    confirm: "Confirm",

    // Navigation
    menuCreate: "Home",
    menuDashboard: "Growth Mirror",
    menuGamification: "Achievements",
    menuLibrary: "Library",
    backDashboard: "Back to Dashboard",

    // Gamification (existing)
    level: "Level",
    xp: "XP",
    streak: "Streak",
    weeklyChallenge: "Weekly Challenge",
    challengeTitle: "Mastery Sprint",
    challengeDesc: "Complete 5 study sessions this week to earn a special reward.",
    challengeReward: "Double XP",
    trophyRoom: "Trophy Room",
    leaderboard: "Leaderboard",
    badgeFirstStep: "First Step",
    badgeQuizMaster: "Quiz Master",
    badgeNoteTaker: "Note Taker",
    badgeStreak3: "Hot Streak",
    badgeScholar: "Scholar",

    // General Study
    subject: "Subject",
    eduLevel: "Grade Level",
    curriculum: "Curriculum",
    language: "Language",
    exportPdf: "Export as PDF",
    shareApp: "Share App",
    appLinkCopied: "Link Copied!",

    // ═══════════════════════════════════════════
    // PARENT MODULE
    // ═══════════════════════════════════════════
    parentHub: "Parent Hub",
    parentHubSubtitle: "Your child's learning journey",
    selectStudent: "Select Student",
    linkedStudents: "Linked Students",
    noStudentsLinked: "No students linked to your account",

    // Parent Compass (Screen 1)
    learningCompass: "Learning Compass",
    overallSignal: "Overall Learning Signal",
    conceptsInProgress: "Concepts In Progress",
    expanding: "Expanding",
    stable: "Stable",
    needsSupport: "Needs Support",
    stabilityTrend: "Stability Trend",
    lastUpdated: "Last Updated",
    viewDetails: "View Details",

    // Signals
    signalExpanding: "Expanding",
    signalStable: "Stable",
    signalNeedsSupport: "Needs Support",
    signalDescription: "How your child is progressing",

    // Parent Compass Details (Screen 2)
    subjectProgress: "Subject Progress",
    allSubjects: "All Subjects",
    conceptsCovered: "Concepts Covered",
    recentActivity: "Recent Activity",
    practiceNeeded: "Practice Needed",
    onTrack: "On Track",
    excelling: "Excelling",

    // Parent Progress Report (Screen 3)
    progressReport: "Progress Report",
    coveredConcepts: "Covered Concepts",
    momentum: "Momentum",
    momentumRising: "Rising",
    momentumStable: "Stable",
    momentumSlowing: "Slowing",
    lastPracticed: "Last Practiced",
    daysAgo: "days ago",
    conceptsTotal: "Total Concepts",
    dataUnavailable: "Data unavailable",
    noConceptsYet: "No concepts covered yet",
    masteredConcepts: "Mastered Concepts",
    pendingConcepts: "Pending Concepts",
    recentMomentum: "Recent Momentum",
    masteryHealth: "Mastery Health",
    importantReminder: "Important Reminder",
    chapterTimeline: "Chapter / File Timeline",

    // ═══════════════════════════════════════════
    // QUIZ MODULE V2
    // ═══════════════════════════════════════════
    quizTitle: "Practice Matrix",
    quizSubtitle: "Adaptive Quiz",
    generateQuiz: "Generate Quiz",
    startQuiz: "Start Quiz",
    quit: "Quit",
    quizComplete: "Quiz Complete!",

    // Quiz Configuration
    selectSubject: "Select Subject",
    selectDifficulty: "Select Difficulty",
    questionCount: "Number of Questions",
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",

    // Quiz Interface
    question: "Question",
    of: "of",
    progress: "Progress",
    depth: "Depth",
    pool: "Pool",
    left: "left",

    // Question Types
    multipleChoice: "Multiple Choice",
    fillInBlank: "Fill in the Blank",
    matching: "Matching",
    trueFalse: "True/False",

    // Actions
    submit: "Submit",
    next: "Next",
    previous: "Previous",
    skipQuestion: "Skip",
    showHint: "Show Hint",
    checkAnswer: "Check Answer",

    // Feedback
    correct: "Correct!",
    incorrect: "Incorrect",
    tryAgain: "Try Again",
    wellDone: "Well Done!",
    keepGoing: "Keep Going!",
    almostThere: "Almost There!",

    // Results
    yourScore: "Your Score",
    questionsAnswered: "Questions Answered",
    accuracy: "Accuracy",
    timeSpent: "Time Spent",
    reviewAnswers: "Review Answers",
    retakeQuiz: "Retake Quiz",

    // Cognitive Ladder
    recall: "Recall",
    apply: "Apply",
    analyze: "Analyze",

    // ═══════════════════════════════════════════
    // STUDENT COMPASS
    // ═══════════════════════════════════════════
    yourCompass: "Your Learning Compass",
    overallProgress: "Overall Progress",
    strengthAreas: "Strength Areas",
    growthAreas: "Growth Opportunities",
    recentBreakthroughs: "Recent Breakthroughs",
    upcomingChallenges: "Upcoming Challenges",
    reflectionPrompt: "How do you feel about your progress today?",
    setGoal: "Set a Learning Goal",
    viewHistory: "View History",

    // Signals (Student View)
    yourSignal: "Your Signal",
    keepPracticing: "Keep Practicing",
    youAreExcelling: "You're Excelling!",
    steadyProgress: "Steady Progress",

    // ═══════════════════════════════════════════
    // LIBRARY MODULE
    // ═══════════════════════════════════════════
    controlPlane: "Control Plane",
    allDocs: "All Docs",
    pending: "Pending",
    trained: "Trained",
    newFolder: "New Folder",
    upload: "Upload",
    uploadDocument: "Upload Document",
    selectFile: "Select File",

    // Document Management
    fileName: "Filename",
    status: "Status",
    action: "Action",
    train: "Train",
    retrain: "Retrain",
    viewLogs: "View Logs",
    rename: "Rename",
    moveToFolder: "Move to Folder",

    // Folders
    createFolder: "Create Folder",
    folderName: "Folder Name",
    allDocuments: "All Documents",
    noDocumentsFound: "No Documents Found",

    // Training Status
    statusPending: "Pending",
    statusTraining: "Training...",
    statusReady: "Ready",
    statusFailed: "Failed",
    atomsExtracted: "Atoms Extracted",

    // Profile Matrix
    profileMatrix: "Profile Matrix",
    globalView: "Global View",

    // ═══════════════════════════════════════════
    // NOTES ASSEMBLER
    // ═══════════════════════════════════════════
    studyNotes: "Study Notes",
    notesAssembler: "Notes Assembler",
    generateNotes: "Generate Notes",
    selectDocuments: "Select Documents",
    documentsSelected: "Documents Selected",
    fullNotes: "Full Notes",
    cheatSheet: "Cheat Sheet",
    preview: "Preview",
    download: "Download",
    generatingNotes: "Generating Notes...",
    notesReady: "Notes Ready!",

    // Old keys (backwards compatibility)
    modePodcast: "Podcast",
    modeLazy: "Lazy Mode",
    modeQuiz: "Quiz",
    modeExam: "Exam",
    reviewComplete: "Review Complete!",
    noDueCards: "No cards due for review.",
    cardShort: "Cards",
    tapFlip: "Tap to flip",
    ratingAgain: "Again",
    ratingHard: "Hard",
    ratingGood: "Good",
    ratingEasy: "Easy",
    revealAnswer: "Reveal Answer",
    vivaTitle: "Voice Tutor",
    vivaIntro: "Speak with your AI tutor to verify your knowledge.",
    vivaSpeaking: "AI is speaking...",
    vivaListening: "Listening to you...",
    vivaStart: "Start Voice Mode",
    vivaEnd: "End Session",
    scriptView: "View Script",
    downloadAudio: "Download Audio"
  },

  Arabic: {
    // ═══════════════════════════════════════════
    // COMMON (مشترك عبر المنصة)
    // ═══════════════════════════════════════════
    appTitle: "إديوفا-مي",
    developedBy: "Developed by Mohamed Eisa",
    back: "رجوع",
    exit: "خروج",
    logout: "تسجيل الخروج",
    save: "حفظ",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    close: "إغلاق",
    loading: "جاري التحميل...",
    error: "خطأ",
    success: "نجح",
    confirm: "تأكيد",

    // التنقل
    menuCreate: "الرئيسية",
    menuDashboard: "سجل الدراسة",
    menuGamification: "الإنجازات",
    menuLibrary: "المكتبة",
    backDashboard: "العودة للوحة التحكم",

    // التلعيب (gamification)
    level: "مستوى",
    xp: "نقطة",
    streak: "تتابع",
    weeklyChallenge: "تحدي الأسبوع",
    challengeTitle: "ماراثون الإتقان",
    challengeDesc: "أكمل 5 جلسات دراسية هذا الأسبوع للحصول على مكافأة خاصة.",
    challengeReward: "نقاط مضاعفة",
    trophyRoom: "غرفة الجوائز",
    leaderboard: "لوحة المتصدرين",
    badgeFirstStep: "الخطوة الأولى",
    badgeQuizMaster: "خبير الاختبارات",
    badgeNoteTaker: "مدون الملاحظات",
    badgeStreak3: "تتابع ناري",
    badgeScholar: "باحث",

    // عام - دراسة
    subject: "المادة",
    eduLevel: "المستوى الدراسي",
    curriculum: "المنهج",
    language: "اللغة",
    exportPdf: "تصدير PDF",
    shareApp: "مشاركة التطبيق",
    appLinkCopied: "تم نسخ الرابط!",

    // ═══════════════════════════════════════════
    // وحدة أولياء الأمور
    // ═══════════════════════════════════════════
    parentHub: "مركز أولياء الأمور",
    parentHubSubtitle: "رحلة التعلم لطفلك",
    selectStudent: "اختر الطالب",
    linkedStudents: "الطلاب المرتبطون",
    noStudentsLinked: "لا يوجد طلاب مرتبطون بحسابك",

    // بوصلة الأهل (الشاشة 1)
    learningCompass: "بوصلة التعلم",
    overallSignal: "الإشارة العامة للتعلم",
    conceptsInProgress: "مفاهيم قيد التقدم",
    expanding: "توسع",
    stable: "مستقر",
    needsSupport: "يحتاج دعم",
    stabilityTrend: "اتجاه الاستقرار",
    lastUpdated: "آخر تحديث",
    viewDetails: "عرض التفاصيل",

    // الإشارات
    signalExpanding: "توسع",
    signalStable: "مستقر",
    signalNeedsSupport: "يحتاج دعم",
    signalDescription: "كيف يتقدم طفلك",

    // تفاصيل بوصلة الأهل (الشاشة 2)
    subjectProgress: "تقدم المادة",
    allSubjects: "جميع المواد",
    conceptsCovered: "المفاهيم المغطاة",
    recentActivity: "النشاط الأخير",
    practiceNeeded: "يحتاج تمرين",
    onTrack: "على المسار",
    excelling: "متفوق",

    // تقرير تقدم الأهل (الشاشة 3)
    progressReport: "تقرير التقدم",
    coveredConcepts: "المفاهيم المغطاة",
    momentum: "الزخم",
    momentumRising: "صاعد",
    momentumStable: "مستقر",
    momentumSlowing: "متباطئ",
    lastPracticed: "آخر تدريب",
    daysAgo: "أيام مضت",
    conceptsTotal: "إجمالي المفاهيم",
    dataUnavailable: "البيانات غير متوفرة",
    noConceptsYet: "لم يتم تغطية أي مفاهيم بعد",
    masteredConcepts: "المفاهيم المتقنة",
    pendingConcepts: "المفاهيم المعلقة",
    recentMomentum: "الزخم الحالي",
    masteryHealth: "صحة الإتقان",
    importantReminder: "تذكير هام",
    chapterTimeline: "الجدول الزمني للفصل/الملف",

    // ═══════════════════════════════════════════
    // وحدة الاختبارات V2
    // ═══════════════════════════════════════════
    quizTitle: "مصفوفة التدريب",
    quizSubtitle: "اختبار تكيفي",
    generateQuiz: "إنشاء اختبار",
    startQuiz: "بدء الاختبار",
    quit: "خروج",
    quizComplete: "اكتمل الاختبار!",

    // إعدادات الاختبار
    selectSubject: "اختر المادة",
    selectDifficulty: "اختر الصعوبة",
    questionCount: "عدد الأسئلة",
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",

    // واجهة الاختبار
    question: "سؤال",
    of: "من",
    progress: "تقدم",
    depth: "عمق",
    pool: "مجموعة",
    left: "متبقي",

    // أنواع الأسئلة
    multipleChoice: "اختيار من متعدد",
    fillInBlank: "املأ الفراغ",
    matching: "مطابقة",
    trueFalse: "صح/خطأ",

    // الإجراءات
    submit: "إرسال",
    next: "التالي",
    previous: "السابق",
    skipQuestion: "تجاوز",
    showHint: "إظهار تلميح",
    checkAnswer: "تحقق من الإجابة",

    // التغذية الراجعة
    correct: "صحيح!",
    incorrect: "خطأ",
    tryAgain: "حاول مرة أخرى",
    wellDone: "أحسنت!",
    keepGoing: "استمر!",
    almostThere: "أوشكت!",

    // النتائج
    yourScore: "نتيجتك",
    questionsAnswered: "الأسئلة المجابة",
    accuracy: "الدقة",
    timeSpent: "الوقت المستغرق",
    reviewAnswers: "مراجعة الإجابات",
    retakeQuiz: "إعادة الاختبار",

    // السلم المعرفي
    recall: "تذكر",
    apply: "تطبيق",
    analyze: "تحليل",

    // ═══════════════════════════════════════════
    // بوصلة الطالب
    // ═══════════════════════════════════════════
    yourCompass: "بوصلتك التعليمية",
    overallProgress: "التقدم العام",
    strengthAreas: "مجالات القوة",
    growthAreas: "فرص النمو",
    recentBreakthroughs: "إنجازات حديثة",
    upcomingChallenges: "تحديات قادمة",
    reflectionPrompt: "كيف تشعر حيال تقدمك اليوم؟",
    setGoal: "ضع هدف تعليمي",
    viewHistory: "عرض السجل",

    // الإشارات (منظور الطالب)
    yourSignal: "إشارتك",
    keepPracticing: "استمر بالتمرين",
    youAreExcelling: "أنت متفوق!",
    steadyProgress: "تقدم ثابت",

    // ═══════════════════════════════════════════
    // وحدة المكتبة
    // ═══════════════════════════════════════════
    controlPlane: "لوحة التحكم",
    allDocs: "جميع المستندات",
    pending: "قيد الانتظار",
    trained: "مدرب",
    newFolder: "مجلد جديد",
    upload: "رفع",
    uploadDocument: "رفع مستند",
    selectFile: "اختر ملف",

    // إدارة المستندات
    fileName: "اسم الملف",
    status: "الحالة",
    action: "إجراء",
    train: "تدريب",
    retrain: "إعادة تدريب",
    viewLogs: "عرض السجلات",
    rename: "إعادة تسمية",
    moveToFolder: "نقل إلى مجلد",

    // المجلدات
    createFolder: "إنشاء مجلد",
    folderName: "اسم المجلد",
    allDocuments: "جميع المستندات",
    noDocumentsFound: "لم يتم العثور على مستندات",

    // حالة التدريب
    statusPending: "قيد الانتظار",
    statusTraining: "جاري التدريب...",
    statusReady: "جاهز",
    statusFailed: "فشل",
    atomsExtracted: "ذرات مستخرجة",

    // مصفوفة الملف الشخصي
    profileMatrix: "مصفوفة الملف الشخصي",
    globalView: "عرض شامل",

    // ═══════════════════════════════════════════
    // مجمّع الملاحظات
    // ═══════════════════════════════════════════
    studyNotes: "ملاحظات دراسية",
    notesAssembler: "مجمّع الملاحظات",
    generateNotes: "إنشاء ملاحظات",
    selectDocuments: "اختر المستندات",
    documentsSelected: "مستندات محددة",
    fullNotes: "ملاحظات كاملة",
    cheatSheet: "ورقة غش",
    preview: "معاينة",
    download: "تحميل",
    generatingNotes: "جاري إنشاء الملاحظات...",
    notesReady: "الملاحظات جاهزة!",

    // مفاتيح قديمة (للتوافق)
    modePodcast: "بودكاست",
    modeLazy: "الوضع الكسول",
    modeQuiz: "اختبار",
    modeExam: "امتحان",
    reviewComplete: "اكتملت المراجعة!",
    noDueCards: "لا توجد بطاقات للمراجعة حالياً.",
    cardShort: "بطاقة",
    tapFlip: "انقر للقلب",
    ratingAgain: "مرة أخرى",
    ratingHard: "صعب",
    ratingGood: "جيد",
    ratingEasy: "سهل",
    revealAnswer: "كشف الإجابة",
    vivaTitle: "المعلم الصوتي",
    vivaIntro: "تحدث مع معلمك الذكي للتحقق من معلوماتك.",
    vivaSpeaking: "المعلم يتحدث...",
    vivaListening: "جاري الاستماع...",
    vivaStart: "بدء الوضع الصوتي",
    vivaEnd: "إنهاء الجلسة",
    scriptView: "عرض النص",
    downloadAudio: "تحميل الصوت"
  }
};
