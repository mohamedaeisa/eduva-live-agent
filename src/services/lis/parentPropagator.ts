/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Parent Signal Propagator
 * 
 * PURPOSE: Translate student data into parent-friendly signals.
 * 
 * ⚠️ NO RAW METRICS EXPOSED — only interpretations
 * ⚠️ NO FORMULAS — reads pre-aggregated data
 */

import { db } from '../firebaseConfig';
import type {
    SubjectHealth,
    ParentSignals,
    ParentOverallStatus,
    ParentSubjectInsight,
    ParentEngagement,
    ParentAlert,
    ParentWin,
} from './types';
import { LIS_SCHEMA_VERSION } from './constants';

// ==================== PARENT SIGNAL PROPAGATION ====================

/**
 * Propagates student signals to parent view.
 * 
 * Interprets health scores into parent-friendly language.
 * 
 * @param studentId - Student ID
 */
export async function propagateParentSignals(studentId: string): Promise<void> {
    // Fetch parent ID (from student profile)
    const studentDoc = await db.collection('students').doc(studentId).get();
    const parentId = studentDoc.data()?.parentId;

    if (!parentId) {
        console.log(`[LIS_PARENT] No parent linked to student ${studentId}`);
        return;
    }

    console.log(`[LIS_PARENT] Propagating signals to parent ${parentId}`);

    // ========== FETCH ALL SUBJECT HEALTH ==========

    const healthSnapshot = await db
        .collection('student_subject_health')
        .where('studentId', '==', studentId)
        .get();

    const subjects: SubjectHealth[] = healthSnapshot.docs.map(doc => doc.data() as SubjectHealth);

    if (subjects.length === 0) {
        console.log(`[LIS_PARENT] No subjects found for student ${studentId}`);
        return;
    }

    // ========== INTERPRET SIGNALS (NO RAW DATA) ==========

    const overallStatus = interpretOverallStatus(subjects);
    const subjectInsights = interpretSubjectInsights(subjects);
    const engagement = interpretEngagement(subjects);
    const alerts = detectAlerts(subjects);
    const recentWins = detectWins(subjects);

    // ========== BUILD PARENT SIGNALS ==========

    const signals: ParentSignals = {
        parentId,
        studentId,
        generatedAt: Date.now(),

        overallStatus,
        subjects: subjectInsights,
        engagement,
        alerts,
        recentWins,

        schemaVersion: LIS_SCHEMA_VERSION,
    };

    // ========== SAVE ==========

    await db.collection('parent_signals').doc(parentId).set(signals);

    console.log(`[LIS_PARENT] Signals propagated: ${subjectInsights.length} subjects, ${alerts.length} alerts`);
}

// ==================== INTERPRETATION LOGIC ====================

/**
 * Interprets overall status from all subjects.
 * 
 * NO RAW SCORES — only labels and trend indicators.
 */
function interpretOverallStatus(subjects: SubjectHealth[]): ParentOverallStatus {
    const avgHealth = subjects.reduce((sum, s) => sum + s.health, 0) / subjects.length;

    let label: string;
    let emoji: string;

    if (avgHealth >= 70) {
        label = 'On Track';
        emoji = '✅';
    } else if (avgHealth >= 45) {
        label = 'Needs Support';
        emoji = '⚠️';
    } else {
        label = 'Struggling';
        emoji = '🚨';
    }

    // Trend label
    const improvingCount = subjects.filter(s => s.trendClassification === 'improving').length;
    const atRiskCount = subjects.filter(s => s.trendClassification === 'at_risk').length;

    let trendLabel: string;
    if (improvingCount > atRiskCount) {
        trendLabel = 'Improving';
    } else if (atRiskCount > improvingCount) {
        trendLabel = 'Needs Attention';
    } else {
        trendLabel = 'Steady';
    }

    return { label, emoji, trendLabel };
}

/**
 * Interprets each subject into parent-friendly insights.
 * 
 * Returns max 5 subjects, sorted by priority.
 */
