import { db } from './firebaseConfig';
import type {
    ExamResult,
    HistoryItem,
    LibraryItem,
    TelemetryEvent,
    StudentAtomSummary,
} from '../types';
import { getHistory, getLibraryItems } from './storageService';

// ========================================
// TYPE DEFINITIONS
// ========================================

export type TimelineEventType = 'EXAM' | 'QUIZ' | 'NOTE' | 'STUDY';

export interface TimelineEvent {
    id: string;
    type: TimelineEventType;
    subject: string;
    title: string;
    timestamp: number;

    // Optional fields based on type
    score?: number;
    grade?: 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
    masteryDelta?: number;
    duration?: string;
    contentId?: string;

    actions: {
        label: string;
        action: string;
        data?: any;
    }[];
}

export interface PerformanceMetrics {
    subjectMastery: {
        subjectId: string;
        subjectName: string;
        confidenceScore: number;
        status: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
        trend: 'UP' | 'DOWN' | 'STABLE';
    }[];
    recentGrades: {
        id: string;
        subject: string;
        title: string;
        score: number;
        grade: string;
        timestamp: number;
    }[];
    skills: {
        name: string;
        score: number;
        trend: 'UP' | 'DOWN' | 'STABLE';
    }[];
    goals: {
        title: string;
        progress: number;
        target: string;
    }[];
}

// ========================================
// TIMELINE AGGREGATION
// ========================================

/**
 * Unified timeline event aggregator
 * Merges exam_results, history, library, and telemetry into chronological feed
 */
export const getTimelineEvents = async (
    userId: string,
    limit: number = 20,
    cursor?: number
): Promise<{ events: TimelineEvent[]; nextCursor?: number }> => {
    const events: TimelineEvent[] = [];

    try {
        // 1. Fetch exam results (last 50 for filtering)
        const examResultsSnap = await db
            .collection('exam_results')
            .where('userId', '==', userId)
            .orderBy('finishedAt', 'desc')
            .limit(50)
            .get();

        examResultsSnap.docs.forEach((doc) => {
            const result = doc.data() as ExamResult;
            events.push({
                id: result.examSessionId,
                type: result.mode === 'PRACTICE' ? 'QUIZ' : 'EXAM',
                subject: result.blueprintId || 'General',
                title: `${result.mode === 'PRACTICE' ? 'Practice Quiz' : 'Exam'} Results`,
                timestamp: result.finishedAt,
                score: result.normalizedScore,
                grade: getGradeLabel(result.normalizedScore),
                masteryDelta: 0, // TODO: Calculate from growth mirror delta
                actions: [
                    { label: 'View Mistakes', action: 'view_mistakes', data: { examId: result.examSessionId } },
                    { label: 'Retake', action: 'retake', data: { examId: result.examSessionId } },
                    { label: 'Analysis', action: 'view_analysis', data: { examId: result.examSessionId } },
                ],
            });
        });

        // 2. Fetch history items (generated content)
        const historyItems = await getHistory(userId);
        historyItems.forEach((item: HistoryItem) => {
            // Only include meaningful types
            if (['study_notes', 'flashcards', 'quiz'].includes(item.type)) {
                events.push({
                    id: item.id,
                    type: 'STUDY',
                    subject: item.metadata?.subject || 'General',
                    title: item.title,
                    timestamp: item.timestamp,
                    contentId: item.metadata?.contentId,
                    actions: [
                        { label: 'View', action: 'view_content', data: { historyId: item.id } },
                    ],
                });
            }
        });

        // 3. Fetch library items (notes/PDFs)
        const libraryItems = await getLibraryItems(userId);
        libraryItems.forEach((item: LibraryItem) => {
            events.push({
                id: item.id,
                type: 'NOTE',
                subject: 'General', // TODO: Extract from linked atoms
                title: item.name,
                timestamp: item.timestamp,
                contentId: item.contentId,
                actions: [
                    { label: 'Read', action: 'read_note', data: { itemId: item.id } },
                    { label: 'Edit', action: 'edit_note', data: { itemId: item.id } },
                ],
            });
        });

        // 4. Sort all events by timestamp descending
        events.sort((a, b) => b.timestamp - a.timestamp);

        // 5. Apply cursor pagination
        const startIndex = cursor || 0;
        const endIndex = startIndex + limit;
        const paginatedEvents = events.slice(startIndex, endIndex);
        const hasMore = endIndex < events.length;

        return {
            events: paginatedEvents,
            nextCursor: hasMore ? endIndex : undefined,
        };
    } catch (error) {
        console.error('[StudentHistory] Failed to aggregate timeline:', error);
        return { events: [] };
    }
};

// ========================================
// PERFORMANCE METRICS
// ========================================

/**
 * Aggregates performance data from multiple intelligence sources
 */
