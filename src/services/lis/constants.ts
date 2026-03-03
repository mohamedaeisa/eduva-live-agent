/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Learning Intelligence System — Constants & Thresholds
 * 
 * ⚠️ DO NOT MODIFY WITHOUT VERSION BUMP
 */

// ==================== FORMULA WEIGHTS ====================

/** Atom Mastery Formula: 0.60K + 0.25D + 0.15F */
export const MASTERY_WEIGHTS = {
    KNOWLEDGE: 0.60,
    DEPTH: 0.25,
    FLUENCY: 0.15,
} as const;

/** Subject Health Formula: 0.65M + 0.20C + 0.15S */
export const HEALTH_WEIGHTS = {
    MASTERY: 0.65,
    COVERAGE: 0.20,
    STABILITY: 0.15,
} as const;

// ==================== EWMA PARAMETERS ====================

/** Knowledge EWMA alpha (0.35 = 35% weight on new observation) */
export const KNOWLEDGE_ALPHA = 0.35;

/** Trend EWMA alpha (0.4 = 40% weight on recent delta) */
export const TREND_ALPHA = 0.4;

// ==================== COLD-START GUARDS ====================

/** Initial knowledge value for new atoms (neutral) */
export const COLD_START_PRIOR = 0.5;

/** Number of attempts before full EWMA weight applies */
export const COLD_START_THRESHOLD = 3;

/** Weight reduction during cold-start period (50% influence) */
export const COLD_START_WEIGHT_REDUCTION = 0.5;

// ==================== TIME GUARDS ====================

/** Maximum active time per question attempt (seconds) */
export const MAX_ACTIVE_TIME_PER_ATTEMPT_SEC = 180; // 3 minutes

/** Expected average time per question (seconds, for fluency baseline) */
export const EXPECTED_TIME_PER_QUESTION_SEC = 15;

// ==================== FLUENCY BOUNDS ====================

/** Minimum fluency factor (slow answers can't destroy mastery) */
export const FLUENCY_FLOOR = 0.6;

/** Maximum fluency factor (fast answers cap at 20% bonus) */
export const FLUENCY_CEILING = 1.2;

// ==================== BLOOM WEIGHTS ====================

export const BLOOM_WEIGHTS: Record<number, number> = {
    1: 0.40,   // Remember
    2: 0.60,   // Understand
    3: 0.75,   // Apply
    4: 0.90,   // Analyze
    5: 1.00,   // Evaluate
    6: 1.00,   // Create
} as const;

/** Default Bloom weight if level not found */
export const DEFAULT_BLOOM_WEIGHT = 0.5;

// ==================== MASTERY THRESHOLDS ====================

/** Minimum mastery score (never collapses below 30%) */
export const MASTERY_FLOOR = 0.30;

/** Mastery level thresholds */
export const MASTERY_THRESHOLDS = {
    STRONG: 80,    // >= 80% = STRONG
    PARTIAL: 50,   // 50-79% = PARTIAL
    // < 50% = WEAK
} as const;

/** Stability requirement for "mastered" classification */
export const MASTERED_STABILITY_THRESHOLD = 0.6;

/** Mastery requirement for "mastered" classification */
export const MASTERED_MASTERY_THRESHOLD = 75;

// ==================== HEALTH STATUS THRESHOLDS ====================

export const HEALTH_STATUS_THRESHOLDS = {
    GOOD: 70,              // >= 70 = GOOD
    NEEDS_ATTENTION: 45,   // 45-69 = NEEDS_ATTENTION
    // < 45 = CRITICAL
} as const;

// ==================== TREND THRESHOLDS ====================

/** Trend slope threshold for "improving" classification */
export const TREND_IMPROVING_THRESHOLD = 0.02;

/** Trend slope threshold for "at_risk" classification */
export const TREND_AT_RISK_THRESHOLD = -0.02;

// ==================== ATTEMPT TYPE WEIGHTS ====================

/** Weight reduction for retry attempts (70% of normal influence) */
export const RETRY_WEIGHT_REDUCTION = 0.7;

/** Weight boost for exam mode (120% of normal influence) */
export const EXAM_MODE_WEIGHT_BOOST = 1.2;

// ==================== IDEMPOTENCY ====================

/** Timestamp bucketing interval (milliseconds) */
export const IDEMPOTENCY_BUCKET_MS = 60 * 1000; // 1 minute

/** TTL for processed idempotency keys (milliseconds) */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ==================== GROWTH TIMELINE ====================

/** Number of days to keep in daily snapshots */
export const GROWTH_TIMELINE_DAILY_WINDOW = 90;

/** Number of weeks to keep in weekly aggregates */
export const GROWTH_TIMELINE_WEEKLY_WINDOW = 12;

// ==================== SCHEMA VERSION ====================

/** Current LIS schema version */
export const LIS_SCHEMA_VERSION = '2.1.1';