function interpretSubjectInsights(subjects: SubjectHealth[]): ParentSubjectInsight[] {
    const insights: ParentSubjectInsight[] = [];

    for (const subject of subjects) {
        let status: 'GREEN' | 'YELLOW' | 'RED';
        let insight: string;
        let recommendation: string;
        let priority: number;

        // Status classification
        if (subject.status === 'GOOD') {
            status = 'GREEN';
            insight = `Strong understanding (${subject.masteredAtoms} of ${subject.totalAtoms} concepts mastered)`;
            recommendation = 'Encourage exploring new topics';
            priority = 3; // Lowest priority
        } else if (subject.status === 'NEEDS_ATTENTION') {
            status = 'YELLOW';
            insight = `Building foundation (${subject.weakAtoms} concepts need practice)`;
            recommendation = `Suggest 15 more minutes on ${subject.subjectId}`;
            priority = 2;
        } else {
            status = 'RED';
            insight = `Significant gaps detected`;
            recommendation = `Schedule dedicated ${subject.subjectId} review time`;
            priority = 1; // Highest priority
        }

        // Adjust for trend
        if (subject.trendClassification === 'improving') {
            insight += ' — Improving!';
        } else if (subject.trendClassification === 'at_risk') {
            insight += ' — Declining recently';
            priority -= 0.5; // Increase urgency
        }

        insights.push({
            name: capitalize(subject.subjectId),
            status,
            insight,
            recommendation,
            priority,
        });
    }

    // Sort by priority (lower = more urgent)
    insights.sort((a, b) => a.priority - b.priority);

    // Return max 5
    return insights.slice(0, 5);
}

/**
 * Interprets engagement from study time.
 * 
 * NO RAW SECONDS — only formatted labels.
 */
function interpretEngagement(subjects: SubjectHealth[]): ParentEngagement {
    const totalTimeSec = subjects.reduce((sum, s) => sum + s.totalStudyTimeSec, 0);
    const hours = Math.floor(totalTimeSec / 3600);
    const minutes = Math.floor((totalTimeSec % 3600) / 60);

    const weeklyStudyTime = `${hours}h ${minutes}m`;

    // Consistency label (simplified - would need daily data for accuracy)
    const consistencyLabel = totalTimeSec > 10800 // > 3 hours
        ? 'Practiced regularly'
        : 'Could use more practice time';

    // Trend label (simplified)
    const trendLabel = 'Similar to last week'; // TODO: Compare with previous week

    return {
        weeklyStudyTime,
        consistencyLabel,
        trendLabel,
    };
}

/**
 * Detects alerts requiring parent attention.
 */
function detectAlerts(subjects: SubjectHealth[]): ParentAlert[] {
    const alerts: ParentAlert[] = [];

    // Critical health alert
    const criticalSubjects = subjects.filter(s => s.status === 'CRITICAL');
    if (criticalSubjects.length > 0) {
        alerts.push({
            severity: 'CRITICAL',
            message: `${criticalSubjects.length} subject(s) need immediate attention`,
            suggestedAction: 'Review progress with your child',
        });
    }

    // Declining trend alert
    const decliningSubjects = subjects.filter(s => s.trendClassification === 'at_risk');
    if (decliningSubjects.length >= 2) {
        alerts.push({
            severity: 'WARNING',
            message: `Learning progress declining in ${decliningSubjects.length} subjects`,
            suggestedAction: 'Check for obstacles to study time',
        });
    }

    // Low activity alert (would need timeline data for accuracy)
    const lowActivity = subjects.every(s => s.totalStudyTimeSec < 1800); // < 30 min each
    if (lowActivity) {
        alerts.push({
            severity: 'INFO',
            message: 'Low recent activity detected',
            suggestedAction: 'Encourage regular practice sessions',
        });
    }

    return alerts;
}

/**
 * Detects recent wins for positive reinforcement.
 */
function detectWins(subjects: SubjectHealth[]): ParentWin[] {
    const wins: ParentWin[] = [];

    for (const subject of subjects) {
        // Win 1: High mastery achievement
        if (subject.subjectMastery >= 80 && subject.masteredAtoms >= 10) {
            wins.push({
                subject: capitalize(subject.subjectId),
                achievement: `Mastered ${subject.masteredAtoms} concepts!`,
                timestamp: Date.now(),
            });
        }

        // Win 2: Improving trend
        if (subject.trendClassification === 'improving' && subject.subjectMastery >= 60) {
            wins.push({
                subject: capitalize(subject.subjectId),
                achievement: 'Steady improvement',
                timestamp: Date.now(),
            });
        }
    }

    // Return max 3 recent wins
    return wins.slice(0, 3);
}

// ==================== HELPERS ====================

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}
