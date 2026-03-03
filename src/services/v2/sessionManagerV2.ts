import { db } from '../firebaseConfig';
import { QuizSessionV2, ParentFeedEvent, InteractionState, SignalType } from '../../types';
import { ActiveSession } from './typesV2';

/**
 * THE NUDGE HOOK
 * Checks for pending parent missions to force remediation in the next session.
 */
export const applyNudgeHook = async (studentId: string, subject: string, qsio: QuizSessionV2): Promise<QuizSessionV2> => {
    try {
        const nudgesSnap = await db.collection('parent_nudges')
            .where('studentId', '==', studentId)
            .where('subject', '==', subject)
            .where('status', '==', 'PENDING')
            .limit(1)
            .get();

        if (!nudgesSnap.empty) {
            console.debug(`[UCCS_HOOK] Pending nudge found. Forcing remediation for session: ${qsio.sessionId}`);
            return {
                ...qsio,
                ladderConstraints: {
                    ...qsio.ladderConstraints,
                    forcedRemediation: true
                }
            };
        }
    } catch (e) {
        console.warn("[UCCS_HOOK] Nudge check failed, proceeding with standard QSIO", e);
    }
    return qsio;
};

/**
 * THE LOOP CLOSURE HOOK
 * Synchronizes active session completion with parent nudge resolution.
 * Dispatches Reverse Notification to Parent Feed upon mastery verification.
 */
export const syncActiveSession = async (session: ActiveSession) => {
    try {
        await db.collection('active_sessions').doc(session.sessionId).set({
            ...session,
            lastUpdatedAt: Date.now()
        }, { merge: true });

        if (session.status === 'COMPLETED') {
            console.debug(`[UCCS_HOOK] Session ${session.sessionId} completed. Closing loop...`);
            
            const correctCount = session.results.filter(r => r.isCorrect).length;
            const percentage = (correctCount / session.results.length) * 100;
            const isWin = percentage >= 80;

            // 1. Resolve Parent Nudge if linked
            const nudgeId = session.qsio.identity.sessionId;
            if (nudgeId.startsWith('fix_') || nudgeId.startsWith('rescue_') || nudgeId.startsWith('sess_')) {
                await db.collection('parent_nudges').doc(nudgeId).set({
                    status: 'COMPLETED',
                    interactionState: InteractionState.COMPLETED,
                    completedAt: Date.now(),
                    resultScore: correctCount,
                    resultTotal: session.results.length
                }, { merge: true });
            }

            // 2. DISPATCH REVERSE NOTIFICATION (Parent Visibility)
            const feedEvent: Partial<ParentFeedEvent> = {
                parentId: session.qsio.identity.initiatedBy === 'parent_fix' ? 'linked_parent' : 'broadcast', // In real system, lookup parentId from student record
                studentId: session.studentId,
                subject: session.qsio.scope.subject,
                title: isWin ? 'Mastery Verified' : 'Session Synced',
                message: isWin 
                    ? `Exceptional performance in ${session.qsio.scope.subject}. Target concepts verified with ${percentage}% accuracy.`
                    : `Completed a practice session for ${session.qsio.scope.subject}. Data points captured for optimization.`,
                // Fix: Assign SignalType enum values correctly to resolve type error
                signalType: isWin ? SignalType.WIN : SignalType.ACTIVE,
                severity: isWin ? 'SUCCESS' : 'INFO',
                isWin: isWin,
                createdAt: Date.now(),
                interactionState: InteractionState.COMPLETED,
                progressPhase: 'RESOLVED',
                aiDecisionTrace: {
                    explanation: `Neural bridge sealed for ${session.results.length} atoms.`,
                    reasoning: [
                        `Accuracy: ${percentage}%`,
                        `Deltas: +${(session.results.filter(r => r.isCorrect).length * 0.1).toFixed(2)} Mastery Shift`
                    ]
                }
            };

            await db.collection('parent_feed').add(feedEvent);
            console.debug("[UCCS_HOOK] Parent Reverse Notification dispatched.");
        }
    } catch (e) {
        console.error("[UCCS_HOOK] Session sync failed", e);
    }
};

export const getSessionSnapshot = async (sessionId: string): Promise<ActiveSession | null> => {
    const doc = await db.collection('active_sessions').doc(sessionId).get();
    return doc.exists ? (doc.data() as ActiveSession) : null;
};
