/**
 * EDUVA PARENT MODULE - AGGREGATION TYPES
 * 
 * Philosophy: Parents are supporters, not evaluators.
 * These types define READ-ONLY aggregation documents that are:
 * - Written ONLY by server-side aggregation (triggered by student events)
 * - Read by parent UI (no computation on read)
 * - Scoped to (parentId, studentId) or (parentId, studentId, subject)
 */

/**
 * SCREEN 1: Parent Compass - Overall Learning Health
 * Document ID: {parentId}_{studentId}
 * Collection: parent_student_overview
 */
export interface ParentStudentOverview {
    parentId: string;
    studentId: string;
    lastUpdated: number;

    // Overall Learning Health (Primary Signal)
    overallHealth: 'Strong' | 'Stable' | 'Needs Support';
    healthReason: string; // Descriptive sentence (e.g., "Your child is learning steadily and responding well to challenges.")

    // Four Core Signals (NO NUMBERS)
    effort: 'Improving' | 'Steady' | 'Light';
    understanding: 'Settling' | 'Steady' | 'Developing';
    focus: 'Stable' | 'Variable';
    recovery: 'Strong' | 'Steady' | 'Building';

    // Abstract Stability Trend (NO SCALE, NO PERCENTAGES)
    // Values are opaque signal points. No normalization. No implied score.
    stabilityTrend: Array<{ t: number; v: number }>;

    // Support Window (Tone-based guidance)
    supportStance: string; // e.g., "Encourage effort and persistence. Avoid focusing on results."
}

/**
 * SCREEN 2: Subject Learning Overview - Per Subject Experience
 * Document ID: {parentId}_{studentId}_{normalizedSubject}
 * Collection: parent_subject_overview
 */
export interface ParentSubjectOverview {
    parentId: string;
    studentId: string;
    subject: string; // e.g., "Mathematics", "Arabic Language"
    lastUpdated: number;

    // Learning State (PRIMARY - Exactly as specified)
    learningState:
    | 'Stable & Progressing'
    | 'Effortful but Steady'
    | 'Temporarily Challenging'
    | 'Light Engagement';

    // Learning Signals (Max 3, some may be undefined)
    signals: {
        effort?: 'High' | 'Medium' | 'Light';
        understanding?: 'Settling' | 'Developing' | 'Exploring';
        focus?: 'Stable' | 'Variable';
    };

    // Parent Support Stance (One-line emotional guidance)
    parentSupportStance: string; // e.g., "Normalize difficulty and be patient"
}

/**
 * SCREEN 3: Subject Progress Report - Structural Coverage
 * Document ID: {parentId}_{studentId}_{normalizedSubject}
 * Collection: parent_subject_progress_report
 */
export interface ParentSubjectProgressReport {
    parentId: string;
    studentId: string;
    subject: string;
    lastUpdated: number;

    // Structural Coverage (ONLY ALLOWED NUMBERS)
    totalConcepts: number;
    coveredConcepts: number;
    masteredConcepts: number;
    pendingConcepts: number;

    // Recent Momentum (Movement trend, NOT accuracy) — CATEGORICAL ONLY
    // Represents change in coverage over last 7 days
    recentMomentum: 'Rising' | 'Stable' | 'Slowing';

    // Mastery Health (Qualitative ONLY)
    masteryHealth: 'Strong' | 'Stable' | 'Fragile';

    // Chapter/File Timeline
    timeline: Array<{
        chapterName: string; // e.g., "Chapter 3: Fixed Sensors", "Data Acquisition.pdf"
        status: 'Completed' | 'In Progress' | 'Not Started';
        conceptsCovered: number;
        conceptsTotal: number;
    }>;
}

/**
 * Helper type for parent-student relationship lookup
 */
export interface ParentRelationship {
    parentId: string;
    studentId: string;
    linkedAt: number;
    // Meta can be extended for authority level, permissions, etc.
}
