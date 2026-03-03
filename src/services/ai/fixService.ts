import { Type } from "@google/genai";
import { GenerationRequest, FixStudyData, QuizData, Language, QuizType, Difficulty, RemedialContent, StrategicStep } from '../../types';
import { getAiClient, callAiWithRetry, sanitizeModelName, FALLBACK_MODEL } from './client';
import { AI_MODELS } from './constants';
import { db, auth } from '../firebaseConfig';
import { hydrateQuiz, getLibraryItemByContentId } from '../storageService';

const REMEDIAL_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        analogy: {
            type: Type.STRING,
            description: "A simple, non-academic real-world analogy to introduce the concept. Card 1."
        },
        explanation: {
            type: Type.STRING,
            description: "A Grade-level appropriate explanation of WHY the concept exists and HOW it works. Card 2."
        },
        examples: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    scenario: { type: Type.STRING },
                    application: { type: Type.STRING }
                },
                required: ['scenario', 'application']
            },
            description: "Two concrete examples NOT found in standard textbooks. Card 3."
        }
    },
    required: ['analogy', 'explanation', 'examples']
};

const STRATEGIC_REPAIR_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        narrative: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    phase: { type: Type.STRING, description: "Phase name (Foundation, Projection, or Thread)" },
                    title: { type: Type.STRING, description: "A clear heading for this step" },
                    content: { type: Type.STRING, description: "Detailed, simple explanation connecting concepts" },
                    projection: { type: Type.STRING, description: "Real-world projection analogy" }
                },
                required: ['phase', 'title', 'content', 'projection']
            }
        }
    },
    required: ['narrative']
};

/**
 * REFACTOR 1: SURGICAL REPAIR (Context-Aware & Grade-Appropriate)
 */
export const generateFixStudyNotes = async (req: GenerationRequest, onStatus?: (msg: string) => void): Promise<FixStudyData> => {
    const isStrategic = req.struggleAtoms && req.struggleAtoms.length > 1;

    if (isStrategic) {
        return generateRepairedNotes(req, onStatus);
    }

    let targetConcept = req.struggleAtoms?.[0] || req.topic;

    const isGeneric = targetConcept.toLowerCase().includes('generated quiz') ||
        targetConcept.toLowerCase().includes('assessment') ||
        targetConcept.toLowerCase().includes('knowledge check');

    if (isGeneric) {
        targetConcept = req.subject;
    }

    // 1. DYNAMIC GRADE LEVEL
    const studentGrade = req.metadata?.gradeLevel || req.year || "Grade 10";

    // 2. CONTEXT INJECTION
    const contextHeader = req.subject ? `Subject: ${req.subject}.` : "";

    const { ai, apiKey, config } = getAiClient('notes', onStatus);
    const modelToUse = config.defaultModel;

    if (onStatus) onStatus(`[UCCS_FIX] Protocol 6.5: Translating "${targetConcept}" for ${studentGrade}...`);

    let sourceContext = req.customContext?.sourceText || "";
    if (!sourceContext && req.contentId && req.contentId !== 'GLOBAL' && auth.currentUser) {
        const libItem = await getLibraryItemByContentId(req.contentId, auth.currentUser.uid);
        if (libItem && libItem.data) {
            sourceContext = `From Document ${libItem.name}: [Original text snippet about ${targetConcept}]`;
        }
    }

    const systemInstruction = `
        You are the EDUVA Remedial Translator. 
        MISSION:
        1. AUDIENCE ADAPTATION: Explain concepts for a ${studentGrade} student.
        2. SURGICAL BOUNDARY: Use ONLY the provided context for facts. Do not hallucinate external theories.
        3. 3-CARD STRUCTURE: 
           - Card 1 (Analogy): A non-academic, real-world comparison relatable to a ${studentGrade} student.
           - Card 2 (The Logic): Clear breakdown of WHY it works (The "Aha!" moment).
           - Card 3 (Application): 2 concrete examples NOT found in standard textbooks.
        
        LANGUAGE: ${req.language}.
    `;

    const response = await callAiWithRetry(ai, {
        model: modelToUse,
        contents: `Translate and simplify: "${targetConcept}". ${contextHeader} Context: ${sourceContext || 'Standard Academic Definition'}.`,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: REMEDIAL_SCHEMA,
            temperature: config.temperature,
            topP: config.topP,
            topK: config.topK,
            maxOutputTokens: config.maxOutputTokens
        }
    }, onStatus, [], apiKey);

    const structuredContent: RemedialContent = JSON.parse(response.text || '{}');

    const fixData: FixStudyData = {
        fixMissionId: req.sourceMissionId || `fix_${Date.now()}`,
        studentId: req.metadata?.studentId || 'unknown',
        contentId: req.contentId || 'GLOBAL',
        conceptTag: targetConcept,
        subject: req.subject,
        generatedAt: Date.now(),
        notesContent: JSON.stringify(structuredContent),
        language: req.language,
        repairedType: 'ATOMIC'
    };

    await db.collection('remediation_sessions').doc(fixData.fixMissionId).set({
        ...fixData,
        content: structuredContent,
        status: 'READING',
        startedAt: Date.now()
    });

    return fixData;
};

/**
 * STRATEGIC REPAIR: Multi-Concept Rescue Mission
 */
