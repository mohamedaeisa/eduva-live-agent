/**
 * LIS Snapshot Reader Service
 * 
 * PURPOSE: Provide read-only access to LIS snapshots for UI.
 * 
 * ⚠️ NO CALCULATIONS — only data fetching
 * ⚠️ UI reads from here, never from raw collections
 */

import { db } from './firebaseConfig';
import type { CompassSnapshot, GrowthTimeline, ParentSignals } from './lis/types';

// ==================== COMPASS SNAPSHOT ====================

/**
 * Fetches precomputed Compass snapshot for a subject.
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID (normalized)
 * @returns Compass snapshot or null if not found
 */
export async function getCompassSnapshot(
    studentId: string,
    subjectId: string
): Promise<CompassSnapshot | null> {
    const docId = `${studentId}_${subjectId}`;
    const doc = await db.collection('student_compass_snapshots').doc(docId).get();

    if (!doc.exists) {
        console.warn(`[LIS_READ] No compass snapshot found for ${subjectId}. Returning zero-state.`);
        // ✅ UI STABILITY FIX: Return zero-state instead of null to prevent unmounts
        return createInitialSnapshot(studentId, subjectId);
    }

    return doc.data() as CompassSnapshot;
}

/**
 * Fetches ALL Compass snapshots for a student (for dashboard/hub view).
 * 
 * @param studentId - Student ID
 * @returns Array of Compass snapshots
 */
export async function getAllCompassSnapshots(
    studentId: string
): Promise<CompassSnapshot[]> {
    try {
        const query = await db.collection('student_compass_snapshots')
            .where('studentId', '==', studentId)
            .get();

        if (query.empty) return [];

        return query.docs.map(doc => doc.data() as CompassSnapshot);
    } catch (e) {
        console.error(`[LIS_READ] Failed to fetch all snapshots for ${studentId}`, e);
        return [];
    }
}

// ==================== GROWTH TIMELINE ====================

/**
 * Fetches growth timeline for a subject.
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID (normalized)
 * @returns Growth timeline or null if not found
 */
export async function getGrowthTimeline(
    studentId: string,
    subjectId: string
): Promise<GrowthTimeline | null> {
    const docId = `${studentId}_${subjectId}`;
    const doc = await db.collection('student_growth_timeline').doc(docId).get();

    if (!doc.exists) {
        console.warn(`[LIS_READ] No growth timeline found for ${subjectId}`);
        return null;
    }

    return doc.data() as GrowthTimeline;
}

// ==================== PARENT SIGNALS ====================

/**
 * Fetches parent signals for a student.
 * 
 * @param parentId - Parent ID
 * @returns Parent signals or null if not found
 */
export async function getParentSignals(
    parentId: string
): Promise<ParentSignals | null> {
    const doc = await db.collection('parent_signals').doc(parentId).get();

    if (!doc.exists) {
        console.warn(`[LIS_READ] No parent signals found for ${parentId}`);
        return null;
    }

    return doc.data() as ParentSignals;
}

// ==================== HELPER: SUBJECT NORMALIZATION ====================

/**
 * Normalizes subject name to match LIS format.
 * 
 * @param subject - Raw subject name
 * @returns Normalized subject ID
 */
export function normalizeSubject(subject: string): string {
    return subject.toLowerCase().trim().replace(/\s+/g, '_');
}

// ==================== ZERO-STATE FACTORY ====================

function createInitialSnapshot(studentId: string, subjectId: string): CompassSnapshot {
    return {
        studentId,
        subjectId,
        snapshotId: 'init',
        generatedAt: Date.now(),
        contentCoverage: 0,
        learningProgress: 0,
        healthScore: 0,
        healthStatus: 'GOOD', // Default optimistically
        trendClassification: 'stable',
        totalStudyTimeSec: 0,
        totalAtoms: 0,
        masteredAtoms: 0,
        weakAtoms: 0,
        materials: [],
        weakClusters: [],
        radarSignals: [],
        recentLearningSignals: [],
        recommendedAction: {
            type: 'EXPAND',
            label: 'Start Exploration',
            atomIds: [],
            rationale: 'No data yet - start with any topic.'
        },
        schemaVersion: '2.1.1'
    };
}
