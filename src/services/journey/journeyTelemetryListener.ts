
import { TelemetryEvent } from '../../types';
import { JourneySDK } from './journeySdk';
import { JourneyEventBuilder } from './journeyEventBuilder';

/**
 * JourneyTelemetryListener
 * 
 * Intercepts raw system telemetry and converts relevant signals into local JourneyEvents.
 * 
 * RULE: Deduplication
 * If the student opens the same Note within a short window (e.g. 5 minutes), 
 * we treat it as the same session and do NOT create a duplicate event.
 */
export const JourneyTelemetryListener = {

    /**
     * Main Entry Point: Called by the Telemetry Engine (telemetryBrainService)
     */
    onTelemetryCaptured: async (event: TelemetryEvent) => {
        console.log('[JOURNEY_LISTENER] 📨 Received Telemetry:', event.eventType);
        try {
            if (event.eventType === 'notes_accessed') {
                await handleNotesAccessed(event);
            }
            // Handle Quiz & Exam Completions (Adaptor V1 & V2)
            if (
                event.eventType === 'quiz_completed' ||
                event.eventType === 'quiz_v2_completed' ||
                event.eventType === 'exam_completed' ||
                event.eventType === 'quiz.completed' ||
                event.eventType === 'exam.completed'
            ) {
                console.log('[JOURNEY_LISTENER] 🔍 Detected Quiz/Exam Event. Processing...');
                await handleQuizCompleted(event);
            }
        } catch (e) {
            console.error('[JOURNEY_LISTENER] 💥 Failed to process telemetry', e);
        }
    }
};

/**
 * Handle "quiz_completed" / "quiz_v2_completed"
 */
async function handleQuizCompleted(event: TelemetryEvent) {
    const { studentId, payload, timestamp } = event;
    console.log('[JOURNEY_LISTENER] 👉 Handling Quiz Completion. Payload keys:', Object.keys(payload));

    // P0 FIX: Prioritize sessionId as the authoritative Journey refId
    const quizId = payload.sessionId || payload.quizId || (payload as any).id || (payload as any).contentId;
    console.log('[JOURNEY_LISTENER] 🆔 Resolved quizId/refId:', quizId);

    if (!quizId) {
        console.warn('[JOURNEY_LISTENER] ⚠️ No quizId found in payload. Aborting.');
        return;
    }

    // 1. Check for duplicates (STRICT SESSION ID MATCH ONLY)
    // User Requirement: "NO time-window dedup for quizzes. Only dedup on same sessionId"
    const now = new Date(timestamp).getTime(); // FIX: Define 'now' variable (was missing)
    const dateStr = new Date(timestamp).toISOString().split('T')[0];
    const todaysEvents = await JourneySDK.getEventsByDate(studentId, dateStr);

    const duplicate = todaysEvents.find(e =>
        (e.type === 'quiz' || e.type === 'exam') &&
        e.refId === quizId
    );

    if (duplicate) {
        console.log(`[JOURNEY_LISTENER] ♻️ Deduped quiz/exam event (Already exists): ${quizId}`);
        return;
    }

    // 2. Determine Type (Quiz vs Exam)
    // payload.mode might be 'EXAM' or 'QUIZ'
    const mode = payload.mode || (payload.metadata?.mode) || 'QUIZ';
    const type = mode === 'EXAM' ? 'exam' : 'quiz';

    // 3. Build Event using Builder (or manual if builder expects different shape)
    // We can use JourneyEventBuilder.fromQuizResult if payload matches, otherwise construct manually

    // Construct simplified result object for Builder
    const score = payload.score !== undefined ? payload.score : payload.finalScore;
    const total = payload.total !== undefined ? payload.total : payload.totalQuestions;

    const mockResult: any = {
        id: quizId,
        userId: studentId,
        topic: payload.topic || payload.subject || 'General',
        score: score || 0,
        total: total || 0,
        percentage: payload.percentage || (score && total ? (score / total) * 100 : 0),
        date: now,
        startedAt: payload.startedAt || (now - (payload.timeSpent ? payload.timeSpent * 1000 : 15 * 60000)),
        finishedAt: now
    };

    const journeyEvent = JourneyEventBuilder.fromQuizResult(mockResult, 'adaptive');

    // Override type if it's an exam
    journeyEvent.type = type;
    journeyEvent.title = payload.title || `${type === 'exam' ? 'Exam' : 'Quiz'}: ${mockResult.topic}`;

    // Add extra metrics
    if (payload.metadata) {
        journeyEvent.metrics = { ...journeyEvent.metrics, ...payload.metadata };
    }

    console.log('[JOURNEY_LISTENER] 🏗️ Build success. Saving event:', journeyEvent.title);
    await JourneySDK.createEvent(journeyEvent);
    console.log(`[JOURNEY_LISTENER] Created ${type} Event: ${journeyEvent.title}`);
}

