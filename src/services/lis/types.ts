/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Learning Intelligence System — Type Definitions
 */

// ==================== TIME CONTEXT ====================

export interface TimeContext {
    durationSec: number;          // ACTIVE time only (for mastery)
    idleDurationSec?: number;     // Tracked but EXCLUDED from calculations
    mode: 'practice' | 'fix' | 'challenge' | 'exam';
    attemptType: 'first' | 'retry';
}

// ==================== TELEMETRY EVENTS ====================

export type LISEventType =
    // Quiz Events
    | 'quiz.generated'
    | 'quiz.question.answered'
    | 'quiz.completed'
    | 'quiz.abandoned'
    // Exam Events
    | 'exam.started'
    | 'exam.blueprint_created'
    | 'exam.generated'
    | 'exam.slot.answered'
    | 'exam.completed'
    | 'exam.timed_out'
    // Content Events
    | 'notes.generated'
    | 'notes.viewed'
    | 'notes.section.expanded'
    | 'material.opened'
    | 'material.time_spent'
    // Session Events
    | 'session.started'
    | 'session.ended';

export interface LISEvent {
    // Identity
    id: string;
    idempotencyKey: string;
    studentId: string;

    // Classification
    eventType: LISEventType;
    schemaVersion: '2.1.1';

    // Time Context (MANDATORY)
    timeContext: TimeContext;

    // Payload (type-specific)
    payload: Record<string, any>;

    // Metadata
    timestamp: string;             // ISO 8601 UTC
    sessionId?: string;
}

// ==================== ATOM SIGNALS ====================

export type MasteryLevel = 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNKNOWN';

export interface AtomSignals {
    // Identity
    studentId: string;
    atomId: string;
    subject: string;              // NORMALIZED

    // The Three Signals
    knowledge: number;            // 0-1, EWMA-updated
    fluency: number;              // 0.6-1.2, bounded
    depth: number;                // 0-1, weighted Bloom average

    // Derived
    mastery: number;              // 0-100, calculated from signals
    stability: number;            // 0-1, log-based confidence
    masteryLevel: MasteryLevel;

    // History (for personal baseline)
    attempts: number;
    correctCount: number;
    firstAttemptTimes: number[];  // For median calculation (last 10)
    totalActiveTimeSec: number;
    bloomHistory: number[];       // Last 20 Bloom levels

    // Challenge Stats (separate tracking)
    challengeAttempts: number;
    challengeSuccesses: number;

    // Timestamps
    lastTestedAt: number;
    updatedAt: number;

    // Version
    schemaVersion: '2.1.1';
}

// ==================== SUBJECT HEALTH ====================

export type HealthStatus = 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
export type TrendClassification = 'improving' | 'stable' | 'at_risk';

export interface SubjectHealth {
    // Identity
    studentId: string;
    subjectId: string;            // NORMALIZED

    // The Three Aggregates
    subjectMastery: number;       // 0-100, weighted atom average
    coverage: number;             // 0-100, % mastered atoms
    stability: number;            // 0-1, average atom stability

    // Derived
    health: number;               // 0-100, final health score
    status: HealthStatus;

    // Trend (EWMA-based)
    trendSlope: number;           // Current EWMA slope
    trendClassification: TrendClassification;

    // Stats
    totalAtoms: number;
    masteredAtoms: number;
    weakAtoms: number;
    unknownAtoms: number;

    // Study Time (for analytics, NOT for health)
    totalStudyTimeSec: number;

    // Timestamps
    lastEvaluatedAt: number;

    // Version
    schemaVersion: '2.1.1';
}

// ==================== COMPASS SNAPSHOT ====================

export type RadarSignalType =
    | 'REPAIR'
    | 'EXPAND'
    | 'CHALLENGE'
    | 'CELEBRATE'
    | 'DECAY_WARNING';

export type RadarPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type RecommendedActionType =
    | 'REPAIR'
    | 'EXPAND'
    | 'CHALLENGE'
    | 'REVIEW';

export interface RadarSignal {
    signalId: string;
    type: RadarSignalType;
    priority: RadarPriority;
    title: string;
    description: string;
    actionLabel: string;
    atomIds: string[];
}

export interface RecommendedAction {
    type: RecommendedActionType;
    label: string;
    atomIds: string[];
    rationale: string;
}

export interface WeakCluster {
    topic: string;
    atomIds: string[];
    avgMastery: number;
}

// Atom progress within a learning material
export interface MaterialAtomProgress {
    atomId: string;
    conceptTag: string;
    mastery: number;
    masteryLevel: MasteryLevel;
    stability: number;
}

// Legacy alias for backward compatibility
export type FileAtomCoverage = MaterialAtomProgress;

