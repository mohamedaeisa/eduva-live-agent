/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Learning Intelligence System — Canonical Formulas
 * 
 * ⚠️ CRITICAL: This file contains ALL learning metric calculations.
 * ⚠️ Any modification requires: version bump, event replay, before/after diff
 * ⚠️ NO other module is allowed to implement mastery calculations.
 * 
 * Violation of these rules = BUG, not feature.
 */

import {
    MASTERY_WEIGHTS,
    HEALTH_WEIGHTS,
    KNOWLEDGE_ALPHA,
    TREND_ALPHA,
    COLD_START_PRIOR,
    COLD_START_THRESHOLD,
    COLD_START_WEIGHT_REDUCTION,
    FLUENCY_FLOOR,
    FLUENCY_CEILING,
    BLOOM_WEIGHTS,
    DEFAULT_BLOOM_WEIGHT,
    MASTERY_FLOOR,
    MASTERY_THRESHOLDS,
    HEALTH_STATUS_THRESHOLDS,
    TREND_IMPROVING_THRESHOLD,
    TREND_AT_RISK_THRESHOLD,
    RETRY_WEIGHT_REDUCTION,
    EXAM_MODE_WEIGHT_BOOST,
    MASTERED_STABILITY_THRESHOLD,
    MASTERED_MASTERY_THRESHOLD,
} from './constants';

import type {
    MasteryLevel,
    HealthStatus,
    TrendClassification,
} from './types';

// ==================== 1. KNOWLEDGE SCORE (PRIMARY SIGNAL) ====================

/**
 * Updates Knowledge signal using EWMA with cold-start handling.
 * 
 * Knowledge is the PRIMARY signal — correctness over time.
 * 
 * @param currentKnowledge - Existing knowledge value (0-1)
 * @param isCorrect - Whether current attempt was correct
 * @param attempts - Total attempts so far (for cold-start detection)
 * @param attemptType - 'first' or 'retry'
 * @param mode - 'practice' | 'fix' | 'challenge' | 'exam'
 * @param isChallenge - Challenge mode flag
 * @returns Updated knowledge value (0-1)
 * 
 * Guarantees:
 * - Challenge failures are non-destructive
 * - First attempts weighted higher than retries
 * - Exam mode weighted higher (more reliable)
 * - Cold-start period reduces early influence
 */
export function updateKnowledgeWithColdStart(
    currentKnowledge: number,
    isCorrect: boolean,
    attempts: number,
    attemptType: 'first' | 'retry',
    mode: string,
    isChallenge: boolean
): number {
    // First-time initialization
    if (attempts === 0) {
        return COLD_START_PRIOR;
    }

    // Challenge failures are non-destructive
    if (isChallenge && !isCorrect) {
        return currentKnowledge;  // No change
    }

    const observation = isCorrect ? 1.0 : 0.0;
    let weight = KNOWLEDGE_ALPHA;

    // Guard 2: EWMA Cold-Start Handling
    // Reduce influence during cold-start period
    if (attempts < COLD_START_THRESHOLD) {
        weight *= COLD_START_WEIGHT_REDUCTION;
    }

    // First attempts are more indicative than retries
    if (attemptType === 'retry') {
        weight *= RETRY_WEIGHT_REDUCTION;
    }

    // Exam mode is more reliable (higher stakes, less guessing)
    if (mode === 'exam') {
        weight *= EXAM_MODE_WEIGHT_BOOST;
    }

    // EWMA formula: new = α×observation + (1-α)×old
    const newKnowledge = (weight * observation) + ((1 - weight) * currentKnowledge);

    return Math.max(0, Math.min(1, newKnowledge));
}

// ==================== 2. FLUENCY SCORE (SPEED SIGNAL) ====================

/**
 * Calculates Fluency signal from time performance.
 * 
 * CRITICAL: Compared to student's OWN baseline, not global average.
 * CRITICAL: Bounded [0.6, 1.2] — can't collapse or inflate mastery.
 * 
 * @param avgActiveTimeSec - Average active time per attempt
 * @param medianFirstAttemptTimeSec - Student's personal baseline
 * @returns Fluency factor (0.6-1.2)
 * 
 * Why bounded:
 * - Floor 0.6: Slow learners aren't destroyed
 * - Ceiling 1.2: Fast guessing caps at 20% bonus
 */
export function calculateFluency(
    avgActiveTimeSec: number,
    medianFirstAttemptTimeSec: number
): number {
    // Neutral if no data
    if (avgActiveTimeSec <= 0 || medianFirstAttemptTimeSec <= 0) {
        return 1.0;
    }

    // Ratio: expected / actual
    // Fast = ratio > 1 (bonus), Slow = ratio < 1 (penalty)
    const ratio = medianFirstAttemptTimeSec / avgActiveTimeSec;

    // HARD BOUNDS: Speed refines, never destroys
    return Math.max(FLUENCY_FLOOR, Math.min(FLUENCY_CEILING, ratio));
}

