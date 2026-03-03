/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Telemetry Ingestion Pipeline
 * 
 * PURPOSE: Process raw telemetry events and route to appropriate aggregators.
 * 
 * ⚠️ NO CALCULATIONS HERE — only routing and guard application
 * ⚠️ All formulas live in formulas.ts
 */

import { db } from '../firebaseConfig';
import { normalizeSubjectName } from '../../utils/subjectUtils';
import {
    capActiveTime,
    wasTimeCapped,
    generateIdempotencyKey,
    bucketTimestamp,
} from './guards';

import type { LISEvent, TimeContext } from './types';

// ==================== IDEMPOTENCY TRACKING ====================

/**
 * Checks if event has already been processed.
 * 
 * @param idempotencyKey - Generated key for this event
 * @returns true if already processed, false if new
 */
async function isEventProcessed(idempotencyKey: string): Promise<boolean> {
    const doc = await db.collection('telemetry_processed_keys').doc(idempotencyKey).get();
    return doc.exists;
}

/**
 * Marks event as processed.
 * 
 * @param idempotencyKey - Generated key for this event
 */
async function markEventProcessed(idempotencyKey: string): Promise<void> {
    await db.collection('telemetry_processed_keys').doc(idempotencyKey).set({
        processedAt: Date.now(),
        // TTL will be handled by Firestore TTL policy (24 hours)
    });
}

/**
 * Helper to dispatch events to the Journey Engine.
 * Lazy-loaded to avoid circular dependencies.
 */
async function notifyJourney(event: LISEvent) {
    try {
        const { JourneyTelemetryListener } = await import('../journey/journeyTelemetryListener');
        await JourneyTelemetryListener.onTelemetryCaptured(event as any);
    } catch (e) {
        console.warn('[LIS_INGESTION] Failed to notify journey:', e);
    }
}

// ==================== EVENT INGESTION ====================

/**
 * Main event ingestion function.
 * 
 * Applies guards and routes to appropriate processor.
 * 
 * @param event - Raw LIS event
 * @returns true if processed, false if duplicate
 */
export async function ingestEvent(event: LISEvent): Promise<boolean> {
    // Guard 2: Idempotency check
    const isDuplicate = await isEventProcessed(event.idempotencyKey);
    if (isDuplicate) {
        console.log(`[LIS_INGESTION] Duplicate event skipped: ${event.id}`);
        return false;
    }

    // Route to appropriate processor based on event type
    switch (event.eventType) {
        case 'quiz.question.answered':
            await processQuizAnswer(event);
            break;

        case 'quiz.completed':
            await processQuizCompleted(event);
            break;

        case 'exam.completed':
            await processExamCompleted(event);
            break;

        case 'notes.generated':
            await processNotesGenerated(event);
            break;

        case 'quiz.generated':
            await processQuizGenerated(event);
            break;

        case 'exam.generated':
            await processExamGenerated(event);
            break;

        // Other events are logged but don't trigger aggregation
        default:
            console.log(`[LIS_INGESTION] Event logged: ${event.eventType}`);
    }

    // Mark as processed
    await markEventProcessed(event.idempotencyKey);

    // Write to immutable events collection
    // ✅ FIX: Sanitize payload to remove undefined values (Firestore rejects them)
    await db.collection('telemetry_events').doc(event.id).set(sanitize(event));

    return true;
}

/**
 * Recursively removes undefined values from an object.
 * Firestore does not support 'undefined' as a field value.
 */
function sanitize<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item)) as unknown as T;
    }

    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, sanitize(v)])
    ) as unknown as T;
}

// ==================== QUIZ ANSWER PROCESSOR ====================

/**
 * Processes a single quiz question answer.
 * 
 * Extracts time context and applies guards.
 * Does NOT trigger aggregation — batched at quiz completion.
 */
async function processQuizAnswer(event: LISEvent): Promise<void> {
    const payload = event.payload as any; // Type from event payload

    // Guard 1: Cap active time
    const rawTime = payload.activeTimeSec || 0;
    const cappedTime = capActiveTime(rawTime);

    if (wasTimeCapped(rawTime)) {
        console.log(`[LIS_GUARD] Time capped: ${rawTime}s → ${cappedTime}s for atom ${payload.atomId}`);
    }

    // Store processed event (for batching at quiz.completed)
    // No aggregation triggered yet
    console.log(`[LIS_INGESTION] Quiz answer recorded: ${payload.atomId}`);
}

// ==================== QUIZ COMPLETED PROCESSOR ====================

/**
 * Processes quiz completion event.
 * 
 * Triggers atom-level aggregation for all questions in session.
 */
