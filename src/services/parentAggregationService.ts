/**
 * EDUVA PARENT AGGREGATION SERVICE
 * 
 * CRITICAL RULES:
 * 1. Called ONLY by student telemetry events (quiz completion, session end)
 * 2. NO real-time computation
 * 3. NO AI calls
 * 4. Writes to parent_* collections ONLY
 * 5. All logic is deterministic and testable
 * 
 * Architecture:
 * Student Action → Telemetry → updateAtomAggregates → THIS SERVICE → Parent Docs Updated
 */

import { db } from './firebaseConfig';
import {
    ParentStudentOverview,
    ParentSubjectOverview,
    ParentSubjectProgressReport
} from '../types/parentAggregation';
import { getStudentMasteryStats } from './telemetryBrainService';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { logger } from '../utils/logger';

/**
 * Get parent IDs for a student from parent_profiles collection
 * Parent-student links are stored in: parent_profiles/{parentId}.linkedStudents[]
 */
const getParentIdsForStudent = async (studentId: string): Promise<string[]> => {
    try {
        // Query all parent_profiles that have this student in their linkedStudents array
        const snap = await db.collection('parent_profiles')
            .where('linkedStudents', 'array-contains', studentId)
            .get();

        // Return all parent IDs (document IDs)
        const parentIds = snap.docs.map(doc => doc.id);
        logger.db(`[PARENT_AGG] Found ${parentIds.length} parent(s) linked to student ${studentId}`);
        return parentIds;
    } catch (e) {
        logger.error('STATE', '[PARENT_AGG] Failed to fetch parent relationships', e);
        return [];
    }
};

/**
 * Update Overall Student Overview (Screen 1 data)
 * Triggered after any significant student activity
 */
export const updateStudentOverview = async (studentId: string, parentIds?: string[]) => {
    try {
        const parents = parentIds || await getParentIdsForStudent(studentId);
        if (parents.length === 0) {
            logger.db('[PARENT_AGG] No parents linked to student, skipping overview update');
            return;
        }

        // Fetch student aggregate data
        const masteryStats = await getStudentMasteryStats(studentId);

        // Calculate Last 7 Days telemetry for signals
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentEvents = await db.collection('telemetry_events')
            .where('studentId', '==', studentId)
            .where('timestamp', '>=', new Date(sevenDaysAgo).toISOString())
            .orderBy('timestamp', 'asc')
            .get();

        const events = recentEvents.docs.map(d => d.data());

        // Compute Signals (Deterministic Logic)
        const effort = computeEffortSignal(events);
        const understanding = computeUnderstandingSignal(masteryStats);
        const focus = computeFocusSignal(events);
        const recovery = computeRecoverySignal(events);

        // Compute Overall Health
        const overallHealth = computeOverallHealth(effort, understanding, focus, recovery);
        const healthReason = generateHealthReason(overallHealth, effort, understanding);

        // Compute Stability Trend (Last 7 days, normalized 0-100)
        const stabilityTrend = computeStabilityTrend(events);

        // Generate Support Stance
        const supportStance = generateSupportStance(overallHealth, effort);

        const overview: ParentStudentOverview = {
            parentId: parents[0], // Will create one per parent in loop
            studentId,
            lastUpdated: Date.now(),
            overallHealth,
            healthReason,
            effort,
            understanding,
            focus,
            recovery,
            stabilityTrend,
            supportStance
        };

        // Write to Firestore for each parent
        const batch = db.batch();
        for (const parentId of parents) {
            const docRef = db.collection('parent_student_overview').doc(`${parentId}_${studentId}`);
            batch.set(docRef, { ...overview, parentId }, { merge: true });
        }
        await batch.commit();

        logger.db(`[PARENT_AGG] Updated student overview for ${parents.length} parent(s)`);
    } catch (e) {
        logger.error('STATE', '[PARENT_AGG] Failed to update student overview', e);
    }
};

/**
 * Update Subject Overview (Screen 2 data)
 * Triggered after subject-specific activity
 */
