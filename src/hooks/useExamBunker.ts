
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDB } from '../services/idbService';
import { ExamSession } from '../types';

interface BunkerState {
    examSessionId: string;
    currentQuestionIndex: number;
    answers: Record<string, any>; // atomId -> answer
    serverOffset: number;
    startedAt: number;
    lastActiveAt: number;
    timestamps: Record<string, number>; // atomId -> timeSpentMs
    materializedQuestions: Record<string, any>; // atomId -> { text, options, etc }
    finished: boolean;
    generationComplete: boolean;
}

const MAX_DRIFT_MS = 15000; // 15 seconds allowence for drift
const SYNC_DEBOUNCE = 500; // Throttle state updates to React

export const useExamBunker = (sessionId?: string, durationMinutes?: number) => {
    const [bunkerState, setBunkerState] = useState<BunkerState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [clockDriftFlag, setClockDriftFlag] = useState(false);

    // In-memory ref to prevent React stale closures during async DB ops
    const stateRef = useRef<BunkerState | null>(null);
    // Lock to prevent recovery from overwriting a fresh initialization
    const initializationLock = useRef<string | null>(null);

    // 1. RECOVERY ON MOUNT
    useEffect(() => {
        if (!sessionId) {
            setIsLoading(false);
            return;
        }

        const recover = async () => {
            try {
                // Pre-check: If we just initialized this session, don't bother recovering
                if (initializationLock.current === sessionId) return;

                const idb = await getDB();
                const stored = await idb.get('exam_runtime', sessionId);

                // Race Condition Check: Did initialization happen while we were reading DB?
                if (initializationLock.current === sessionId) {
                    console.log(`[Bunker] Recovery aborted for ${sessionId} - Fresh initialization took precedence.`);
                    return;
                }

                if (stored) {
                    console.log(`[Bunker] Recovered session ${sessionId}`);
                    // Migration: Ensure new fields exist
                    const migrated = { ...stored, generationComplete: (stored as any).generationComplete ?? false };
                    stateRef.current = migrated;
                    setBunkerState(migrated);

                    // Anti-Zombie Check
                    const now = Date.now();
                    const elapsed = now - stored.startedAt; // Simplistic check (drift handled in timer)
                    const maxDuration = (durationMinutes || 60) * 60 * 1000 + (5 * 60 * 1000); // +5m buffer

                    if (elapsed > maxDuration && !stored.finished) {
                        console.warn("[Bunker] Session expired while offline (Zombie). Auto-submitting.");
                        // TODO: trigger auto-submit logic
                    }
                } else {
                    console.log(`[Bunker] No local state for ${sessionId}`);
                }
            } catch (e) {
                console.error("[Bunker] Recovery failed", e);
            } finally {
                setIsLoading(false);
            }
        };

        recover();
    }, [sessionId, durationMinutes]);

    // 2. INITIALIZATION (CALLED BY EXAM RUNNER ON START)
    const initializeBunker = useCallback(async (session: ExamSession) => {
        // Set lock immediately
        initializationLock.current = session.id;

        const idb = await getDB();
        const serverNow = session.startedAt; // Trusting server timestamp from session create
        const clientNow = Date.now();
        const offset = serverNow - clientNow;

        const initialState: BunkerState = {
            examSessionId: session.id,
            currentQuestionIndex: 0,
            answers: {},
            serverOffset: offset,
            startedAt: session.startedAt,
            lastActiveAt: Date.now(),
            timestamps: {},
            materializedQuestions: {}, // Will be filled by Stream & Freeze
            finished: false,
            generationComplete: false
        };

        await idb.put('exam_runtime', initialState);
        stateRef.current = initialState;
        setBunkerState(initialState);
        console.log(`[Bunker] Initialized with Server Offset: ${offset}ms`);
    }, []);

    // 3. EVENT-DRIVEN UPDATES (WRITE-THROUGH CACHE)
    const updateBunker = useCallback(async (partial: Partial<BunkerState>) => {
        if (!stateRef.current) return;

        const newState = { ...stateRef.current, ...partial, lastActiveAt: Date.now() };
        stateRef.current = newState;

        // optimistic update for UI responsiveness
        setBunkerState(newState);

        // Async write to DB (Fire & Forget, but reliable)
        getDB().then(idb => idb.put('exam_runtime', newState));
    }, []);

    // 4. ATOMIC METHODS
    const recordAnswer = useCallback((atomId: string, answer: any) => {
        if (!stateRef.current) return;
        const answers = { ...stateRef.current.answers, [atomId]: answer };
        updateBunker({ answers });
    }, [updateBunker]);

    const recordTimeSpent = useCallback((atomId: string, ms: number) => {
        if (!stateRef.current) return;
        const current = stateRef.current.timestamps[atomId] || 0;
        const timestamps = { ...stateRef.current.timestamps, [atomId]: current + ms };
        updateBunker({ timestamps });
    }, [updateBunker]);

    const updateQuestionMaterialization = useCallback((atomId: string, questionData: any) => {
        if (!stateRef.current) return;
        // Only update if not present or different (Idempotency)
        if (stateRef.current.materializedQuestions[atomId]) return;

        const mat = { ...stateRef.current.materializedQuestions, [atomId]: questionData };
        updateBunker({ materializedQuestions: mat });
    }, [updateBunker]);

    const setIndex = useCallback((idx: number) => {
        updateBunker({ currentQuestionIndex: idx });
    }, [updateBunker]);

    const finishSession = useCallback(() => {
        updateBunker({ finished: true });
    }, [updateBunker]);

    const markGenerationComplete = useCallback(() => {
        updateBunker({ generationComplete: true });
    }, [updateBunker]);

    // 5. ANTI-TAMPER CLOCK UTILITY
    const getTimeRemaining = useCallback(() => {
        if (!stateRef.current || !durationMinutes) return 0;

        const clientNow = Date.now();
        // Server Time = Client Time + Offset
        const serverTime = clientNow + stateRef.current.serverOffset;
        const elapsed = serverTime - stateRef.current.startedAt;

        return Math.max(0, (durationMinutes * 60 * 1000) - elapsed);
    }, [durationMinutes]);

    return {
        bunkerState,
        isLoading,
        initializeBunker,
        recordAnswer,
        recordTimeSpent,
        updateQuestionMaterialization,
        setIndex,
        finishSession,
        getTimeRemaining,
        markGenerationComplete
    };
};