// ==================== 3. COGNITIVE DEPTH SCORE (BLOOM SIGNAL) ====================

/**
 * Calculates Depth signal from Bloom level history.
 * 
 * Depth rewards attempting higher-order thinking.
 * Even failing a Level 4 question shows cognitive ambition.
 * 
 * @param bloomLevelHistory - Array of Bloom levels attempted
 * @returns Depth score (0-1)
 */
export function calculateDepth(bloomLevelHistory: number[]): number {
    if (bloomLevelHistory.length === 0) return 0.5;  // Neutral

    // Weighted average of all Bloom levels attempted
    const weightedSum = bloomLevelHistory.reduce(
        (sum, level) => sum + (BLOOM_WEIGHTS[level] ?? DEFAULT_BLOOM_WEIGHT),
        0
    );

    return weightedSum / bloomLevelHistory.length;
}

// ==================== 4. ATOM MASTERY (FINAL FORMULA) ====================

/**
 * 🔒 LOCKED FORMULA — DO NOT MODIFY WITHOUT VERSION BUMP
 * 
 * Calculates Atom Mastery from the three independent signals.
 * 
 * AtomMastery = 0.60 × Knowledge + 0.25 × Depth + 0.15 × Fluency
 * 
 * @param knowledge - Knowledge signal (0-1)
 * @param depth - Depth signal (0-1)
 * @param fluency - Fluency signal (0.6-1.2)
 * @returns Mastery score (0-100)
 * 
 * Guarantees:
 * - Knowledge ALWAYS dominates (60%)
 * - Speed refines, NEVER destroys (15%, bounded)
 * - Depth rewards challenge attempts (25%)
 * - Floor at 30% — mastery never collapses completely
 * 
 * Why weighted sum, not multiplication:
 * - Multiplicative collapses for slow learners
 * - Additive ensures knowledge dominates
 */
export function calculateAtomMastery(
    knowledge: number,
    depth: number,
    fluency: number
): number {
    // Weighted sum (NOT multiplication!)
    const rawMastery =
        (MASTERY_WEIGHTS.KNOWLEDGE * knowledge) +
        (MASTERY_WEIGHTS.DEPTH * depth) +
        (MASTERY_WEIGHTS.FLUENCY * fluency);

    // Hard floor: Even struggling students never see 0%
    const floored = Math.max(MASTERY_FLOOR, rawMastery);

    // Normalize to 0-100 for display
    return Math.round(floored * 100);
}

// ==================== 5. ATOM STABILITY (CONFIDENCE SIGNAL) ====================

/**
 * Calculates Stability (confidence) from attempt count.
 * 
 * Low stability = don't trust the mastery score yet.
 * 
 * @param attempts - Total attempts on this atom
 * @returns Stability score (0-1)
 * 
 * Behavior:
 * - 1 attempt → 0.00 (no confidence)
 * - 3 attempts → 0.48
 * - 5 attempts → 0.70
 * - 10 attempts → 1.00 (full confidence)
 */
export function calculateStability(attempts: number): number {
    if (attempts <= 0) return 0;

    // Logarithmic growth: diminishing returns after ~10 attempts
    const raw = Math.log(attempts + 1) / Math.log(10);

    return Math.max(0, Math.min(1, raw));
}

// ==================== 6. MASTERY LEVEL CLASSIFICATION ====================

/**
 * Classifies mastery score into discrete levels.
 * 
 * @param score - Mastery score (0-100)
 * @param attempts - Number of attempts
 * @returns Mastery level enum
 */
export function classifyMasteryLevel(score: number, attempts: number): MasteryLevel {
    if (attempts === 0) return 'UNKNOWN';
    if (score >= MASTERY_THRESHOLDS.STRONG) return 'STRONG';
    if (score >= MASTERY_THRESHOLDS.PARTIAL) return 'PARTIAL';
    return 'WEAK';
}

// ==================== 7. SUBJECT MASTERY AGGREGATION ====================

/**
 * Calculates Subject Mastery as weighted average of atom masteries.
 * 
 * Weights come from curriculum importance (exam frequency, prerequisites).
 * 
 * @param atoms - Array of {mastery, curriculumWeight}
 * @returns Subject mastery score (0-100)
 */
export function calculateSubjectMastery(
    atoms: Array<{ mastery: number; curriculumWeight: number }>
): number {
    if (atoms.length === 0) return 0;

    const totalWeight = atoms.reduce((sum, a) => sum + a.curriculumWeight, 0);
    if (totalWeight === 0) return 0;

    const weightedSum = atoms.reduce(
        (sum, a) => sum + (a.mastery * a.curriculumWeight),
        0
    );

    return Math.round(weightedSum / totalWeight);
}