async function processQuizCompleted(event: LISEvent): Promise<void> {
    const payload = event.payload as any;

    if (!payload.granularResults || payload.granularResults.length === 0) {
        console.warn(`[LIS_INGESTION] Quiz completion missing granular results: ${event.id}`);
        return;
    }

    console.log(`[LIS_INGESTION] Processing quiz completion: ${payload.sessionId}, ${payload.granularResults.length} results`);

    // Import aggregator (lazy to avoid circular deps)
    const { updateAtomSignals } = await import('./atomAggregator');

    // Process each atom result
    for (const result of payload.granularResults) {
        // Guard 1: Cap active time
        const cappedTime = capActiveTime(result.responseTimeSec || 0);

        // ✅ NORMALIZE SUBJECT: Ensure strict lowercase for storage/joins
        const normalizedSubject = (payload.subject || '').toLowerCase();

        // Trigger atom aggregation
        await updateAtomSignals({
            studentId: event.studentId,
            atomId: result.atomId,
            subject: normalizedSubject, // FIX: Use normalized subject
            isCorrect: result.isCorrect,
            activeTimeSec: cappedTime,
            bloomLevel: result.bloomLevel || 2,
            attemptType: result.attemptType || 'first',
            mode: payload.mode || 'practice',
            isChallenge: payload.isChallenge || false,
        });
    }

    console.log(`[LIS_INGESTION] All atom signals updated (${payload.granularResults.length} atoms)`);

    // ✅ BATCHED AGGREGATION: Trigger subject/compass rebuild ONCE
    const { updateSubjectHealth } = await import('./subjectAggregator');
    const normalizedSubject = normalizeSubjectName(payload.subject);
    await updateSubjectHealth(event.studentId, normalizedSubject);

    console.log(`[LIS_INGESTION] Quiz completion processed successfully`);

    // ✅ DECISION TRIGGER: Notify DecisionService to evaluate Radar rebuild
    const { evaluateSubjectHealth } = await import('../decisionService');
    await evaluateSubjectHealth({
        studentId: event.studentId,
        subjectId: normalizedSubject,
        source: 'quiz',
        sessionType: payload.isRetry ? 'retry' : 'new',
        sessionId: payload.sessionId
    });

    // ✅ JOURNEY HOOK
    await notifyJourney(event);
}

// ==================== QUOTA MATRIX INTEGRATION ====================

/**
 * Checks event against Quota Matrix and triggers consumption if applicable.
 */
async function checkAndConsumeQuota(event: LISEvent): Promise<void> {
    const { QUOTA_MATRIX } = await import('../monetization/quotaMatrix');
    const { monetizationClient } = await import('../monetization/client');

    const rule = QUOTA_MATRIX[event.eventType];

    if (!rule) return;

    // Apply conditional logic if present
    if (rule.condition && !rule.condition(event)) {
        return;
    }

    console.log(`[LIS_QUOTA] Triggering ${rule.metric} consumption for ${event.eventType}`);
    await monetizationClient.incrementUsage(rule.metric, rule.amount);
}

// ... existing code ...

// ==================== EXAM COMPLETED PROCESSOR ====================

/**
 * Processes exam completion event.
 * 
 * Triggers atom-level aggregation for all exam items.
 */
async function processExamCompleted(event: LISEvent): Promise<void> {
    const payload = event.payload as any;

    if (!payload.itemMap) {
        console.warn(`[LIS_INGESTION] Exam completion missing item map: ${event.id}`);
        return;
    }

    console.log(`[LIS_INGESTION] Processing exam completion: ${payload.examSessionId}`);

    // ... (rest of processing: aggregators, decision service) ...
    // Import aggregator
    const { updateAtomSignals } = await import('./atomAggregator');

    // Process each exam item
    for (const [slotId, item] of Object.entries(payload.itemMap as Record<string, any>)) {
        if (item.status === 'SKIPPED') continue; // Skip unanswered

        // Guard 1: Cap active time
        const cappedTime = capActiveTime(item.timeSec || 0);

        // Trigger atom aggregation
        await updateAtomSignals({
            studentId: event.studentId,
            atomId: item.atomId,
            subject: payload.subject,
            isCorrect: item.status === 'CORRECT',
            activeTimeSec: cappedTime,
            bloomLevel: item.bloomLevel || 2,
            attemptType: 'first', // Exams are always first attempts
            mode: 'exam',
            isChallenge: false,
        });
    }

    console.log(`[LIS_INGESTION] Exam completion processed successfully`);

    // ✅ DECISION TRIGGER: Notify DecisionService to evaluate Radar rebuild
    const normalizedSubject = normalizeSubjectName(payload.subject);
    const { evaluateSubjectHealth } = await import('../decisionService');
    await evaluateSubjectHealth({
        studentId: event.studentId,
        subjectId: normalizedSubject,
        source: 'exam',
        sessionType: 'new', // Exams are always new sessions effectively
        sessionId: payload.examSessionId
    });

    // ✅ JOURNEY HOOK
    await notifyJourney(event);

    // ✅ QUOTA TRACKING (Matrix)
    await checkAndConsumeQuota(event);
}

// ==================== NOTES GENERATED PROCESSOR ====================

/**
 * Processes notes generation event.
 * 
 * Triggers usage tracking for notes.
 */
async function processNotesGenerated(event: LISEvent): Promise<void> {
    console.log(`[LIS_INGESTION] Processing notes generation: ${event.payload.contentId}`);

    // ✅ QUOTA TRACKING (Matrix)
    await checkAndConsumeQuota(event);

    // ✅ JOURNEY HOOK
    await notifyJourney(event);
}

// ==================== GENERATION EVENT PROCESSORS ====================

async function processQuizGenerated(event: LISEvent): Promise<void> {
    const payload = event.payload as any;
    console.log(`[LIS_INGESTION] Processing quiz generation: ${payload.sessionId}`);

    // ✅ QUOTA TRACKING (Matrix)
    await checkAndConsumeQuota(event);

    // ✅ JOURNEY HOOK
    await notifyJourney(event);
}

async function processExamGenerated(event: LISEvent): Promise<void> {
    const payload = event.payload as any;
    console.log(`[LIS_INGESTION] Processing exam generation: ${payload.blueprintId}`);

    // ✅ QUOTA TRACKING (Matrix)
    await checkAndConsumeQuota(event);

    // ✅ JOURNEY HOOK
    await notifyJourney(event);
}

// ... (rest of file) ...