/**
 * Handle "notes_accessed"
 */
async function handleNotesAccessed(event: TelemetryEvent) {
    const { studentId, payload, timestamp } = event;
    const noteId = payload.noteId || (payload as any).contentId;

    if (!noteId) return;

    // 1. Check for duplicates in the last 5 minutes
    const DEDUP_WINDOW_MS = 5 * 60 * 1000;
    const now = new Date(timestamp).getTime();

    // We can't efficiently query "last 5 mins" easily without a range index on startAt
    // But we can query by date and filter in memory since daily events are low volume.
    const dateStr = new Date(timestamp).toISOString().split('T')[0];
    const todaysEvents = await JourneySDK.getEventsByDate(studentId, dateStr);

    // Look for an existing event of type 'notes' with same refId within window
    const duplicate = todaysEvents.find(e =>
        e.type === 'notes' &&
        e.refId === noteId &&
        Math.abs(e.startAt - now) < DEDUP_WINDOW_MS
    );

    if (duplicate) {
        console.log(`[JOURNEY_LISTENER] Deduped notes event: ${noteId} (Window: 5m)`);
        // Optional: Extend the duration of the existing event? 
        // For now, simpler to just ignore the re-open as part of same session.
        return;
    }

    // 2. Build new Journey Event
    // We assume the payload might contain subject/title, otherwise defaults
    // Note: NoteDisplay payload is { noteId, atoms, metadata: { mode } }
    // It doesn't strictly have title/subject. We might need to fetch or infer.
    // However, usually the creation flow or `HistoryItem` has it.
    // If we only have ID, we might store generic title or look it up. 
    // For V1, we'll try to extract from payload or fallback.

    const subject = payload.metadata?.subject || 'Study';
    const title = payload.title || payload.noteTitle || 'Study Notes'; // We might need to pass this in telemetry

    // Create the event
    // Using a builder pattern or manual construction
    // Since we don't have a HistoryItem or QuizResult, we construct manually matching builder logic

    // ESTIMATE DURATION: 
    // Notes usually don't have an "end" signal. We assume a 15-20m read if not closed.
    // (User PRD says: infer end time via idle timeout or hard cap). 
    // For a creation event, we just set a default fixed duration for the record (20m).
    const DEFAULT_DURATION_MIN = 20;

    const journeyEvent = {
        studentId,
        date: dateStr,
        startAt: now,
        endAt: now + (DEFAULT_DURATION_MIN * 60000),
        durationMin: DEFAULT_DURATION_MIN,
        type: 'notes' as const,
        subjectId: subject,
        title: title, // We might need to ensure NoteDisplay passes title
        source: 'adaptive' as const,
        refId: noteId,
        metrics: {
            mode: payload.metadata?.mode
        }
    };

    await JourneySDK.createEvent(journeyEvent);
    console.log(`[JOURNEY_LISTENER] Created Notes Event: ${title}`);
}
