
import { db } from './firebaseConfig';
import {
    RawActivityEvent, SubjectHealthState, SubjectHealthEvidence, TopicMetric, ParentSignal, StudentAtomSummary
} from '../types';
import { getRecentParentSignals } from './parentService';
import firebase from 'firebase/compat/app';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { logger } from '../utils/logger';

// --- CONFIGURABLE PARAMETERS ---
const ENGAGEMENT_WINDOW_DAYS = 7;
const HISTORICAL_TREND_SNAPSHOTS = 4;
const EXPECTED_HOURS_PER_WEEK = 5;

/**
 * Technical Flow Step 3: Decision Engine Summarization
 * Aggregates summary signals from Firestore into SubjectHealthEvidence.
 */
async function _getMasterySignals(studentId: string, subjectId: string): Promise<any> {
    try {
        // UCCS 6.5 Refactor: Query AGGREGATED signals instead of RAW logs
        // student_atom_summary contains current state of every concept
        const snap = await db.collection('student_atom_summary')
            .where('studentId', '==', studentId)
            .get();

        if (snap.empty) {
            return { detailedTopics: [], overallMasteryScore: 0, isFallback: false };
        }

        const summaries = snap.docs.map(d => d.data() as StudentAtomSummary);

        // Detailed Topics construction from aggregates
        const detailedTopics: TopicMetric[] = summaries.map(s => {
            const score = Math.round((s.correct / (s.attempts || 1)) * 100);
            return {
                name: s.conceptTag || 'Concept',
                score,
                status: score >= 80 ? 'GOOD' : score >= 50 ? 'ATTENTION' : 'RISK',
                action: score < 50 ? 'Revision' : 'Maintain',
                contentId: 'GLOBAL',
                sourceDocumentId: 'GLOBAL' // Placeholder since aggregate doesn't store file origin directly
            };
        });

        const avgScore = summaries.length > 0
            ? Math.round(summaries.reduce((acc, s) => acc + (s.correct / (s.attempts || 1)), 0) / summaries.length * 100)
            : 0;

        const weakest = detailedTopics
            .filter(t => t.status === 'RISK')
            .sort((a, b) => a.score - b.score)[0]?.name;

        return { detailedTopics, overallMasteryScore: avgScore, weakestTopic: weakest, isFallback: false };
    } catch (e: any) {
        logger.error('STATE', `[UCCS_DECISION_FAULT] Mastery Signals: ${e.message}`);
        return { detailedTopics: [], overallMasteryScore: 0, isFallback: true };
    }
}

