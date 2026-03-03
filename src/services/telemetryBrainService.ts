
import { db } from './firebaseConfig';
import { TelemetryEvent, StudentAtomSummary } from '../types';
import firebase from 'firebase/compat/app';
import { logger } from '../utils/logger';
import { evaluateSubjectHealth } from './decisionService';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { sanitizeForFirestore } from './storageService';
import { updateStudentOverview, updateSubjectOverview, updateSubjectProgressReport } from './parentAggregationService';
import { generateGrowthMirrorDelta } from './growthMirrorService';

/**
 * EDUVA BRAIN LAYER: Telemetry Engine (Additive)
 */

import { JourneyTelemetryListener } from './journey/journeyTelemetryListener';

export const sendTelemetry = async (event: Omit<TelemetryEvent, 'id'>) => {
    // ⚠️ DEPRECATED: This function will be removed in next major version
    // ⚠️ Use services/lis/telemetryIngestion.ingestEvent() instead
    // console.warn('[DEPRECATED] telemetryBrainService.sendTelemetry() is deprecated. Use services/lis/telemetryIngestion.ingestEvent()');

    if (!db) return;

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    // SANITIZATION GUARD: Ensure undefined values are stripped before Firestore write
    const fullEvent: TelemetryEvent = sanitizeForFirestore({ ...event, id: eventId });

    try {
        // 1. Store raw immutable event
        await db.collection('telemetry_events').doc(eventId).set(fullEvent);
        logger.telemetry(`Event Captured: ${event.eventType}`, fullEvent);

        // 1.5 Journey Listener Hook (Local-First)
        JourneyTelemetryListener.onTelemetryCaptured(fullEvent);

        // 2. Trigger async aggregation (Modular & Additive)
        if (event.eventType === 'quiz_completed' || event.eventType === 'quiz_v2_completed') {
            await updateAtomAggregates(fullEvent);

            // 3. Trigger health recalculation from new aggregate state
            const subject = event.payload.metadata?.subject ||
                (event.payload as any).subject ||
                'General';

            const normalizedSub = normalizeSubjectName(subject);
            logger.module(`[BRAIN] Re-evaluating health for ${normalizedSub}...`);
            await evaluateSubjectHealth({ studentId: event.studentId, subjectId: normalizedSub, source: 'quiz' });

            // 4. Trigger Parent Aggregation (Non-blocking, async)
            // This updates parent-facing documents for read-only display
            triggerParentAggregation(event.studentId, normalizedSub).catch(e => {
                logger.error('TELEMETRY', '[BRAIN] Parent aggregation error (non-fatal)', e);
            });

            // 5. Trigger Growth Mirror Aggregation (Non-blocking, async)
            generateGrowthMirrorDelta(event.studentId).catch(e => {
                logger.error('TELEMETRY', '[BRAIN] Growth Mirror aggregation error (non-fatal)', e);
            });
        }
    } catch (e) {
        logger.error('TELEMETRY', "Telemetry Ingestion Failure", e);
    }
};

/**
 * Pipeline: student_atom_summary Updater
 * FIXED: Broadcasting Fallacy Removed. Now supports granular per-atom updates.
 * FIXED v7.1: Challenge Mode Non-Destructive Aggregation
 */
