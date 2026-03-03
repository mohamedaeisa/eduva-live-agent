export interface LearningHealthDTO {
    lhsScore: number;            // 0–100
    status: "at_risk" | "stabilizing" | "advancing" | "thriving";
    insightText: string;
    isBuilding?: boolean;        // Semantic flag for UI mode
    xp: {
        level: number;
        currentXP: number;
        nextLevelXP: number;
        weeklyXPDelta: number;
    };
}

export interface MasteryCanvasDTO {
    nodes: {
        subjectId: string;
        subjectName: string;
        masteryPercent: number;
        retentionState: "stable" | "fading" | "critical";
        lastAttemptAt: string; // ISO String
    }[];
    edges: {
        from: string;   // subjectId
        to: string;
    }[];
}

export interface CognitiveSkillsDTO {
    studentScore: number;        // aggregated 0–100
    classAverage: number;
    metrics: {
        name: "knowledge_retention" | "consistency" | "focus_time" | "problem_solving" | "quiz_speed";
        value: number;             // 0–100
        delta7d: number;           // % change
    }[];
    insight: string;
}

export interface SubjectOverviewDTO {
    subjectId: string;
    subjectName: string;
    masteryPercent: number;
    retentionState: "stable" | "fading" | "critical";
    lastAttemptAt: string;
}

export interface RecentActivityDTO {
    id: string; // Add ID for key
    type: "quiz" | "assessment";
    subjectName: string;
    masteryDelta: number;        // +/-
    retentionImpact: "stable" | "improved" | "declined";
    occurredAt: string;
}

export interface GrowthTimelineDTO {
    points: {
        date: string;
        masteryScore: number;
        expectedScore: number;
    }[];
}

export interface PerformanceSnapshotDTO {
    learningHealth: LearningHealthDTO;
    masteryCanvas: MasteryCanvasDTO;
    cognitiveSkills: CognitiveSkillsDTO;
    subjectOverview: SubjectOverviewDTO[];
    recentActivity: RecentActivityDTO[];
    growthTimeline: GrowthTimelineDTO;
}
