import {
    QuizSessionV2, QuizQuestionV2, UserProfile, AtomViewModel, AtomCore, AtomProgress
} from '../../types';
import { getLocalAtoms } from '../storageService';
import { fetchAtomsForSession } from '../hydrationService';
import { callBatchQSE } from './qseEngine';
import { getDB } from '../idbService';
import { db } from '../firebaseConfig';
import { ingestEvent } from '../lis/telemetryIngestion';

const REFILL_THRESHOLD = 3;
// ✅ SINGLE-SHOT ARCHITECTURE: Removed BATCH_SIZE_LIMIT constraints
const BATCH_SIZE_LIMIT = 50; // Increased to cover full session in one go
const EXPIRY_TIME = 2 * 60 * 60 * 1000;

const refillInProgress: Record<string, boolean> = {};

const scrubData = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        if (obj.some(item => Array.isArray(item))) {
            return JSON.stringify(obj);
        }
        return obj.map(scrubData);
    }

    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val !== undefined) {
            cleaned[key] = scrubData(val);
        }
    });
    return cleaned;
};

export const getSessionV2 = async (sessionId: string): Promise<QuizSessionV2 | null> => {
    const idb = await getDB();
    return await idb.get('quiz_sessions', sessionId) || null;
};

export const saveSessionV2 = async (session: QuizSessionV2) => {
    const idb = await getDB();
    session.version += 1;
    session.updatedAt = Date.now();

    await idb.put('quiz_sessions', session);

    if (db) {
        const cloudPayload = scrubData(session);
        db.collection('quiz_sessions').doc(session.sessionId).set(cloudPayload, { merge: true })
            .catch(e => console.warn("[UCCS_SYNC] Cloud sync pending", e.message));
    }
};

export const selectAtomsForSession = (
    allAtoms: AtomCore[],
    session: QuizSessionV2,
    targetCount: number
): AtomCore[][] => {
    const atomProgress = session.atomProgress;

    const existingIds = new Set([
        ...session.pools[1].map(q => q.atomId),
        ...session.pools[2].map(q => q.atomId),
        ...session.pools[3].map(q => q.atomId),
        ...(session.pools[4] || []).map(q => q.atomId),
        ...session.history.map(q => q.atomId),
        ...session.synthesizingAtoms
    ]);

    const availableAtoms = allAtoms.filter(a => !existingIds.has(a.atomId));

    const inProgress = availableAtoms.filter(a => (atomProgress[a.atomId] as AtomProgress)?.status === 'IN_PROGRESS');
    const newAtoms = availableAtoms.filter(a => !atomProgress[a.atomId] || (atomProgress[a.atomId] as AtomProgress).status === 'NEW');

    let selected = [...inProgress, ...newAtoms].slice(0, targetCount);

    if (selected.length < targetCount) {
        const mastered = availableAtoms.filter(a => (atomProgress[a.atomId] as AtomProgress)?.status === 'MASTERED');
        selected.push(...mastered.slice(0, targetCount - selected.length));
    }

    const chunks: AtomCore[][] = [];
    // Just wrap in single chunk if under limit, else chunk (though we expect 1 chunk now)
    for (let i = 0; i < selected.length; i += BATCH_SIZE_LIMIT) {
        chunks.push(selected.slice(i, i + BATCH_SIZE_LIMIT));
    }
    return chunks;
};