const updateAtomAggregates = async (event: TelemetryEvent) => {
    const { studentId, payload } = event;
    const { atoms, score, total, timeSpent } = payload;

    // Check Challenge Mode Flag from Event Metadata
    const isChallenge = event.payload.metadata?.isChallenge === true;

    // P0 FIX: Check for granular results first
    const granularResults = payload.granularResults as { atomId: string, isCorrect: boolean, timeSpent?: number, evidenceType?: string }[] | undefined;

    const batch = db.batch();

    if (granularResults && Array.isArray(granularResults)) {
        // PRECISION MODE (V2 Correctness)
        for (const res of granularResults) {

            // CHALLENGE GUARDRAIL: Additive Only
            if (isChallenge) {
                console.log("[CHALLENGE] Advanced mastery signal recorded (non-destructive)");
                // Explicitly check for CHALLENGE evidence type if available for robust handling
                if (res.evidenceType === 'CHALLENGE') {
                    // L4 Evidence Logic: Success strengthens mastery, failure is ignored (no penalty)
                    if (!res.isCorrect) continue;
                } else {
                    // Fallback for legacy challenge payloads without explicit evidenceType
                    if (!res.isCorrect) continue;
                }
            }

            const summaryRef = db.collection('student_atom_summary').doc(`${studentId}_${res.atomId}`);
            // Calculate time allocation (default to even split if not tracked per-question)
            const timeDelta = res.timeSpent || (timeSpent ? timeSpent / granularResults.length : 0);

            // Use merge to create if not exists, increment if exists
            batch.set(summaryRef, {
                studentId,
                atomId: res.atomId,
                attempts: firebase.firestore.FieldValue.increment(1),
                correct: firebase.firestore.FieldValue.increment(res.isCorrect ? 1 : 0),
                avgTime: firebase.firestore.FieldValue.increment(timeDelta), // Storing cumulative time in SECONDS
                lastTested: Date.now(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        logger.db(`[BRAIN] Precision Aggregation: Updated ${granularResults.length} atoms.${isChallenge ? ' (Challenge Mode)' : ''}`);
    } else {
        // FALLBACK LEGACY MODE (Broadcasting)
        // Only runs if granular data is missing (Legacy Quizzes)
        if (!atoms || atoms.length === 0) return;

        // Distribute success across atoms mentioned in the event
        // Note: This is less accurate but preserves legacy functionality
        const isSuccess = score !== undefined && total !== undefined ? (score / total) >= 0.7 : true;
        const individualTime = timeSpent ? timeSpent / atoms.length : 0;

        // Challenge Guardrail for Legacy: If challenge failed, abort update
        if (isChallenge && !isSuccess) {
            console.log("[CHALLENGE] Legacy signal ignored (non-destructive failure).");
            return;
        }

        for (const atomId of atoms) {
            const summaryRef = db.collection('student_atom_summary').doc(`${studentId}_${atomId}`);

            batch.set(summaryRef, {
                studentId,
                atomId,
                attempts: firebase.firestore.FieldValue.increment(1),
                correct: firebase.firestore.FieldValue.increment(isSuccess ? 1 : 0),
                avgTime: firebase.firestore.FieldValue.increment(individualTime), // Storing cumulative time in SECONDS
                lastTested: Date.now(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    }

    try {
        await batch.commit();
        logger.db(`Aggregates Synchronized in Firestore.`);
    } catch (e) {
        logger.error('TELEMETRY', "Aggregation Pipeline Fault", e);
    }
};

// ⚠️ DEPRECATED: Legacy summary stats (Read-Only)
export const getStudentMasteryStats = async (studentId: string): Promise<StudentAtomSummary[]> => {
    const snap = await (db.collection('student_atom_summary')
        .where('studentId', '==', studentId)
        .get() as Promise<firebase.firestore.QuerySnapshot>);

    return snap.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            masteryPct: data.attempts > 0 ? (data.correct / data.attempts) * 100 : 0
        } as StudentAtomSummary;
    });
};

// ✅ V2: Granular Atom Signals (Source of Truth)
import { AtomSignals } from './lis/types';
export const getStudentAtomSignals = async (studentId: string): Promise<AtomSignals[]> => {
    const snap = await db.collection('student_atom_signals')
        .where('studentId', '==', studentId)
        .get();

    return snap.docs.map(doc => doc.data() as AtomSignals);
};

/**
 * Trigger Parent Aggregation Pipeline
 * Called after student telemetry events to update parent-facing documents
 */
const triggerParentAggregation = async (studentId: string, subject: string) => {
    try {
        logger.db(`[PARENT_AGG] Triggering aggregation for student ${studentId}, subject ${subject}`);

        // Run all three aggregations in parallel
        await Promise.all([
            updateStudentOverview(studentId),
            updateSubjectOverview(studentId, subject),
            updateSubjectProgressReport(studentId, subject)
        ]);

        logger.db(`[PARENT_AGG] Aggregation complete`);
    } catch (e) {
        // Non-fatal - parent UI will show stale data until next update
        logger.error('TELEMETRY', `[PARENT_AGG] Aggregation failed`, e);
    }
};

/**
 * V3 RECORD: Track when a Radar Action is taken
 */
export const trackRadarAction = async (studentId: string, actionId: string, strategy: string, subjectId: string) => {
    if (!db) return;

    const record = {
        studentId,
        actionId,
        strategy,
        subjectId,
        takenAt: Date.now(),
        status: 'TAKEN'
    };

    try {
        await db.collection('student_recommendation_history').add(record);
        logger.telemetry(`[RADAR] Action Taken: ${actionId}`, record);
    } catch (e) {
        logger.error('TELEMETRY', "[RADAR] Failed to log action", e);
    }
};
