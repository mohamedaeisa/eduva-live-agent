import { ExamItem, ExamSession, ExamMode } from '../../types';

export type ItemEvaluationStatus = 'CORRECT' | 'WRONG' | 'SKIPPED' | 'FAILED';

export interface ExamItemResult {
    atomId: string;
    sectionId: string;

    status: ItemEvaluationStatus;

    // Failure reason only present if status is FAILED
    failureReason?: 'AI_ERROR' | 'INSUFFICIENT_ATOMS' | 'AI_BATCH_ERROR' | 'AI_MISSING_OUTPUT';

    // Analysis Data
    bloomLevel: number; // 1-5 (mapped from RECALL->1 etc)
    difficulty: number; // 1-3

    responseTimeMs: number;
}

/**
 * Immutable Snapshot of a completed Exam Session.
 * This is the source of truth for the "Exam Results" screen.
 */
export interface ExamResult {
    examSessionId: string;
    userId: string;
    blueprintId: string;
    mode: ExamMode; // <-- Added Requirement 6

    // Timings
    startedAt: number;
    finishedAt: number;
    durationSec: number;

    // Counters (The Truth)
    totalSlots: number;    // Total items allocated in skeleton
    attempted: number;     // User interacted with these

    evaluated: number;     // The denominator for scoring (total - failed)
    // evaluated = correct + wrong (skipped counts as wrong usually, but let's be technically precise: skipped is evaluated as 0 points)

    skipped: number;       // User explicitly skipped or timed out without answer
    failedSlots: number;   // EXCLUDED from scoring (AI/System Error)

    // SCORING PRIMITIVES (Locked V3)
    correct: number;
    wrong: number;

    // Derived Scores
    rawScore: number;        // correct / evaluated
    normalizedScore: number; // 0-100

    // History Tracking (Lightweight)
    itemMap: Record<string, {
        status: ItemEvaluationStatus;
        time: number;  // Response time in ms
        bloom: number; // Bloom level 1-5
    }>;
}

/**
 * The Mirror's Memory: A Delta Packet.
 * Represents "How did *this* exam change my growth profile?"
 */
export interface GrowthSnapshot {
    examId: string;
    userId: string;
    timestamp: number;
    mode: ExamMode; // <-- Added Requirement 6

    // Cognitive Distribution (Me vs Me)
    bloomDistribution: {
        recall: { correct: number; total: number };
        apply: { correct: number; total: number };
        analyze: { correct: number; total: number };
    };

    // Tag Analysis
    strengths: string[]; // ConceptTags with high success rate
    weaknesses: string[]; // ConceptTags with low success rate

    // Velocity (Trend Deltas)
    velocity: {
        accuracyDelta: number; // vs last 5 avg
        speedDelta: number;    // vs last 5 avg
    };

    // Trust & Confidence
    trustScore: number; // 0-1 (penalized by failedSlots)
}