export const updateSubjectOverview = async (
    studentId: string,
    subject: string,
    parentIds?: string[]
) => {
    try {
        let parents = parentIds || await getParentIdsForStudent(studentId);
        if (parents.length === 0) {
            logger.db('[PARENT_AGG] No parent relationships found, using studentId as fallback parentId');
            parents = [studentId];
        }

        const normalizedSubject = normalizeSubjectName(subject);

        // Fetch subject-specific data
        const masteryStats = await getStudentMasteryStats(studentId);
        const subjectStats = masteryStats.filter(s => {
            // Find atoms by checking if they belong to this subject
            // Note: This assumes atomId includes subject info or we need another lookup
            return true; // TODO: Implement proper subject filtering once atom metadata is accessible
        });

        // Get recent subject activity
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const subjectEvents = await db.collection('telemetry_events')
            .where('studentId', '==', studentId)
            .where('timestamp', '>=', new Date(sevenDaysAgo).toISOString())
            .get();

        const events = subjectEvents.docs
            .map(d => d.data())
            .filter(e => normalizeSubjectName(e.payload?.metadata?.subject || '') === normalizedSubject);

        // Compute Learning State
        const learningState = computeLearningState(events, subjectStats);

        // Compute Signals
        const signals = {
            effort: computeSubjectEffort(events),
            understanding: computeSubjectUnderstanding(subjectStats),
            focus: computeSubjectFocus(events)
        };

        // Generate Support Stance
        const parentSupportStance = generateSubjectSupportStance(learningState);

        const overview: ParentSubjectOverview = {
            parentId: parents[0],
            studentId,
            subject: normalizedSubject,
            lastUpdated: Date.now(),
            learningState,
            signals,
            parentSupportStance
        };

        // Write to Firestore
        const batch = db.batch();
        for (const parentId of parents) {
            const docRef = db.collection('parent_subject_overview')
                .doc(`${parentId}_${studentId}_${normalizedSubject}`);
            batch.set(docRef, { ...overview, parentId }, { merge: true });
        }
        await batch.commit();

        logger.db(`[PARENT_AGG] Updated subject overview: ${normalizedSubject}`);
    } catch (e) {
        logger.error('STATE', '[PARENT_AGG] Failed to update subject overview', e);
    }
};

/**
 * Update Subject Progress Report (Screen 3 data)
 * Triggered after concept mastery changes
 */
export const updateSubjectProgressReport = async (
    studentId: string,
    subject: string,
    parentIds?: string[]
) => {
    try {
        let parents = parentIds || await getParentIdsForStudent(studentId);
        if (parents.length === 0) {
            logger.db('[PARENT_AGG] No parent relationships found, using studentId as fallback parentId');
            parents = [studentId];
        }

        const normalizedSubject = normalizeSubjectName(subject);

        // Fetch all atoms for subject (from local_atoms via subject health)
        const healthDoc = await db.collection('student_decisions')
            .doc(studentId)
            .collection('subjects')
            .doc(normalizedSubject)
            .get();

        if (!healthDoc.exists) {
            logger.db(`[PARENT_AGG] No health data for ${normalizedSubject}, skipping progress report`);
            return;
        }

        const healthData = healthDoc.data();
        const masteryStats = await getStudentMasteryStats(studentId);

        // Calculate structural coverage
        const totalConcepts = healthData?.totalAtoms || 0;
        const masteryMap = new Map(masteryStats.map(s => [s.atomId, s.masteryPct]));

        // Count mastered (>= 80%), covered (attempted), pending (not attempted)
        let masteredConcepts = 0;
        let coveredConcepts = 0;

        // TODO: This needs access to atom list - placeholder logic
        coveredConcepts = masteryStats.length;
        masteredConcepts = masteryStats.filter(s => s.masteryPct >= 80).length;
        const pendingConcepts = Math.max(0, totalConcepts - coveredConcepts);

        // Calculate momentum (change in coverage over last 7 days)
        const recentMomentum = await calculateMomentum(studentId, normalizedSubject);

        // Compute Mastery Health
        const masteryHealth = computeMasteryHealth(masteryStats);

        // Build timeline (placeholder - needs file/chapter metadata)
        const timeline: ParentSubjectProgressReport['timeline'] = [];

        const report: ParentSubjectProgressReport = {
            parentId: parents[0],
            studentId,
            subject: normalizedSubject,
            lastUpdated: Date.now(),
            totalConcepts,
            coveredConcepts,
            masteredConcepts,
            pendingConcepts,
            recentMomentum,
            masteryHealth,
            timeline
        };

        // Write to Firestore
        const batch = db.batch();
        for (const parentId of parents) {
            const docRef = db.collection('parent_subject_progress_report')
                .doc(`${parentId}_${studentId}_${normalizedSubject}`);
            batch.set(docRef, { ...report, parentId }, { merge: true });
        }
        await batch.commit();

        logger.db(`[PARENT_AGG] Updated progress report: ${normalizedSubject}`);
    } catch (e) {
        logger.error('STATE', '[PARENT_AGG] Failed to update progress report', e);
    }
};

