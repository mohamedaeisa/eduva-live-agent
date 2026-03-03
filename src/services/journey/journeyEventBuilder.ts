
import { JourneyEvent, JourneyEventType, JourneyEventSource } from '../../types/journey';
import { QuizResult, HistoryItem, SessionData } from '../../types';

/**
 * JourneyEventBuilder
 * 
 * Factory for creating authoritative JourneyEvents from raw system signals.
 * Enforces business rules for timestamps, durations, and metadata.
 */
export const JourneyEventBuilder = {

    /**
     * Build from a completed Quiz Attempt
     */
    fromQuizResult: (result: QuizResult & { startedAt?: number, finishedAt?: number }, source: JourneyEventSource = 'adaptive'): JourneyEvent => {
        // Fallbacks if explicit timestamps missing (legacy data)
        const endAt = result.finishedAt || result.date || Date.now();
        // Default duration 15m if unknown
        const startAt = result.startedAt || (endAt - 15 * 60 * 1000);
        const durationMin = Math.round((endAt - startAt) / 60000);

        return {
            id: crypto.randomUUID(),
            studentId: result.userId || 'unknown',
            date: new Date(startAt).toISOString().split('T')[0],
            startAt,
            endAt,
            durationMin,
            type: 'quiz',
            subjectId: result.topic || 'General', // Subject often stored in topic for legacy
            title: `Quiz: ${result.topic}`,
            source,
            refId: result.id,
            metrics: {
                score: result.score,
                correct: result.score, // Explicitly map score to 'correct' for UI clarity
                total: result.total,
                percentage: result.percentage
            },
            version: 0, // Assigned by sync/backfill
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            syncStatus: 'dirty'
        };
    },

    /**
     * Build from a generic History Item (Notes, etc.)
     */
    fromHistoryItem: (item: HistoryItem): JourneyEvent | null => {
        if (!['study_notes', 'flashcards', 'quiz'].includes(item.type)) return null;

        const startAt = item.timestamp;
        // Estimate durations based on type if not tracked
        let durationMin = 10;
        if (item.type === 'quiz') durationMin = 15;
        if (item.type === 'study_notes') durationMin = 20;

        const endAt = startAt + (durationMin * 60000);

        let type: JourneyEventType = 'study';
        if (item.type === 'quiz') type = 'quiz';
        if (item.type === 'study_notes') type = 'notes';

        return {
            id: crypto.randomUUID(),
            studentId: item.userId,
            date: new Date(startAt).toISOString().split('T')[0],
            startAt,
            endAt,
            durationMin,
            type,
            subjectId: item.metadata?.subject || 'General',
            title: item.title,
            source: 'library',
            refId: item.id,
            metrics: {},
            version: 0,
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            syncStatus: 'dirty'
        };
    },

    /**
     * Build from a Study Session (Telemetry)
     * Enforces the "10m idle timeout" and "2h cap" rules
     */
    fromStudySession: (session: SessionData): JourneyEvent => {
        const startAt = session.startTime;

        // Inference Rule: closedAt || lastActive || opened + 10m
        // We often don't have explicit closedAt in raw session, use lastActiveAt
        let roughEnd = session.lastActiveAt;

        // If last active is suspiciously close to start (bounce), give it min 5m
        if (roughEnd - startAt < 5 * 60 * 1000) {
            roughEnd = startAt + 5 * 60 * 1000;
        }

        // Cap Duration: 2 hours (2 * 60 * 60 * 1000)
        const MAX_DURATION = 2 * 60 * 60 * 1000;
        if (roughEnd - startAt > MAX_DURATION) {
            roughEnd = startAt + MAX_DURATION;
        }

        const endAt = roughEnd;
        const durationMin = Math.round((endAt - startAt) / 60000);

        return {
            id: crypto.randomUUID(),
            studentId: session.userId || 'unknown',
            date: new Date(startAt).toISOString().split('T')[0],
            startAt,
            endAt,
            durationMin,
            type: 'study',
            subjectId: 'General', // Telemetry often lacks specific subject unless parsed from pagesVisited
            title: 'Study Session',
            source: 'compass',
            refId: session.sessionId,
            metrics: {
                pagesVisited: session.pagesVisited?.length || 0,
                actions: session.actionsLog?.length || 0
            },
            version: 0,
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            syncStatus: 'dirty'
        };
    }
};
