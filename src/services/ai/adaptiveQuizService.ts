
import { Type, GoogleGenAI } from "@google/genai";
import {
    GenerationRequest, QuizSessionInit, QuestionRuntime, UserProfile, Difficulty,
    AppView, Language, EducationSystem, AtomCore, QuestionResult
} from '../../types';
import { getAiClient, callAiWithRetry, sanitizeModelName } from './client';
import { AI_MODELS } from './constants';
import { getLocalAtoms, getDecayingAtoms } from '../storageService';
import { hydrateAtomList } from '../hydrationService';

const QSIO_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        recommendedDifficulty: { type: Type.STRING, enum: ["easy", "medium", "hard", "adaptive"] },
        estimatedDurationMin: { type: Type.NUMBER },
        xpPotential: { type: Type.NUMBER },
        startLevel: { type: Type.NUMBER },
        maxLevel: { type: Type.NUMBER },
        forcedRemediation: { type: Type.BOOLEAN },
        mood: { type: Type.STRING, enum: ["neutral", "tired", "sharp"] },
        allowedAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["recommendedDifficulty", "estimatedDurationMin", "startLevel", "maxLevel", "allowedAtomIds"]
};

const QRO_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        type: { type: Type.STRING, enum: ['MCQ', 'MultiSelect', 'ShortAnswer', 'Scenario', 'Hotspot', 'Ordering', 'Matching', 'Grouping', 'FillInTheBlank'] },
        atomId: { type: Type.STRING },
        conceptTag: { type: Type.STRING },
        difficultyLevel: { type: Type.NUMBER },
        questionText: { type: Type.STRING },
        options: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING }
                },
                required: ["id", "text"]
            }
        },
        validation: {
            type: Type.OBJECT,
            properties: {
                correctAnswer: { type: Type.STRING },
                expectedConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                hotspotTarget: {
                    type: Type.OBJECT,
                    properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, radius: { type: Type.NUMBER } }
                },
                orderSequence: { type: Type.ARRAY, items: { type: Type.STRING } },
                matchPairs: { type: Type.OBJECT }
            }
        },
        explanation: { type: Type.STRING },
        feedbackVisuals: {
            type: Type.OBJECT,
            properties: {
                overlayImage: { type: Type.STRING }
            }
        },
        timeLimitSec: { type: Type.NUMBER },
        allowHints: { type: Type.BOOLEAN },
        hints: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    cost: { type: Type.NUMBER },
                    revealsAnswer: { type: Type.BOOLEAN }
                },
                required: ["text", "cost"]
            }
        }
    },
    required: ["type", "atomId", "questionText", "explanation", "timeLimitSec"]
};

/**
 * BUNKER MODE: Local Fallback Generators
 */
const generateLocalBunkerSession = (corePool: AtomCore[], ghostIds: string[], req: GenerationRequest): QuizSessionInit => {
    const ids = Array.from(new Set([...ghostIds, ...corePool.map(a => a.atomId)])).slice(0, 50);
    return {
        identity: { sessionId: `bunker_${Date.now()}`, initiatedBy: req.sourceMissionId ? 'parent_fix' : 'student' },
        scope: { conceptTags: Array.from(new Set(corePool.map(a => a.metadata.conceptTag))), subject: req.subject },
        atomConstraint: { trainedOnly: true, allowedAtomIds: ids, ghostAtomIds: ghostIds },
        uiPredictiveState: {
            recommendedDifficulty: "medium",
            estimatedDurationMin: 10,
            incentivePromise: { xpPotential: 40, streakAtRisk: false }
        },
        ladderConstraints: { startLevel: 1, maxLevel: 3, forcedRemediation: false },
        behaviorProfile: { defaultMood: 'neutral', modifiers: { timePenaltyDisabled: true, hintsUnlimited: false } }
    };
};

const generateLocalBunkerQuestion = (atom: AtomCore, allAtoms: AtomCore[], level: number, sessionId: string): QuestionRuntime => {
    const others = allAtoms.filter(a => a.atomId !== atom.atomId).sort(() => Math.random() - 0.5).slice(0, 3);

    // Fix: generateLocalBunkerQuestion should return string[] options to match QuizQuestionV2 through QuestionRuntime
    const optionTexts = [
        atom.coreRepresentation.definition,
        ...others.map(o => o.coreRepresentation.definition)
    ];

    while (optionTexts.length < 4) {
        optionTexts.push(`Alternative educational logic pathway ${optionTexts.length}`);
    }

    return {
        type: 'MCQ',
        atomId: atom.atomId,
        conceptTag: atom.metadata.conceptTag,
        difficultyLevel: level,
        questionText: `Verify the core definition of the concept: ${atom.metadata.conceptTag}`,
        // Convert to shuffled string array
        options: optionTexts.sort(() => Math.random() - 0.5),
        validation: { correctAnswer: atom.coreRepresentation.definition },
        explanation: `Offline Reference: ${atom.extendedRepresentation.fullExplanation}`,
        timeLimitSec: 60,
        allowHints: false,
        hints: [],
        sessionId,
        questionId: `bunker_q_${Date.now()}`
    } as QuestionRuntime;
};

/**
 * PHASE 1: SESSION ARCHITECT (QSIO)
 */