export const initializeDurableSession = async (
    userId: string,
    sourceDocId: string,
    subject: string,
    user: UserProfile,
    config: { levelQuestionCount: number, allowedTypes: string[] },
    forceNew: boolean = false
): Promise<QuizSessionV2> => {
    const idb = await getDB();
    const existing = await idb.getAllFromIndex('quiz_sessions', 'by_doc', sourceDocId);
    const active = existing.find(s => s.status === 'ACTIVE' && s.expiresAt > Date.now());

    if (active && !forceNew) {
        return active;
    }

    // Hydrate if standard document, skip if Repair/Virtual ID
    if (!sourceDocId.startsWith('REPAIR')) {
        await fetchAtomsForSession(userId, sourceDocId);
    }

    const session: QuizSessionV2 = {
        sessionId: `sess_${Date.now()}`,
        studentId: userId,
        sourceDocId,
        subject,
        pools: { 1: [], 2: [], 3: [], 4: [] },
        history: [],
        currentLevel: sourceDocId.startsWith('CHALLENGE') ? 4 : 1,
        currentAtomIndex: 0,
        atomProgress: user.gamification.masteryMap ? Object.entries(user.gamification.masteryMap).reduce((acc, [id, score]) => {
            acc[id] = {
                atomId: id,
                status: (score as number) >= 0.9 ? 'MASTERED' : 'IN_PROGRESS',
                highestLevelCleared: (score as number) >= 0.9 ? 3 : 0,
                lastReview: Date.now()
            };
            return acc;
        }, {} as Record<string, AtomProgress>) : {},
        synthesizingAtoms: [],
        totalAtoms: config.levelQuestionCount * 3,
        masteredAtoms: user.gamification.masteryMap ? Object.values(user.gamification.masteryMap).filter(s => (s as number) >= 0.9).length : 0,
        metrics: { streak: 0, consecutiveWrong: 0 },
        status: 'IDLE',
        version: 0,
        updatedAt: Date.now(),
        expiresAt: Date.now() + EXPIRY_TIME,
        isHydrated: true,
        config: {
            levelQuestionCount: config.levelQuestionCount,
            allowedTypes: config.allowedTypes
        },
        ladderConstraints: {
            startLevel: 1,
            maxLevel: sourceDocId.startsWith('CHALLENGE') ? 4 : 3,
            forcedRemediation: false
        }
    };

    await idb.put('quiz_sessions', session);
    return session;
};

export const refillPoolsIfNecessary = async (
    session: QuizSessionV2,
    user: UserProfile,
    onSessionUpdated?: (s: QuizSessionV2) => void
) => {
    // 🛑 ORCHESTRATION GUARD: Rolling refills are disabled in V3.3 Single-Shot Architecture
    return;
};

/**
 * ⚡ SINGLE-SHOT GENERATOR (V3.3)
 * Generates the ENTIRE quiz session in one massive AI request at initialization.
 * No refills, no latency, no quota exhaustion mid-quiz.
 */
export const generateStaticSession = async (
    session: QuizSessionV2,
    user: UserProfile,
    onSessionUpdated: (s: QuizSessionV2) => void,
    candidateAtoms: AtomCore[],
    isChallengeMode: boolean = false,
    origin?: 'PRACTICE' | 'REPAIR' | 'EXPAND' | 'CHALLENGE',
    scope?: 'FILE' | 'SUBJECT',
    source: 'ADAPTIVE' | 'COMPASS' = 'ADAPTIVE'
) => {
    const lockKey = `${session.sessionId}_init`;
    if (refillInProgress[lockKey]) return;
    refillInProgress[lockKey] = true;
    console.time(`[QUIZ_INIT] Static Generation ${session.sessionId}`);

    try {
        // 1. Calculate TOTAL demand for the session (STRICT CAP AT 12)
        const totalQuestionsNeeded = Math.min(session.totalAtoms || 9, 12);
        const questionsPerAtom = isChallengeMode ? 4 : 3;

        // ✅ STRICT MODE: If ADAPTIVE, minimize buffer to strictly adhere to count.
        const bufferMultiplier = source === 'ADAPTIVE' ? 1.1 : 1.5;
        const safeAtomCount = Math.ceil((totalQuestionsNeeded / questionsPerAtom) * bufferMultiplier);

        let atomsPool: AtomCore[] = [];

        // 2. Select Candidate Atoms (Preserving Priority Logic)
        if (candidateAtoms && candidateAtoms.length > 0) {
            atomsPool = candidateAtoms;
        } else if (!session.isHydrated && session.sourceDocId && !session.sourceDocId.startsWith('REPAIR')) {
            const hydration = await fetchAtomsForSession(user.id, session.sourceDocId);
            atomsPool = hydration.atoms;
        } else if (session.sourceDocId && !session.sourceDocId.startsWith('REPAIR')) {
            const viewModels = await getLocalAtoms(user.id, session.sourceDocId);
            atomsPool = viewModels.map(vm => vm.core);
        }

        // 3. Selection Algorithm (New/InProgress Priority)
        const chunks = selectAtomsForSession(atomsPool, session, safeAtomCount);
        const targetAtoms = chunks.flat().slice(0, safeAtomCount); // Flatten just in case

        console.log(`[QUIZ_INIT] Demand: ${totalQuestionsNeeded} Qs | Selecting ${targetAtoms.length} Atoms for Single-Shot.`);

        if (targetAtoms.length === 0) {
            console.error("[QUIZ_FAULT] No atoms available for generation.");
            return;
        }

        // 4. Mark atoms as synthesizing
        session.synthesizingAtoms = targetAtoms.map(a => a.atomId);
        await saveSessionV2(session);
        onSessionUpdated(session);

        // 5. ONE AI CALL (Bulk)
        const sessionFocus =
            origin === 'REPAIR' ? 'diagnose' :
                origin === 'CHALLENGE' ? 'challenge' :
                    origin === 'PRACTICE' ? 'reinforce' : 'balanced';

        const units = await callBatchQSE(
            targetAtoms,
            1, // Trigger level ignored
            user,
            session.config.allowedTypes,
            isChallengeMode,
            origin,
            scope,
            sessionFocus,
            source
        );

        // 6. Ingest Results
        const current = await getSessionV2(session.sessionId);
        if (!current) return;

        let acceptedCount = 0;
        units.forEach(u => {
            const lvl = u.difficulty as 1 | 2 | 3 | 4;
            if (!current.pools[lvl]) current.pools[lvl] = [];
            current.pools[lvl]!.push(u);
            acceptedCount++;
        });

        console.log(`[QUIZ_INIT] Generated ${units.length} Qs | Accepted ${acceptedCount} | Pools: L1=${current.pools[1].length}, L2=${current.pools[2].length}, L3=${current.pools[3].length}, L4=${current.pools[4]?.length || 0}`);

        // 7. Unlock & Save
        current.pools = { ...current.pools }; // Force re-render
        current.totalAtoms = acceptedCount;   // ✅ Set dynamic total length
        current.synthesizingAtoms = [];
        current.isHydrated = true;

        await saveSessionV2(current);
        onSessionUpdated(current);
        console.timeEnd(`[QUIZ_INIT] Static Generation ${session.sessionId}`);

    } catch (e) {
        console.error("[QUIZ_FATAL] Single-Shot Generation Failed", e);
        const failedSess = await getSessionV2(session.sessionId);
        if (failedSess) {
            failedSess.synthesizingAtoms = [];
            await saveSessionV2(failedSess);
            onSessionUpdated(failedSess);
        }
    } finally {
        delete refillInProgress[lockKey];
    }
};