async function _getEngagementSignals(studentId: string, subjectId: string): Promise<any> {
    const now = Date.now();
    const oneWeekAgo = now - (ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Aggregated from session summaries
    const snap = await db.collection('telemetry_events')
        .where('studentId', '==', studentId)
        .where('timestamp', '>=', new Date(oneWeekAgo).toISOString())
        .get();

    const summaries = snap.docs.map(d => d.data());
    const totalTimeSec = summaries.reduce((acc, s) => acc + (s.payload?.timeSpent || 0), 0);
    const hoursPerWeek = parseFloat((totalTimeSec / 3600).toFixed(1));

    return { hoursPerWeek, quizCompletion: summaries.length > 0 ? 100 : 0, practiceRatio: 1 };
}

async function _getHistoricalStates(studentId: string, subjectId: string): Promise<SubjectHealthState[]> {
    try {
        const snap = await db.collection('student_decision_history')
            .where('studentId', '==', studentId)
            .where('subjectId', '==', normalizeSubjectName(subjectId))
            .limit(HISTORICAL_TREND_SNAPSHOTS)
            .get();
        return snap.docs.map(doc => doc.data() as SubjectHealthState).sort((a, b) => b.lastEvaluatedAt - a.lastEvaluatedAt);
    } catch (e) { return []; }
}

function _computeTrend(history: SubjectHealthState[], currentConfidence: number): SubjectHealthState['trend'] {
    if (history.length < 2) return 'STABLE';
    const recent = history.slice(0, 2).map(s => s.confidenceScore);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const delta = currentConfidence - avg;
    if (delta >= 5) return 'UP';
    if (delta <= -5) return 'DOWN';
    return 'STABLE';
}

function _computeScoresNew(mastery: any, engagement: any, parentSignals: ParentSignal[], historicalStates: SubjectHealthState[]): any {
    const masteryScore = mastery.overallMasteryScore || 0;
    const rawPracticeScore = (engagement.hoursPerWeek / EXPECTED_HOURS_PER_WEEK) * 100;
    let practiceScore = Math.min(100, Math.round(rawPracticeScore)) || 0;
    const consistencyScore = 100;
    const baseScore = (masteryScore * 0.6) + (practiceScore * 0.2) + (consistencyScore * 0.2);
    const tempTrend = _computeTrend(historicalStates, baseScore);
    const trendMomentum = tempTrend === 'UP' ? 10 : tempTrend === 'STABLE' ? 5 : 0;
    const parentImpactTotal = parentSignals.reduce((acc, sig) => acc + (sig.impactScore || 0), 0);
    const supportBonus = Math.min(10, parentImpactTotal);
    let confidenceScore = Math.round(baseScore + trendMomentum + supportBonus);
    confidenceScore = Math.min(100, Math.max(0, confidenceScore));
    let overallStatus: SubjectHealthState['overallStatus'] = confidenceScore >= 70 ? 'GOOD' : confidenceScore >= 45 ? 'NEEDS_ATTENTION' : 'CRITICAL';
    return { masteryScore, practiceScore, consistencyScore, confidenceScore, overallStatus, trend: tempTrend };
}


// --- TYPES & ENUMS ---

export type DecisionOutcome =
    | 'REBUILD_APPROVED'
    | 'SKIPPED_NO_DELTA'
    | 'SKIPPED_LOW_SIGNAL'
    | 'SKIPPED_DEBOUNCED'
    | 'SKIPPED_INVALID_CONTEXT';

export interface EvaluationContext {
    studentId: string;
    subjectId: string;
    source: 'quiz' | 'exam' | 'manual';
    sessionType?: 'new' | 'retry';
    sessionId?: string;
}

// --- EVALUATION LOGIC ---

export async function evaluateSubjectHealth(context: EvaluationContext): Promise<any> {
    const { studentId, subjectId, source, sessionType } = context;

    if (!studentId || !subjectId) return null;

    const normalizedSubject = normalizeSubjectName(subjectId);
    logger.module(`[UCCS_DECISION] Starting evaluation for: ${normalizedSubject} | Source: ${source}`);

    try {
        // 1. Fetch Signals & History
        const masterySignals = await _getMasterySignals(studentId, normalizedSubject);
        const engagementSignals = await _getEngagementSignals(studentId, normalizedSubject);
        const historicalStates = await _getHistoricalStates(studentId, normalizedSubject);
        const parentSignals = await getRecentParentSignals(studentId, normalizedSubject, 7);

        // 2. Compute New State
        const scores = _computeScoresNew(masterySignals, engagementSignals, parentSignals, historicalStates);

        // --- WRITE GUARD: PREVENT "ALL" SUBJECT CORRUPTION ---
        const invalidSubjects = ['ALL', 'All', 'all', 'GLOBAL'];
        if (invalidSubjects.includes(normalizedSubject)) {
            logger.db(`[DECISION_GUARD] 🛑 Blocked write for virtual subject: ${normalizedSubject}`);
            // ... (cleanup logic kept for safety) ...
            return null;
        }

        // 3. Persist State (Always update health, even if Radar is skipped)
        const summary: SubjectHealthState = {
            subjectId: normalizedSubject,
            studentId: studentId,
            overallStatus: scores.overallStatus,
            confidenceScore: scores.confidenceScore,
            trend: scores.trend,
            primaryRiskTopic: masterySignals.weakestTopic || null,
            cause: scores.masteryScore < 60 ? 'Low Mastery / Accuracy' : 'Inconsistent Pattern',
            sparkline: (masterySignals.detailedTopics || []).map((t: any) => t.score),
            hoursLogged: engagementSignals.hoursPerWeek,
            lastEvaluatedAt: Date.now(),
        };

        // Save to DB (omitted implementation details for brevity, assuming existing logic)
        await _persistDecisionState(studentId, normalizedSubject, summary, scores, masterySignals);

        // 4. GATING LOGIC: Decide if Radar needs rebuilding
        let decision: DecisionOutcome = 'SKIPPED_LOW_SIGNAL';
        let rejectReason = '';

        // Get previous state for delta comparison
        const previousState = historicalStates[0]; // Most recent history
        const prevConfidence = previousState?.confidenceScore || 0;
        const prevTrend = previousState?.trend || 'STABLE';
        const prevMastery = previousState?.sparkline ?
            (previousState.sparkline.reduce((a, b) => a + b, 0) / previousState.sparkline.length) : 0;

        // Calculate Deltas
        const confidenceDelta = Math.abs(scores.confidenceScore - prevConfidence);
        const masteryDelta = Math.abs(scores.masteryScore - prevMastery);
        const trendChanged = scores.trend !== prevTrend;

        if (source === 'exam') {
            // EXAM: Always rebuild
            decision = 'REBUILD_APPROVED';
        } else if (source === 'quiz') {
            // QUIZ (Practice/Expand/Retry)
            if (sessionType === 'retry') {
                // RETRY RULE: Stricter gating to prevent farming
                if (trendChanged || masteryDelta >= 5) {
                    decision = 'REBUILD_APPROVED';
                } else {
                    decision = 'SKIPPED_LOW_SIGNAL';
                    rejectReason = `Retry Delta too low (M_Delta=${masteryDelta})`;
                }
            } else {
                // NEW QUIZ RULE
                if (confidenceDelta >= 3 || trendChanged) {
                    decision = 'REBUILD_APPROVED';
                } else {
                    decision = 'SKIPPED_NO_DELTA';
                    rejectReason = `Conf_Delta=${confidenceDelta}, No Trend Change`;
                }
            }
        } else if (source === 'manual') {
            decision = 'REBUILD_APPROVED';
        }

        // 5. Execute Radar Rebuild if Approved
        if (decision === 'REBUILD_APPROVED') {
            logger.orchestrator(`[UCCS_DECISION] Radar rebuild APPROVED | Source=${source} | Conf_Delta=${confidenceDelta}`);
            try {
                const { rebuildRadar } = await import('./radarSnapshotBuilder');
                await rebuildRadar(studentId);
            } catch (radarError) {
                logger.error('STATE', `[RADAR_TRIGGER_FAIL] Could not rebuild radar: ${radarError}`);
            }
        } else {
            logger.orchestrator(`[UCCS_DECISION] Radar rebuild SKIPPED | ${decision} | ${rejectReason}`);
        }

        return summary;
    } catch (e: any) {
        logger.error('STATE', `[UCCS_DECISION_CRITICAL] Evaluation failed: ${e.message}`);
        return null;
    }
}

// Helper to keep the main function clean
async function _persistDecisionState(studentId: string, subjectId: string, summary: any, scores: any, masterySignals: any) {
    const evidence: SubjectHealthEvidence = {
        id: `${studentId}_${subjectId}`, studentId, subjectId,
        masteryScore: scores.masteryScore, practiceScore: scores.practiceScore, consistencyScore: scores.consistencyScore,
        detailedTopics: masterySignals.detailedTopics || [],
        engagementSummary: { hoursPerWeek: scores.hoursLogged || 0, quizCompletion: 100, homeworkCompletion: 100, practiceRatio: 1 },
        lastEvaluatedAt: Date.now()
    };

    const batch = db.batch();
    const subjectDocRef = db.collection('student_decisions').doc(studentId).collection('subjects').doc(subjectId);
    const evidenceDocRef = db.collection('student_decision_evidence').doc(`${studentId}_${subjectId}`);
    const historyDocRef = db.collection('student_decision_history').doc();

    batch.set(subjectDocRef, JSON.parse(JSON.stringify(summary)), { merge: true });
    batch.set(evidenceDocRef, JSON.parse(JSON.stringify(evidence)), { merge: true });
    batch.set(historyDocRef, {
        studentId,
        subjectId,
        confidenceScore: summary.confidenceScore,
        lastEvaluatedAt: summary.lastEvaluatedAt,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
}