export const initializeAdaptiveSession = async (
    req: GenerationRequest,
    user: UserProfile,
    onStatus?: (msg: string) => void
): Promise<QuizSessionInit> => {
    const log = (msg: string) => onStatus?.(`[QSIO_ARCHITECT] ${msg}`);
    log("Initializing Adaptive Session Architect v1.5.5...");

    let corePool: AtomCore[] = [];

    // --- REPAIR MODE: PRIORITIZE STRUGGLE ATOMS ---
    if (req.struggleAtoms && req.struggleAtoms.length > 0) {
        log(`[REPAIR_MODE] Targeted Mission: ${req.struggleAtoms.length} weak atoms.`);
        corePool = await hydrateAtomList(req.struggleAtoms);
        if (corePool.length === 0) {
            console.warn("[QSIO] Repair target missing locally/globally. Falling back to document selection.");
        }
    }

    // --- STANDARD MODE: DOCUMENT SELECTION ---
    if (corePool.length === 0) {
        const targetDocIds = req.selectedDocumentIds || [];
        for (const docId of targetDocIds) {
            const atoms = await getLocalAtoms(user.id, docId);
            corePool = [...corePool, ...atoms.map(a => a.core)];
        }
    }

    if (corePool.length === 0) {
        throw new Error("No knowledge atoms available for session initialization.");
    }

    const decayingAtoms = await getDecayingAtoms(user.id, req.subject);
    const ghostAtoms = decayingAtoms.slice(0, 5);
    const ghostIds = ghostAtoms.map(a => a.atomId);
    if (ghostIds.length > 0) log(`[UCCS_SR] Injected ${ghostIds.length} Ghost Atoms.`);

    const combinedPool = [...ghostAtoms.map(a => a.core), ...corePool];
    const uniqueIds = Array.from(new Set(combinedPool.map(a => a.atomId)));
    const MAX_ATOMS = 50;
    const allowedIds = uniqueIds.slice(0, MAX_ATOMS);

    try {
        const atomContext = combinedPool.filter(a => allowedIds.includes(a.atomId)).map(a => ({
            id: a.atomId,
            tag: a.metadata.conceptTag,
            level: 3 // Default level ceiling
        }));

        const { ai, apiKey } = getAiClient('quiz', onStatus);

        const response = await callAiWithRetry(ai, {
            contents: `Student: ${user.name}. Subject: ${req.subject}. Atoms: ${JSON.stringify(atomContext)}. Mode: ${req.quizMode || 'PRACTICE'}.`,
            config: {
                systemInstruction: `You are the EDUVA Session Architect. MISSION: Configure adaptive session. Output JSON matching QSIO schema.`,
                responseMimeType: 'application/json',
                responseSchema: QSIO_SCHEMA,
                temperature: 0.2, // standard session temp
                maxOutputTokens: 1500
            }
        }, 'quiz', [], apiKey);

        const plan = JSON.parse(response.text || '{}');

        return {
            identity: { sessionId: `sess_${Date.now()}`, initiatedBy: req.sourceMissionId ? 'parent_fix' : 'student' },
            scope: { conceptTags: Array.from(new Set(combinedPool.map(a => a.metadata.conceptTag))), subject: req.subject },
            atomConstraint: { trainedOnly: true, allowedAtomIds: allowedIds, ghostAtomIds: ghostIds },
            uiPredictiveState: {
                recommendedDifficulty: plan.recommendedDifficulty,
                estimatedDurationMin: plan.estimatedDurationMin,
                incentivePromise: { xpPotential: plan.xpPotential || 100, streakAtRisk: false }
            },
            ladderConstraints: {
                startLevel: plan.startLevel,
                maxLevel: plan.maxLevel,
                forcedRemediation: plan.forcedRemediation || false
            },
            behaviorProfile: {
                defaultMood: plan.mood || 'neutral',
                modifiers: { timePenaltyDisabled: false, hintsUnlimited: false }
            }
        };
    } catch (err) {
        log("⚠️ Network slow. Activating Bunker Mode (Local Session)...");
        return generateLocalBunkerSession(corePool, ghostIds, req);
    }
};

/**
 * PHASE 2: CONTENT GENERATOR (QRO)
 */
export const generateAdaptiveQuestion = async (
    session: QuizSessionInit,
    user: UserProfile,
    currentLevel: number,
    previousResults: QuestionResult[],
    onStatus?: (msg: string) => void
): Promise<QuestionRuntime> => {
    const log = (msg: string) => onStatus?.(`[QRO_ENGINE] ${msg}`);

    const untestedIds = session.atomConstraint.allowedAtomIds.filter(id => !previousResults.some(r => (r as any).atomId === id));
    const nextAtomId = session.atomConstraint.ghostAtomIds[previousResults.length] || untestedIds[0] || session.atomConstraint.allowedAtomIds[0];

    const allAtoms = await getLocalAtoms(user.id);
    const atomVM = allAtoms.find(a => a.atomId === nextAtomId);
    if (!atomVM) throw new Error("Target Atom missing from Local Registry.");
    const atom = atomVM.core;

    try {
        log(`Synthesizing ${atom.metadata.conceptTag} @ Level ${currentLevel}...`);
        const { ai, apiKey } = getAiClient('quiz', onStatus);

        const response = await callAiWithRetry(ai, {
            contents: `Atom Context: ${JSON.stringify(atom)}. Level: ${currentLevel}.`,
            config: {
                systemInstruction: `You are the EDUVA Question Engine. RULES: 1. FEYNMAN RULE: Use Grade-5 vocabulary. 2. SURGICAL BOUNDARY: Use ONLY provided Atom data. Output JSON strictly matching QRO schema.`,
                responseMimeType: 'application/json',
                responseSchema: QRO_SCHEMA,
                temperature: 0.3,
                maxOutputTokens: 2000
            }
        }, 'quiz', [], apiKey);

        const qroData = JSON.parse(response.text || '{}');
        return {
            ...qroData,
            sessionId: session.identity.sessionId,
            questionId: `q_${Date.now()}`
        };
    } catch (err) {
        log("⚠️ Synthesis interrupted. Switching to Bunker Mode (Local Logic)...");
        return generateLocalBunkerQuestion(atom, allAtoms.map(a => a.core), currentLevel, session.identity.sessionId);
    }
};