export const generateRepairedNotes = async (req: GenerationRequest, onStatus?: (msg: string) => void): Promise<FixStudyData> => {
    const concepts = req.struggleAtoms || [];
    const studentGrade = req.metadata?.gradeLevel || req.year || "Grade 10";
    const { ai, apiKey, config } = getAiClient('notes', onStatus);
    const modelToUse = config.defaultModel;

    if (onStatus) onStatus(`[RESCUE] Identifying common thread for ${concepts.length} gaps...`);

    let sourceContext = "";
    if (req.contentId && req.contentId !== 'GLOBAL' && auth.currentUser) {
        const libItem = await getLibraryItemByContentId(req.contentId, auth.currentUser.uid);
        if (libItem && libItem.data) {
            sourceContext = `Document Context: ${libItem.name}. Full material analysis provided.`;
        }
    }

    const systemInstruction = `
        You are the EDUVA Strategic Architect.
        MISSION: Connect multiple failing dots into a unified logic for a ${studentGrade} student.
        
        INPUT CONCEPTS: ${concepts.join(', ')}.
        
        STRATEGY: REPAIRED_NOTES (Linear Narrative)
        1. THE LINKER: Analyze these tags and identify the Common Thread (e.g., "Data Acquisition").
        2. THE FOUNDATION: Start with the simplest failed concept.
        3. THE PROJECTION: Use "real-world projections" relatable to a ${studentGrade} student.
        4. THE THREAD: Explicitly explain how Concept A leads into Concept B.
        5. SURGICAL BOUNDARY: Use ONLY provided document context as factual boundary. No external theory.
        
        LANGUAGE: ${req.language}.
    `;

    const response = await callAiWithRetry(ai, {
        model: modelToUse,
        contents: `Rescue Mission: Connect the following failing concepts into a unified path: ${concepts.join(', ')}. Context: ${sourceContext}`,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: STRATEGIC_REPAIR_SCHEMA,
            temperature: config.temperature,
            topP: config.topP,
            topK: config.topK,
            maxOutputTokens: config.maxOutputTokens
        }
    }, onStatus, [], apiKey);

    const structuredContent = JSON.parse(response.text || '{"narrative":[]}');

    const fixData: FixStudyData = {
        fixMissionId: req.sourceMissionId || `strategic_fix_${Date.now()}`,
        studentId: req.metadata?.studentId || 'unknown',
        contentId: req.contentId || 'GLOBAL',
        conceptTag: concepts[0],
        subject: req.subject,
        generatedAt: Date.now(),
        notesContent: JSON.stringify(structuredContent),
        language: req.language,
        repairedType: 'STRATEGIC',
        struggleAtoms: concepts
    };

    await db.collection('remediation_sessions').doc(fixData.fixMissionId).set({
        ...fixData,
        content: structuredContent,
        status: 'READING',
        startedAt: Date.now()
    });

    return fixData;
};

/**
 * REFACTOR 2: MASTERY QUIZ (Unbreakable Index Logic)
 */
export const generateFixMasteryQuiz = async (req: GenerationRequest, remedialJson: string, onStatus?: (msg: string) => void): Promise<QuizData> => {
    const targetConcept = req.struggleAtoms?.[0] || req.topic;
    const isStrategic = req.struggleAtoms && req.struggleAtoms.length > 1;

    const { ai, apiKey, config } = getAiClient('quiz', onStatus);
    const modelToUse = config.fastModel || config.defaultModel;

    if (onStatus) onStatus(`[UCCS_VERIFY] Generating Unbreakable Mastery Check...`);

    const systemInstruction = `
        You are the EDUVA Mastery Verifier. 
        MISSION: Verify understanding of these addressed gaps: ${req.struggleAtoms?.join(', ')}.
        
        STRICT BOUNDARY: Only generate questions based on this remedial content: ${remedialJson}.
        
        CONSTRAINTS:
        - Generate exactly ${isStrategic ? Math.min(15, (req.struggleAtoms?.length || 1) * 2) : 3} Multiple Choice Questions.
        - Difficulty: Recall -> Understand. 
        - OUTPUT RULE: 'correctOptionIndex' must be an integer (0-3) pointing to the correct option in the array.
        
        LANGUAGE: ${req.language}.
    `;

    const QUIZ_SCHEMA = {
        type: Type.OBJECT,
        properties: {
            questions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        options: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        correctOptionIndex: { type: Type.INTEGER, description: "0-3" },
                        explanation: { type: Type.STRING }
                    },
                    required: ['question', 'options', 'correctOptionIndex', 'explanation']
                }
            }
        },
        required: ['questions']
    };

    const response = await callAiWithRetry(ai, {
        model: modelToUse,
        contents: `Verify student mastery of the connected concepts.`,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: QUIZ_SCHEMA,
            temperature: config.temperature,
            topP: config.topP,
            topK: config.topK,
            maxOutputTokens: config.maxOutputTokens
        }
    }, onStatus, [], apiKey);

    const raw = JSON.parse(response.text || '{"questions":[]}');

    return {
        title: `Mastery Verification`,
        topic: isStrategic ? `Rescue Mission: ${req.subject}` : `Mastery Check: ${targetConcept}`,
        questions: (raw.questions || []).map((q: any, i: number) => {
            const safeIndex = (q.correctOptionIndex >= 0 && q.correctOptionIndex < q.options.length)
                ? q.correctOptionIndex
                : 0;

            return {
                id: `fix_v_${Date.now()}_${i}`,
                question: q.question,
                type: 'MCQ',
                options: q.options,
                correctAnswer: q.options[safeIndex],
                explanation: q.explanation,
                difficulty: 'Easy',
                topic: targetConcept,
                cognitiveLevel: 'Understand'
            };
        }),
        timestamp: Date.now(),
        contentId: req.contentId,
        fileName: req.fileName,
        sourceMissionId: req.sourceMissionId,
        struggleAtoms: req.struggleAtoms
    };
};