export const updateAtomProgress = (atomId: string, level: number, correct: boolean, session: QuizSessionV2) => {
    const progress = session.atomProgress[atomId] || { atomId, status: 'NEW', highestLevelCleared: 0, lastReview: 0 };

    if (correct) {
        progress.highestLevelCleared = Math.max(progress.highestLevelCleared, level) as 1 | 2 | 3;
        progress.status = progress.highestLevelCleared >= 3 ? 'MASTERED' : 'IN_PROGRESS';
    } else {
        progress.status = 'IN_PROGRESS';
    }
    progress.lastReview = Date.now();
    session.atomProgress[atomId] = progress;
    session.masteredAtoms = Object.values(session.atomProgress).filter(a => (a as AtomProgress).status === 'MASTERED').length;
};

export const getNextQuestionSync = (session: QuizSessionV2): QuizQuestionV2 | null => {
    const pool = session.pools[session.currentLevel];
    if (pool && pool.length > 0) return pool[0];
    for (const lvl of [4, 3, 2, 1] as const) {
        if (session.pools[lvl] && session.pools[lvl]!.length > 0) return session.pools[lvl]![0];
    }
    return null;
}

// RE-IMPLEMENTATION TO ACCEPT STATS
export const connectTelemetry = async (
    session: QuizSessionV2,
    score: number,
    total: number,
    studentId: string,
    granularResults: any[],
    durationSec: number = 0 // ✅ NEW: Time Context
) => {
    console.log(`[QUIZ_TELEMETRY] Concluding Sess: ${session.sessionId} | Score: ${score}/${total}`);

    // Determine Mode
    let mode: 'practice' | 'fix' | 'challenge' = 'practice';
    if (session.sourceDocId?.startsWith('REPAIR')) mode = 'fix';
    if (session.sourceDocId?.startsWith('CHALLENGE')) mode = 'challenge';

    await ingestEvent({
        id: crypto.randomUUID(),
        idempotencyKey: `quiz_completed_${session.sessionId}`,
        studentId: studentId,
        eventType: 'quiz.completed',
        schemaVersion: '2.1.1',
        timestamp: new Date().toISOString(),
        timeContext: {
            durationSec: durationSec,
            mode: mode,
            attemptType: 'first'
        },
        payload: {
            sessionId: session.sessionId,
            subject: session.subject,
            mode: mode,
            finalScore: score,
            totalQuestions: total,
            granularResults: granularResults // Passthrough for aggregation
        }
    });

    session.status = 'TERMINAL';
    await saveSessionV2(session);
};
