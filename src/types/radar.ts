
export enum RadarStrategy {
    ONBOARDING = 'ONBOARDING',
    RECOVERY = 'RECOVERY',
    BUILD = 'BUILD',
    CHALLENGE = 'CHALLENGE',
    MAINTAIN = 'MAINTAIN'
}

export enum RadarActionType {
    QUIZ = 'QUIZ',
    NOTE = 'NOTE',
    EXAM = 'EXAM',
    DISCOVERY = 'DISCOVERY' // Added for Onboarding
}

export enum RadarUrgency {
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW'
}

export interface RadarActionPayload {
    atomIds?: string[];
    mode?: string; // Legacy
    pageRef?: number;
    scopeId?: string; // subject or file ID
    scope?: 'SUBJECT' | 'FILE';

    // V3 Execution Matrix
    quizOrigin?: 'PRACTICE' | 'REPAIR' | 'EXPAND' | 'CHALLENGE' | 'NEW' | 'SMART';
    quizScope?: 'FILE' | 'SUBJECT';
    examMode?: 'STANDARD' | 'PRACTICE' | 'CHALLENGE' | 'ADAPTIVE';
    noteMode?: 'STUDY' | 'REVIEW' | 'PREVIEW';
    contentId?: string;
}

export interface RadarAction {
    actionId: string;
    subjectId: string;
    actionType: RadarActionType;
    urgency: RadarUrgency;
    title: string;
    reason: string;
    payload: RadarActionPayload;
}

export interface StudentRadarSnapshot {
    studentId: string;
    updatedAt: number;
    schemaVersion: number; // 1

    strategyOfTheDay: RadarStrategy;

    actions: RadarAction[];
}

export type RecommendationOutcome = 'IMPROVED' | 'NO_CHANGE' | 'DECLINED';

export interface RadarRecommendationHistoryItem {
    id: string;
    studentId: string;
    strategy: RadarStrategy;
    subjectId: string;
    takenAt: number;
    outcome: RecommendationOutcome;
    actionType: RadarActionType;
}
