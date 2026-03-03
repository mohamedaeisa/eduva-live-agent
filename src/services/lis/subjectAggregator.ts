/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Subject Health Aggregator
 * 
 * PURPOSE: Aggregate atom-level signals into subject-level health.
 * 
 * ⚠️ ONLY USES FORMULAS FROM formulas.ts
 * ⚠️ MANDATORY SUBJECT FILTER — no cross-contamination
 */

import { db } from '../firebaseConfig';
import {
    calculateSubjectMastery,
    calculateCoverage,
    calculateSubjectStability,
    calculateSubjectHealth,
    classifyHealthStatus,
    updateTrend,
} from './formulas';

import { safeValidateSubjectHealth } from './guards';
import type { AtomSignals, SubjectHealth } from './types';
import { LIS_SCHEMA_VERSION, MASTERED_MASTERY_THRESHOLD, MASTERED_STABILITY_THRESHOLD } from './constants';

// ==================== SUBJECT HEALTH UPDATE ====================

/**
 * Updates subject health from all atom signals.
 * 
 * ⚠️ CRITICAL: Always filters by subject — no cross-contamination.
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID (normalized)
 */
export async function updateSubjectHealth(
    studentId: string,
    subjectId: string
): Promise<void> {
    // ========== FETCH ATOM SIGNALS (WITH SUBJECT FILTER) ==========

    const atomSignalsSnapshot = await db
        .collection('student_atom_signals')
        .where('studentId', '==', studentId)
        .where('subject', '==', subjectId)  // ⚠️ MANDATORY SUBJECT FILTER
        .get();

    if (atomSignalsSnapshot.empty) {
        console.log(`[LIS_SUBJECT] No atoms found for ${studentId}/${subjectId}`);
        return;
    }

    const atoms: AtomSignals[] = atomSignalsSnapshot.docs.map(doc => doc.data() as AtomSignals);

    console.log(`[LIS_SUBJECT] Processing ${atoms.length} atoms for ${subjectId}`);

    // ========== CALCULATE AGGREGATES (FORMULAS ONLY) ==========

    // 1. Subject Mastery (curriculum-weighted)
    // For now, equal weights — curriculum weights from global_atoms later
    const atomsWithWeights = atoms.map(a => ({
        mastery: a.mastery,
        curriculumWeight: 1.0, // TODO: Fetch from curriculum metadata
    }));

    const subjectMastery = calculateSubjectMastery(atomsWithWeights);

    // 2. Coverage (mastered atoms / total atoms)
    const coverage = calculateCoverage(
        atoms.map(a => ({
            mastery: a.mastery,
            stability: a.stability,
        }))
    );

    // 3. Subject Stability (average atom stability)
    const stability = calculateSubjectStability(
        atoms.map(a => ({ stability: a.stability }))
    );

    // 4. Subject Health (0.65M + 0.20C + 0.15S)
    const health = calculateSubjectHealth(subjectMastery, coverage, stability);

    // 5. Status classification
    const status = classifyHealthStatus(health);

    // ========== FETCH PREVIOUS HEALTH (FOR TREND) ==========

    const docId = `${studentId}_${subjectId}`;
    const docRef = db.collection('student_subject_health').doc(docId);
    const doc = await docRef.get();

    let previousHealth = health; // Default to current if no history
    let previousTrendSlope = 0;

    if (doc.exists) {
        const prev = doc.data() as SubjectHealth;
        previousHealth = prev.health;
        previousTrendSlope = prev.trendSlope || 0;
    }

    // 6. Trend (EWMA-based)
    const { slope: trendSlope, classification: trendClassification } = updateTrend(
        previousTrendSlope,
        health,
        previousHealth
    );

    // ========== COUNT ATOMS BY LEVEL ==========

    const totalAtoms = atoms.length;
    const masteredAtoms = atoms.filter(
        a => a.mastery >= MASTERED_MASTERY_THRESHOLD &&
            a.stability >= MASTERED_STABILITY_THRESHOLD
    ).length;

    const weakAtoms = atoms.filter(a => a.masteryLevel === 'WEAK').length;
    const unknownAtoms = atoms.filter(a => a.masteryLevel === 'UNKNOWN').length;

    // ========== CALCULATE TOTAL STUDY TIME ==========

    const totalStudyTimeSec = atoms.reduce((sum, a) => sum + a.totalActiveTimeSec, 0);

    // ========== BUILD SUBJECT HEALTH DOCUMENT ==========

    const subjectHealth: SubjectHealth = {
        studentId,
        subjectId,

        // The Three Aggregates
        subjectMastery,
        coverage,
        stability,

        // Derived
        health,
        status,

        // Trend
        trendSlope,
        trendClassification,

        // Stats
        totalAtoms,
        masteredAtoms,
        weakAtoms,
        unknownAtoms,

        // Study time (for analytics only, NOT for health)
        totalStudyTimeSec,

        // Timestamps
        lastEvaluatedAt: Date.now(),

        // Version
        schemaVersion: LIS_SCHEMA_VERSION,
    };

    // ========== VALIDATION ==========

    if (!safeValidateSubjectHealth(subjectHealth)) {
        console.error('[LIS_SUBJECT] Validation failed for subject health', {
            studentId,
            subjectId,
            subjectHealth,
        });
        return;
    }

    // ========== SAVE ==========

    await docRef.set(subjectHealth);

    console.log(`[LIS_SUBJECT] Subject health updated: ${subjectId}, health=${health}, trend=${trendClassification}`);

    // ========== TRIGGER SNAPSHOT BUILD ==========

    // Import lazy to avoid circular deps
    const { buildCompassSnapshot } = await import('./compassBuilder');
    await buildCompassSnapshot(studentId, subjectId);
}