// ==================== COMPUTATION HELPERS ====================
// All functions are PURE and DETERMINISTIC

function computeEffortSignal(events: any[]): 'Improving' | 'Steady' | 'Light' {
    if (events.length === 0) return 'Light';

    // Count quizzes in last 7 days
    const quizCount = events.filter(e =>
        e.eventType === 'quiz_completed' || e.eventType === 'quiz_v2_completed'
    ).length;

    if (quizCount >= 5) return 'Improving';
    if (quizCount >= 2) return 'Steady';
    return 'Light';
}

function computeUnderstandingSignal(masteryStats: any[]): 'Settling' | 'Steady' | 'Developing' {
    if (masteryStats.length === 0) return 'Developing';

    const avgMastery = masteryStats.reduce((sum, s) => sum + s.masteryPct, 0) / masteryStats.length;

    if (avgMastery >= 75) return 'Settling';
    if (avgMastery >= 50) return 'Steady';
    return 'Developing';
}

function computeFocusSignal(events: any[]): 'Stable' | 'Variable' {
    if (events.length === 0) return 'Variable';

    // Check consistency of session times
    const sessionDates = events.map(e => new Date(e.timestamp).toDateString());
    const uniqueDays = new Set(sessionDates).size;

    return uniqueDays >= 4 ? 'Stable' : 'Variable';
}

function computeRecoverySignal(events: any[]): 'Strong' | 'Steady' | 'Building' {
    // Look for retry patterns after failures
    const quizEvents = events.filter(e => e.eventType === 'quiz_completed' || e.eventType === 'quiz_v2_completed');

    if (quizEvents.length === 0) return 'Building';

    // Simple heuristic: if recent scores improving
    const recentScores = quizEvents.slice(-3).map(e => {
        const { score = 0, total = 1 } = e.payload || {};
        return score / total;
    });

    if (recentScores.length >= 2 && recentScores[recentScores.length - 1] > recentScores[0]) {
        return 'Strong';
    }

    return 'Steady';
}

function computeOverallHealth(
    effort: string,
    understanding: string,
    focus: string,
    recovery: string
): 'Strong' | 'Stable' | 'Needs Support' {
    const score =
        (effort === 'Improving' ? 3 : effort === 'Steady' ? 2 : 1) +
        (understanding === 'Settling' ? 3 : understanding === 'Steady' ? 2 : 1) +
        (focus === 'Stable' ? 2 : 1) +
        (recovery === 'Strong' ? 3 : recovery === 'Steady' ? 2 : 1);

    if (score >= 10) return 'Strong';
    if (score >= 7) return 'Stable';
    return 'Needs Support';
}

function generateHealthReason(
    health: string,
    effort: string,
    understanding: string
): string {
    if (health === 'Strong') {
        return 'Your child is learning steadily and responding well to challenges.';
    }
    if (health === 'Stable') {
        return 'Learning is progressing at a healthy pace with consistent engagement.';
    }
    return 'Your child may benefit from additional encouragement and support.';
}