export const getPerformanceMetrics = async (
    userId: string,
    subjectFilter?: string
): Promise<PerformanceMetrics> => {
    try {
        // 1. Subject Mastery from student_decisions
        const decisionsSnap = await db
            .collection('student_decisions')
            .where('studentId', '==', userId)
            .get();

        const subjectMastery = decisionsSnap.docs.map((doc) => {
            const data = doc.data();
            return {
                subjectId: data.subjectId,
                subjectName: data.subjectId, // TODO: Map to display name
                confidenceScore: data.confidenceScore || 0,
                status: data.overallStatus || 'GOOD',
                trend: data.trend || 'STABLE',
            };
        });

        // 2. Recent graded activities from exam_results
        const examResultsSnap = await db
            .collection('exam_results')
            .where('userId', '==', userId)
            .orderBy('finishedAt', 'desc')
            .limit(10)
            .get();

        const recentGrades = examResultsSnap.docs.map((doc) => {
            const result = doc.data() as ExamResult;
            return {
                id: result.examSessionId,
                subject: result.blueprintId || 'General',
                title: result.mode === 'PRACTICE' ? 'Practice Quiz' : 'Exam',
                score: result.normalizedScore,
                grade: getGradeLabel(result.normalizedScore),
                timestamp: result.finishedAt,
            };
        });

        // 3. Skills breakdown from student_atom_summary
        const skills = await getSkillsBreakdown(userId);

        // 4. Goals from student_decisions (derived)
        const goals = deriveGoalsFromDecisions(subjectMastery);

        return {
            subjectMastery: subjectFilter
                ? subjectMastery.filter((s) => s.subjectId === subjectFilter)
                : subjectMastery,
            recentGrades,
            skills,
            goals,
        };
    } catch (error) {
        console.error('[StudentHistory] Failed to aggregate performance:', error);
        return {
            subjectMastery: [],
            recentGrades: [],
            skills: [],
            goals: [],
        };
    }
};

/**
 * Derives skills from StudentAtomSummary aggregated by Bloom taxonomy
 */
export const getSkillsBreakdown = async (
    userId: string
): Promise<{ name: string; score: number; trend: 'UP' | 'DOWN' | 'STABLE' }[]> => {
    try {
        const summariesSnap = await db
            .collection('student_atom_summary')
            .where('studentId', '==', userId)
            .get();

        const summaries = summariesSnap.docs.map((d) => d.data() as StudentAtomSummary);

        // Aggregate by conceptTag (simplified skill mapping)
        const skillMap: Record<string, { correct: number; total: number }> = {
            'Problem Solving': { correct: 0, total: 0 },
            'Critical Thinking': { correct: 0, total: 0 },
            'Knowledge Retention': { correct: 0, total: 0 },
        };

        summaries.forEach((summary) => {
            const mastery = summary.masteryPct || 0;
            const isRecall = summary.conceptTag?.toLowerCase().includes('recall');
            const isApply = summary.conceptTag?.toLowerCase().includes('apply');

            if (isRecall) {
                skillMap['Knowledge Retention'].correct += summary.correct;
                skillMap['Knowledge Retention'].total += summary.attempts;
            } else if (isApply) {
                skillMap['Problem Solving'].correct += summary.correct;
                skillMap['Problem Solving'].total += summary.attempts;
            } else {
                skillMap['Critical Thinking'].correct += summary.correct;
                skillMap['Critical Thinking'].total += summary.attempts;
            }
        });

        return Object.entries(skillMap).map(([name, data]) => ({
            name,
            score: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            trend: 'STABLE' as const, // TODO: Calculate trend from historical data
        }));
    } catch (error) {
        console.error('[StudentHistory] Failed to calculate skills:', error);
        return [];
    }
};

/**
 * Derives goals from subject health state
 */
const deriveGoalsFromDecisions = (
    subjectMastery: PerformanceMetrics['subjectMastery']
): PerformanceMetrics['goals'] => {
    // Find weakest subject
    const weakestSubject = subjectMastery.reduce((prev, curr) =>
        curr.confidenceScore < prev.confidenceScore ? curr : prev
        , subjectMastery[0]);

    if (!weakestSubject) return [];

    const targetConfidence = 90;
    const currentConfidence = weakestSubject.confidenceScore;
    const progress = (currentConfidence / targetConfidence) * 100;

    return [
        {
            title: `Achieve ${targetConfidence}% confidence in ${weakestSubject.subjectName}`,
            progress: Math.min(progress, 100),
            target: `${targetConfidence}%`,
        },
    ];
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Maps normalized score (0-100) to letter grade
 */
export const getGradeLabel = (normalizedScore: number): 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F' => {
    if (normalizedScore >= 90) return 'A';
    if (normalizedScore >= 85) return 'B+';
    if (normalizedScore >= 80) return 'B';
    if (normalizedScore >= 75) return 'C+';
    if (normalizedScore >= 70) return 'C';
    if (normalizedScore >= 60) return 'D';
    return 'F';
};

/**
 * Formats timestamp to relative time string
 */
export const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
};
