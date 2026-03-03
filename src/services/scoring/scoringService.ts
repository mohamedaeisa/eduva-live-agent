import { ExamSession, ExamItem, ExamItemStatus } from '../../types';
import { ExamResult, GrowthSnapshot, ItemEvaluationStatus } from './types';
import { logger } from '../../utils/logger';

// ------------------------------------------------------------------
// PURE LOGIC PRIMITIVES
// ------------------------------------------------------------------

/**
 * Computes the immutable result of an exam session.
 * STRICT DOCTRINE: FAILED/Technical Error slots are EXCLUDED from the denominator.
 */
export const computeExamResult = (session: ExamSession): ExamResult => {
    const finishedAt = Date.now();
    const durationSec = Math.floor((finishedAt - session.startedAt) / 1000);

    let totalSlots = 0;
    let attempted = 0;
    let skipped = 0;
    let failedSlots = 0;
    let correct = 0;
    let wrong = 0;
    const itemMap: Record<string, { status: ItemEvaluationStatus; time: number; bloom: number }> = {};

    session.items.forEach(item => {
        totalSlots++;

        // 1. Map to Evaluation Status
        // We trust item.status from runner, but we re-verify logic here for safety
        let status: ItemEvaluationStatus = 'SKIPPED';

        // Technical Failure Checks
        if (item.status === 'FAILED' || item.failureReason) {
            status = 'FAILED';
            failedSlots++;
            return; // Stop processing this item
        }

        if (item.userAnswer !== undefined && item.userAnswer !== null) {
            attempted++;
            // Check correctness
            // This logic assumes MCQ for now. Text processing would happen before this or return a score.
            // For V3, we trust the Runner's localized grading or re-grade here if determinism allows.
            // Assuming item.question has correctAnswerIndex and userAnswer is index.
            if (typeof item.userAnswer === 'number' && item.question?.correctAnswerIndex === item.userAnswer) {
                status = 'CORRECT';
                correct++;
            } else {
                status = 'WRONG';
                wrong++;
            }
        } else {
            status = 'SKIPPED';
            skipped++;
            // Skipped is a form of WRONG in scoring, but distinct in UX
        }
        // Bloom Mapping
        const section = session.blueprint.sections.find(s => s.id === item.sectionId);
        const bloomMap: Record<string, number> = { 'RECALL': 1, 'APPLICATION': 3, 'ANALYSIS': 4, 'EVALUATION': 5 };
        const bloomStr = (section?.atomProfile.bloomLevel as string) || 'RECALL';
        const bloomNum = bloomMap[bloomStr] || 1;

        itemMap[item.atomId] = {
            status,
            time: item.flags?.timeSpentMs || 0,
            bloom: bloomNum
        };
    });

    // 2. Compute Evaluated & Score
    // Evaluated = All non-failed items (Correct + Wrong + Skipped)
    const evaluated = totalSlots - failedSlots;

    // HARD GUARD: Invariant Check
    if (correct + wrong + skipped !== evaluated) {
        logger.error('EXAM', `[Scoring] Invariant Violation: C:${correct} W:${wrong} S:${skipped} != E:${evaluated}`);
        // Fallback: trust evaluated count derived from total-failed
    }

    const rawScore = evaluated > 0 ? (correct / evaluated) : 0;

    // Normalized Score (0-100)
    const normalizedScore = Math.round(rawScore * 100);

    return {
        examSessionId: session.id,
        userId: session.studentId,
        blueprintId: session.blueprint.id,
        mode: session.blueprint.mode || 'STANDARD',
        startedAt: session.startedAt,
        finishedAt,
        durationSec,

        totalSlots,
        attempted, // Interaction count (excludes explicit skips if we tracked them, currently Answered = Attempted)
        evaluated,
        skipped,
        failedSlots,

        correct,
        wrong,

        rawScore,
        normalizedScore,
        itemMap
    };
};

/**
 * Generates the Growth Mirror Snapshot (Delta).
 * Contains only the data valid for this specific exam instance.
 */
export const generateGrowthSnapshot = (
    result: ExamResult,
    session: ExamSession
): GrowthSnapshot => {

    // 1. Cognitive Breakdown
    const bloomStats: Record<string, { correct: number; total: number }> = {
        recall: { correct: 0, total: 0 },
        apply: { correct: 0, total: 0 },
        analyze: { correct: 0, total: 0 }
    };

    const strengthTags = new Map<string, number>();
    const weaknessTags = new Map<string, number>();

    session.items.forEach(item => {
        // Skip failed items
        if (item.status === 'FAILED' || item.failureReason) return;

        // Metadata extraction
        // Map numerical bloom or string to bucket
        // Assuming blueprint section profile has bloomLevel
        // Ideally we'd map this from the section definition
        const section = session.blueprint.sections.find(s => s.id === item.sectionId);
        const bloomStr = (section?.atomProfile.bloomLevel as string) || 'RECALL';

        let bucket = 'recall';
        if (bloomStr === 'APPLICATION') bucket = 'apply';
        if (bloomStr === 'ANALYSIS' || bloomStr === 'EVALUATION') bucket = 'analyze';

        // Update Stats
        bloomStats[bucket].total++;
        const isCorrect = item.userAnswer === item.question?.correctAnswerIndex;
        if (isCorrect) bloomStats[bucket].correct++;

        // Tag Cloud (Simple Frequency)
        const tag = item.atomSnapshot?.metadata?.conceptTag;
        if (tag) {
            if (isCorrect) strengthTags.set(tag, (strengthTags.get(tag) || 0) + 1);
            else weaknessTags.set(tag, (weaknessTags.get(tag) || 0) + 1);
        }
    });

    // 2. Velocity (Placeholder for now - requires history)
    // In V3.1 we fetch last 5 exams here.
    const velocity = {
        accuracyDelta: 0,
        speedDelta: 0
    };

    // 3. Trust Score calculation
    // Clamp(1 - (failed / total), 0, 1)
    const trustScore = result.totalSlots > 0
        ? Math.max(0, Math.min(1, 1 - (result.failedSlots / result.totalSlots)))
        : 1;

    return {
        examId: session.id,
        userId: session.studentId,
        timestamp: result.finishedAt,
        mode: result.mode,
        bloomDistribution: {
            recall: bloomStats.recall,
            apply: bloomStats.apply,
            analyze: bloomStats.analyze
        },
        strengths: Array.from(strengthTags.keys()).slice(0, 5), // Top 5
        weaknesses: Array.from(weaknessTags.keys()).slice(0, 5), // Top 5
        velocity,
        trustScore
    };
};

/**
 * Identifies atoms that require immediate surgical correction.
 * Returns top 3 items based on bloom level and error severity.
 */
export const identifyMicroLoopCandidates = (result: ExamResult): string[] => {
    const candidates: { atomId: string; priority: number }[] = [];

    for (const [atomId, stats] of Object.entries(result.itemMap)) {
        // 1. Must be WRONG (or skipped, but focus on explicit errors first)
        if (stats.status !== 'WRONG') continue;

        let priority = 0;

        // 2. Bloom Level (Higher bloom = deeper misconception = higher priority)
        priority += stats.bloom * 10;

        // 3. Time Spent (If they spent a lot of time and still got it wrong -> Stuck)
        // Assume avg time per question is ~45s (45000ms).
        if (stats.time > 45000) {
            priority += 20;
        }

        candidates.push({ atomId, priority });
    }

    // Sort by priority desc
    candidates.sort((a, b) => b.priority - a.priority);

    // Return top 3
    return candidates.slice(0, 3).map(c => c.atomId);
};