// Learning material grouping (PDF, video, lesson, etc.)
export interface MaterialCoverage {
    materialId: string;        // Unique identifier for this material
    materialName: string;      // Display name (e.g., "Chapter 3.pdf")
    materialType: 'PDF' | 'VIDEO' | 'LESSON' | 'UNKNOWN';  // Source type
    coveragePercent: number;   // 0-100
    masteryPercent: number;    // 0-100
    atoms: MaterialAtomProgress[];
    curriculumMap?: any;       // CurriculumMapSnapshot
}

// Legacy alias for backward compatibility
export type FileCoverage = MaterialCoverage;

export interface CompassSnapshot {
    // Identity
    studentId: string;
    subjectId: string;
    snapshotId: string;
    generatedAt: number;

    // Top-Level Metrics (PRE-CALCULATED, UI reads directly)
    contentCoverage: number;       // 0-100
    learningProgress: number;      // 0-100 (subject mastery)
    healthScore: number;           // 0-100
    healthStatus: HealthStatus;
    trendClassification: TrendClassification;
    totalStudyTimeSec: number;

    // Atom Counts (Directly from Health)
    totalAtoms: number;
    masteredAtoms: number;
    weakAtoms: number;

    // Learning Materials Breakdown
    materials: MaterialCoverage[];

    // Weak Clusters (PRE-IDENTIFIED)
    weakClusters: WeakCluster[];

    // RADAR SIGNALS (Consolidated here, not separate collection)
    radarSignals: RadarSignal[];

    // RECENT LEARNING SIGNALS (For History Screen Micro-Progress)
    recentLearningSignals: AtomSignals[];

    // Recommended Action (PRE-CALCULATED)
    recommendedAction: RecommendedAction;

    // Version
    schemaVersion: '2.1.1';
}

// ==================== GROWTH TIMELINE ====================

export type TimelineEventType =
    | 'RESOURCE_STUDIED'
    | 'CONCEPTS_IDENTIFIED'
    | 'ASSESSMENT_ATTEMPTED'
    | 'ASSESSMENT_COMPLETED'
    | 'UNDERSTANDING_IMPROVED'
    | 'SUBJECT_HEALTH_UPDATED';

export interface TimelineEvent {
    id: string;
    type: TimelineEventType;
    timestamp: number;
    label: string;
    metadata?: Record<string, any>;
}

export interface DailySnapshot {
    date: string;               // YYYY-MM-DD
    mastery: number;
    coverage: number;
    stability: number;
    health: number;
    studyTimeSec: number;
    questionsAnswered: number;
}

export interface WeeklyAggregate {
    weekStart: string;          // YYYY-MM-DD (Monday)
    avgMastery: number;
    avgCoverage: number;
    totalStudyTimeSec: number;
    totalQuestions: number;
    daysActive: number;
}

export interface GrowthTimeline {
    // Identity
    studentId: string;
    subjectId: string;

    // Daily Snapshots (last 90 days)
    dailySnapshots: DailySnapshot[];

    // Weekly Aggregates (last 12 weeks)
    weeklyAggregates: WeeklyAggregate[];

    // Granular Timeline Events (for History Screen)
    timelineEvents?: TimelineEvent[];

    // Version
    schemaVersion: '2.1.1';
}

// ==================== PARENT SIGNALS ====================

export type ParentStatusColor = 'GREEN' | 'YELLOW' | 'RED';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ParentOverallStatus {
    label: string;             // "On Track" | "Needs Support" | "Struggling"
    emoji: string;             // "✅" | "⚠️" | "🚨"
    trendLabel: string;        // "Improving" | "Steady" | "Needs Attention"
}

export interface ParentSubjectInsight {
    name: string;
    status: ParentStatusColor;
    insight: string;           // "Strong in Algebra, gaps in Geometry"
    recommendation: string;    // "Encourage 10 more minutes on Geometry"
    priority: number;          // For sorting
}

export interface ParentEngagement {
    weeklyStudyTime: string;   // "3h 45m"
    consistencyLabel: string;  // "Practiced 5 of 7 days"
    trendLabel: string;        // "More active than last week"
}

export interface ParentAlert {
    severity: AlertSeverity;
    message: string;
    suggestedAction?: string;
}

export interface ParentWin {
    subject: string;
    achievement: string;       // "Mastered Quadratic Equations!"
    timestamp: number;
}

export interface ParentSignals {
    // Identity
    parentId: string;
    studentId: string;
    generatedAt: number;

    // Overall Status (INTERPRETED, not raw scores)
    overallStatus: ParentOverallStatus;

    // Subject Insights (max 5, sorted by priority)
    subjects: ParentSubjectInsight[];

    // Engagement Summary (FORMATTED, not raw)
    engagement: ParentEngagement;

    // Alerts (if any)
    alerts: ParentAlert[];

    // Recent Wins (positive reinforcement)
    recentWins: ParentWin[];

    // Version
    schemaVersion: '2.1.1';
}
