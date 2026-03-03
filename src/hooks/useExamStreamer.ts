import { useEffect, useRef, useState } from 'react';
import { ExamSession, ExamItem, UserProfile } from '../types';
import { materializeQuestionBatch } from '../services/ai/examService';
import { logger } from '../utils/logger';

/**
 * V2 LOCKED STREAMER
 * Principles:
 * 1. Capacity Governor: MAX_CONCURRENT = 1 (Serial Safety)
 * 2. Section Gating: Section N must finish before Section N+1 starts.
 * 3. Fail-Fast: 429 errors stop the item immediately (handled by service/client, streamer just moves on).
 */
export const useExamStreamer = (
    session: ExamSession | null,
    user: UserProfile | null,
    onMaterialize: (atomId: string, question: any) => void,
    onComplete?: () => void
) => {
    // Queue of items to process
    const [queue, setQueue] = useState<ExamItem[]>([]);

    // Track active async requests to enforce concurrency limit
    const activeRequests = useRef(0);

    // Track if we have started processing the current session
    const hasStarted = useRef(false);

    // Track if strict processing is loop active (used to trigger re-checks)
    const [tick, setTick] = useState(0);

    const MAX_CONCURRENT_REQUESTS = 1;
    const BATCH_SIZE = 5;

    // 1. INITIALIZE QUEUE
    useEffect(() => {
        if (!session) return;

        // Reset if session changes (simple check by ID usually, but here we assume session object ref changes)
        // If we want to be more robust, we should track sessionId. 
        // For now, assuming session prop change implies new session or recovery.
        // Actually, if we recover, we might re-process items that are already done?
        // The Bunker handles idempotency, so it's "safe" to re-process but wasteful.
        // Ideally we should filter out items already materialized.
        // But the streamer is "stateless" regarding bunker. 

        if (!hasStarted.current) {
            console.log(`[Streamer] Initializing Queue: ${session.items.length} items`);
            setQueue(session.items);
            hasStarted.current = true;
            activeRequests.current = 0;
        }
    }, [session]);

    // 2. PROCESSING LOOP
    useEffect(() => {
        if (!user || !session) return;

        const processNext = async () => {
            // TERMINAL CONDITION CHECK
            if (activeRequests.current === 0 && queue.length === 0 && hasStarted.current) {
                console.log("[Streamer] All items processed. Signaling completion.");
                if (onComplete) onComplete();
                return;
            }

            // GOVERNOR CHECK
            if (activeRequests.current >= MAX_CONCURRENT_REQUESTS) return;
            // GOVERNOR CHECK
            if (activeRequests.current >= MAX_CONCURRENT_REQUESTS) return; // Busy
            // if (queue.length === 0) return; // Removed in favor of robust check below

            // POP BATCH
            const batch = queue.slice(0, BATCH_SIZE);
            const remaining = queue.slice(BATCH_SIZE);

            // 🛡️ HARDENING: INVARIANT CHECK
            if (!batch || batch.length === 0) {
                console.log("[Streamer] Queue drained unexpectedly. Ensuring completion.");
                onComplete?.();
                return;
            }

            // UPDATE STATE (Optimistic)
            setQueue(remaining);
            activeRequests.current++;

            const startBatch = Date.now();
            try {
                console.log(`[Exam] [Streamer] Processing Batch of ${batch.length} items (Section: ${batch[0].sectionId})`);
                logger.exam(`[Streamer] Batch Started: ${batch.length} items`, { section: batch[0].sectionId });

                // V3: CALL BATCH MATERIALIZER
                const results = await materializeQuestionBatch(batch, session.blueprint, user);

                // BROADCAST RESULTS
                results.forEach(result => {
                    if (result.status === 'FAILED') {
                        logger.exam(`[Streamer] Item Failed: ${result.atomId} [${result.failureReason}]`);
                        onMaterialize(result.atomId, { isFailed: true, failureReason: result.failureReason });
                    } else {
                        onMaterialize(result.atomId, result.question);
                    }
                });

            } catch (e) {
                console.error(`[Streamer] Error processing batch`, e);
                logger.exam(`[Streamer] Batch Failed: ${batch[0].sectionId} (Items: ${batch.length})`, { error: e });
                // Fail safe - mark ALL in batch as failed
                batch.forEach(candidate => {
                    onMaterialize(candidate.atomId, { isFailed: true, failureReason: 'AI_BATCH_ERROR' });
                });
            } finally {
                logger.exam(`[Streamer] Batch Complete (Duration: ${Date.now() - startBatch}ms)`);
                activeRequests.current--;
                // Trigger next tick
                setTick(t => t + 1);
            }
        };

        processNext();

    }, [queue, user, session, onMaterialize, onComplete, tick]);
};
