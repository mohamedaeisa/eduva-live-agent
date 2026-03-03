
import { db } from './firebaseConfig';
import {
    SubjectHealthState, GrowthMirrorDelta, StudentAtomSummary
} from '../types';
import { logger } from '../utils/logger';


import { RadarRecommendationHistoryItem } from '../types/radar';

export interface RadarSignals {
    subjects: SubjectHealthState[];
    recentGrowth: GrowthMirrorDelta | null;
    preferences: any; // UserPreferences
    history: RadarRecommendationHistoryItem[]; // Stage 7.4.2: Input for Effectiveness Weighting
}

/**
 * PHASE 2: Signal Readers
 * Responsibility: Efficiently fetch the "Truth" for the Strategy Engine.
 * Rules:
 * - NO heavy atom reads here.
 * - Only aggregated states.
 */
export const getAggregatedState = async (studentId: string): Promise<RadarSignals> => {
    try {
        // 1. Fetch Growth Mirror Delta (The "Confidence" Signal)
        // using the WEEK period as standard
        const growthPromise = db.collection('student_growth_mirror_delta')
            .doc(`${studentId}_WEEK`)
            .get();

        // 2. Fetch All Subject Health Decisions (The "Competence" Signal)
        const subjectsPromise = db.collection('student_decisions')
            .doc(studentId)
            .collection('subjects')
            .get();

        // 3. Fetch User Preferences (for context/grade)
        const userPromise = db.collection('users').doc(studentId).get();

        // 4. Fetch Strategy History (Stage 7.4.2)
        // Needed for "Effectiveness Weighting"
        const historyPromise = db.collection('student_recommendation_history')
            .where('studentId', '==', studentId)
            .orderBy('takenAt', 'desc')
            .limit(20) // sufficient context for weighing recent trends
            .get();

        const [growthSnap, subjectsSnap, userSnap, historySnap] = await Promise.all([
            growthPromise,
            subjectsPromise,
            userPromise,
            historyPromise
        ]);

        const subjects = subjectsSnap.docs.map(d => d.data() as SubjectHealthState);
        const recentGrowth = growthSnap.exists ? (growthSnap.data() as GrowthMirrorDelta) : null;
        const preferences = userSnap.exists ? userSnap.data()?.preferences : null;
        const history = historySnap.docs.map(d => d.data() as RadarRecommendationHistoryItem);

        return { subjects, recentGrowth, preferences, history };

    } catch (e: any) {
        logger.error('STATE', `[RADAR_READ_FAIL] Failed to fetch signals: ${e.message}`);
        // Return empty state safe for Strategy Engine to handle (will trigger Onboarding/Fallback)
        return { subjects: [], recentGrowth: null, preferences: null, history: [] };
    }
};

/**
 * SCOPED ATOM QUERIES
 * Only called AFTER strategy is decided.
 */

// RECOVERY: Find atoms with LOW mastery (< 50%) or marked as RISK
export const findRecoveryCandidates = async (studentId: string, subjectId: string, limit: number = 3): Promise<StudentAtomSummary[]> => {
    try {
        // Priority 1: Risk Status
        let q = db.collection('student_atom_summary')
            .where('studentId', '==', studentId)
            .where('subject', '==', subjectId) // Ensure atom summary has 'subject' field
            .where('masteryPct', '<', 50)
            .orderBy('masteryPct', 'asc') // Worst first
            .limit(limit);

        const snap = await q.get();
        return snap.docs.map(d => d.data() as StudentAtomSummary);
    } catch (e) {
        logger.error('STATE', `[RADAR_ATOM_READ] Recovery fetch failed`, e);
        return [];
    }
};

// BUILD: Find atoms with GOOD mastery (>= 50% & < 80%) ready for application
export const findBuildCandidates = async (studentId: string, subjectId: string, limit: number = 3): Promise<StudentAtomSummary[]> => {
    try {
        const snap = await db.collection('student_atom_summary')
            .where('studentId', '==', studentId)
            .where('subject', '==', subjectId)
            .where('masteryPct', '>=', 50)
            .where('masteryPct', '<', 80)
            .orderBy('masteryPct', 'asc')
            .limit(limit)
            .get();
        return snap.docs.map(d => d.data() as StudentAtomSummary);
    } catch (e) { return []; }
};

// CHALLENGE: Find atoms with HIGH mastery (>= 80%)
export const findChallengeCandidates = async (studentId: string, limit: number = 2): Promise<StudentAtomSummary[]> => {
    try {
        // Across ALL subjects if possible, or we might need to filter by subject if query requires composite index
        // For now, let's assume valid composite index or simple query
        const snap = await db.collection('student_atom_summary')
            .where('studentId', '==', studentId)
            .where('masteryPct', '>=', 80)
            .orderBy('masteryPct', 'desc') // Best first
            .limit(limit)
            .get();
        return snap.docs.map(d => d.data() as StudentAtomSummary);
    } catch (e) { return []; }
};