// ==================== 8. SUBJECT COVERAGE ====================

/**
 * Calculates Coverage as % of atoms that are MASTERED.
 * 
 * "Mastered" requires BOTH:
 * - AtomMastery >= 75%
 * - AtomStability >= 0.6 (at least ~4 attempts)
 * 
 * @param atoms - Array of {mastery, stability}
 * @returns Coverage percentage (0-100)
 */
export function calculateCoverage(
    atoms: Array<{ mastery: number; stability: number }>
): number {
    if (atoms.length === 0) return 0;

    const masteredCount = atoms.filter(
        a => a.mastery >= MASTERED_MASTERY_THRESHOLD &&
            a.stability >= MASTERED_STABILITY_THRESHOLD
    ).length;

    return Math.round((masteredCount / atoms.length) * 100);
}

// ==================== 9. SUBJECT STABILITY ====================

/**
 * Calculates Subject Stability as average of atom stabilities.
 * 
 * @param atoms - Array of {stability}
 * @returns Average stability (0-1)
 */
export function calculateSubjectStability(
    atoms: Array<{ stability: number }>
): number {
    if (atoms.length === 0) return 0;

    const avg = atoms.reduce((sum, a) => sum + a.stability, 0) / atoms.length;
    return Math.round(avg * 100) / 100;  // 2 decimal places
}

// ==================== 10. SUBJECT HEALTH (FINAL FORMULA) ====================

/**
 * 🔒 LOCKED FORMULA — DO NOT MODIFY WITHOUT VERSION BUMP
 * 
 * Calculates Subject Health from mastery, coverage, and stability.
 * 
 * SubjectHealth = 0.65 × Mastery + 0.20 × Coverage + 0.15 × Stability
 * 
 * @param subjectMastery - Subject mastery score (0-100)
 * @param coverage - Coverage percentage (0-100)
 * @param stability - Subject stability (0-1)
 * @returns Health score (0-100)
 * 
 * ⚠️ EXPLICIT EXCLUSIONS:
 * - NO parent boosts (affects communication, not health)
 * - NO practice time (correlated with consistency, would double-count)
 * - NO UI overrides (health is truth, not motivation)
 * 
 * Health is PURE student-derived metric.
 */
export function calculateSubjectHealth(
    subjectMastery: number,
    coverage: number,
    stability: number
): number {
    const health =
        (HEALTH_WEIGHTS.MASTERY * subjectMastery) +
        (HEALTH_WEIGHTS.COVERAGE * coverage) +
        (HEALTH_WEIGHTS.STABILITY * (stability * 100));  // Normalize to 0-100

    return Math.round(Math.max(0, Math.min(100, health)));
}

// ==================== 11. HEALTH STATUS CLASSIFICATION ====================

/**
 * Classifies health score into discrete status.
 * 
 * @param health - Health score (0-100)
 * @returns Health status enum
 */
export function classifyHealthStatus(health: number): HealthStatus {
    if (health >= HEALTH_STATUS_THRESHOLDS.GOOD) return 'GOOD';
    if (health >= HEALTH_STATUS_THRESHOLDS.NEEDS_ATTENTION) return 'NEEDS_ATTENTION';
    return 'CRITICAL';
}

// ==================== 12. TREND DETECTION (EWMA-BASED) ====================

/**
 * Updates trend slope using EWMA and classifies direction.
 * 
 * @param currentTrendSlope - Previous EWMA slope
 * @param currentHealth - Current health score
 * @param previousHealth - Previous health score
 * @returns Object with {slope, classification}
 * 
 * Classification thresholds:
 * - Improving: slope > +0.02
 * - Stable: -0.02 ≤ slope ≤ +0.02
 * - At Risk: slope < -0.02
 * 
 * Why EWMA instead of simple delta:
 * - Smooths out noise from bad days
 * - Detects steady trends over weeks
 * - Industry standard for time-series
 */
export function updateTrend(
    currentTrendSlope: number,
    currentHealth: number,
    previousHealth: number
): { slope: number; classification: TrendClassification } {
    // Calculate normalized delta
    const delta = (currentHealth - previousHealth) / 100;

    // EWMA update: new = α×delta + (1-α)×old
    const newSlope = (TREND_ALPHA * delta) + ((1 - TREND_ALPHA) * currentTrendSlope);

    // Classify direction
    let classification: TrendClassification;
    if (newSlope > TREND_IMPROVING_THRESHOLD) classification = 'improving';
    else if (newSlope < TREND_AT_RISK_THRESHOLD) classification = 'at_risk';
    else classification = 'stable';

    return { slope: newSlope, classification };
}

// ==================== HELPER: MEDIAN CALCULATION ====================

/**
 * Calculates median from array of numbers.
 * Used for personal baseline calculation.
 * 
 * @param values - Array of numbers
 * @returns Median value
 */
export function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}