function computeStabilityTrend(events: any[]): Array<{ t: number; v: number }> {
    // Create 7-day buckets - opaque engagement signals
    const trend: Array<{ t: number; v: number }> = [];
    const now = Date.now();

    for (let i = 6; i >= 0; i--) {
        const dayStart = now - (i * 24 * 60 * 60 * 1000);
        const dayEnd = dayStart + (24 * 60 * 60 * 1000);

        const dayEvents = events.filter(e => {
            const t = new Date(e.timestamp).getTime();
            return t >= dayStart && t < dayEnd;
        });

        // Opaque value - NOT normalized, NOT a percentage
        // Just raw event count as signal
        trend.push({ t: dayStart, v: dayEvents.length });
    }

    return trend;
}

function generateSupportStance(health: string, effort: string): string {
    if (health === 'Needs Support') {
        return 'Encourage effort and persistence. Avoid focusing on results.';
    }
    if (effort === 'Light') {
        return 'Acknowledge persistence and consistency.';
    }
    return 'Celebrate effort, not outcomes.';
}

function computeLearningState(
    events: any[],
    stats: any[]
): ParentSubjectOverview['learningState'] {
    const avgMastery = stats.length > 0
        ? stats.reduce((sum, s) => sum + s.masteryPct, 0) / stats.length
        : 0;

    const activityCount = events.length;

    if (avgMastery >= 70 && activityCount >= 3) return 'Stable & Progressing';
    if (avgMastery >= 50 && activityCount >= 3) return 'Effortful but Steady';
    if (activityCount >= 2) return 'Temporarily Challenging';
    return 'Light Engagement';
}

function computeSubjectEffort(events: any[]): 'High' | 'Medium' | 'Light' | undefined {
    if (events.length >= 5) return 'High';
    if (events.length >= 2) return 'Medium';
    if (events.length >= 1) return 'Light';
    return undefined;
}

function computeSubjectUnderstanding(stats: any[]): 'Settling' | 'Developing' | 'Exploring' | undefined {
    if (stats.length === 0) return undefined;

    const avg = stats.reduce((sum, s) => sum + s.masteryPct, 0) / stats.length;

    if (avg >= 75) return 'Settling';
    if (avg >= 50) return 'Developing';
    return 'Exploring';
}

function computeSubjectFocus(events: any[]): 'Stable' | 'Variable' | undefined {
    if (events.length === 0) return undefined;

    const days = new Set(events.map(e => new Date(e.timestamp).toDateString())).size;
    return days >= 3 ? 'Stable' : 'Variable';
}

function generateSubjectSupportStance(state: string): string {
    switch (state) {
        case 'Stable & Progressing':
            return 'Encourage effort, not outcomes.';
        case 'Effortful but Steady':
            return 'Normalize difficulty and be patient.';
        case 'Temporarily Challenging':
            return 'Give space — confidence is building.';
        case 'Light Engagement':
            return 'Acknowledge persistence and consistency.';
        default:
            return 'Support their learning journey.';
    }
}

function computeMasteryHealth(stats: any[]): 'Strong' | 'Stable' | 'Fragile' {
    if (stats.length === 0) return 'Fragile';

    const avg = stats.reduce((sum, s) => sum + s.masteryPct, 0) / stats.length;

    if (avg >= 75) return 'Strong';
    if (avg >= 50) return 'Stable';
    return 'Fragile';
}

async function calculateMomentum(studentId: string, subject: string): Promise<'Rising' | 'Stable' | 'Slowing'> {
    // Compare coverage now vs 7 days ago
    try {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentEvents = await db.collection('telemetry_events')
            .where('studentId', '==', studentId)
            .where('timestamp', '>=', new Date(sevenDaysAgo).toISOString())
            .get();

        const events = recentEvents.docs.map(d => d.data());
        const subjectEvents = events.filter(e =>
            normalizeSubjectName(e.payload?.metadata?.subject || '') === subject
        );

        // Categorize based on event trend
        if (subjectEvents.length >= 5) return 'Rising';
        if (subjectEvents.length >= 2) return 'Stable';
        return 'Slowing';
    } catch (e) {
        return 'Stable';
    }
}
