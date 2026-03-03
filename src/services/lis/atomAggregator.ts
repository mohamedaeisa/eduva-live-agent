/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Atom Signal Aggregator
 * 
 * PURPOSE: Update atom-level signals from question results.
 * 
 * ⚠️ ONLY USES FORMULAS FROM formulas.ts — no local calculations
 * ⚠️ Pure aggregation — no product logic
 */

import { db } from '../firebaseConfig';
import {
    updateKnowledgeWithColdStart,
    calculateFluency,
    calculateDepth,
    calculateAtomMastery,
    calculateStability,
    classifyMasteryLevel,
    calculateMedian,
} from './formulas';

import { validateAtomSignals, safeValidateAtomSignals } from './guards';
import { normalizeSubjectName } from '../../utils/subjectUtils';
import type { AtomSignals } from './types';
import { LIS_SCHEMA_VERSION } from './constants';

// ==================== ATOM SIGNAL UPDATE ====================

export interface AtomUpdateInput {
    studentId: string;
    atomId: string;
    subject: string;
    isCorrect: boolean;
    activeTimeSec: number;
    bloomLevel: number;
    attemptType: 'first' | 'retry';
    mode: string;
    isChallenge: boolean;
}

/**
 * Updates atom signals for a single question result.
 * 
 * This is the PRIMARY aggregation function.
 * All atom-level updates flow through here.
 * 
 * @param input - Question result data
 */
export async function updateAtomSignals(input: AtomUpdateInput): Promise<void> {
    const normalizedSubject = normalizeSubjectName(input.subject);
    const docId = `${input.studentId}_${input.atomId}`;
    const docRef = db.collection('student_atom_signals').doc(docId);

    // Fetch existing signals (or create new)
    const doc = await docRef.get();
    let signals: AtomSignals;

    if (!doc.exists) {
        // Initialize new atom signals
        signals = createInitialAtomSignals(input.studentId, input.atomId, normalizedSubject);
    } else {
        signals = doc.data() as AtomSignals;
    }

    // ==================== UPDATE SIGNALS ====================

    // 1. Update Knowledge (EWMA with cold-start)
    signals.knowledge = updateKnowledgeWithColdStart(
        signals.knowledge,
        input.isCorrect,
        signals.attempts,
        input.attemptType,
        input.mode,
        input.isChallenge
    );

    // 2. Update history arrays
    signals.attempts += 1;
    if (input.isCorrect) {
        signals.correctCount += 1;
    }

    // Update time tracking
    signals.totalActiveTimeSec += input.activeTimeSec;

    // Track first attempt times (for personal baseline)
    if (input.attemptType === 'first') {
        signals.firstAttemptTimes.push(input.activeTimeSec);
        // Keep only last 10
        if (signals.firstAttemptTimes.length > 10) {
            signals.firstAttemptTimes = signals.firstAttemptTimes.slice(-10);
        }
    }

    // Track Bloom history
    signals.bloomHistory.push(input.bloomLevel);
    // Keep only last 20
    if (signals.bloomHistory.length > 20) {
        signals.bloomHistory = signals.bloomHistory.slice(-20);
    }

    // Challenge tracking (separate from main attempts)
    if (input.isChallenge) {
        signals.challengeAttempts += 1;
        if (input.isCorrect) {
            signals.challengeSuccesses += 1;
        }
    }

    // 3. Calculate Fluency (self-baseline)
    const avgActiveTime = signals.totalActiveTimeSec / signals.attempts;
    const medianFirstAttempt = calculateMedian(signals.firstAttemptTimes);
    signals.fluency = calculateFluency(avgActiveTime, medianFirstAttempt || avgActiveTime);

    // 4. Calculate Depth (Bloom weighted average)
    signals.depth = calculateDepth(signals.bloomHistory);

    // 5. Calculate Mastery (weighted sum)
    signals.mastery = calculateAtomMastery(
        signals.knowledge,
        signals.depth,
        signals.fluency
    );

    // 6. Calculate Stability (log-based confidence)
    signals.stability = calculateStability(signals.attempts);

    // 7. Classify mastery level
    signals.masteryLevel = classifyMasteryLevel(signals.mastery, signals.attempts);

    // Update timestamps
    signals.lastTestedAt = Date.now();
    signals.updatedAt = Date.now();

    // ==================== VALIDATION ====================

    if (!safeValidateAtomSignals(signals)) {
        console.error('[LIS_AGGREGATOR] Validation failed for atom signals', {
            studentId: input.studentId,
            atomId: input.atomId,
            signals,
        });
        // Don't save invalid data
        return;
    }

    // ==================== SAVE ====================

    await docRef.set(signals);

    console.log(`[LIS_AGGREGATOR] Atom signals updated: ${input.atomId}, mastery=${signals.mastery}, stability=${signals.stability.toFixed(2)}`);
}

// ==================== INITIALIZATION ====================

/**
 * Creates initial atom signals for a new atom.
 * 
 * All signals start at neutral values.
 */
function createInitialAtomSignals(
    studentId: string,
    atomId: string,
    subject: string
): AtomSignals {
    return {
        studentId,
        atomId,
        subject,

        // The Three Signals (initialized at neutral)
        knowledge: 0.5,      // Neutral prior (from COLD_START_PRIOR)
        fluency: 1.0,        // Neutral (no speed bonus/penalty)
        depth: 0.5,          // Neutral (average Bloom)

        // Derived (will be calculated on first update)
        mastery: 30,         // Floor value
        stability: 0,        // No confidence yet
        masteryLevel: 'UNKNOWN',

        // History
        attempts: 0,
        correctCount: 0,
        firstAttemptTimes: [],
        totalActiveTimeSec: 0,
        bloomHistory: [],

        // Challenge stats
        challengeAttempts: 0,
        challengeSuccesses: 0,

        // Timestamps
        lastTestedAt: Date.now(),
        updatedAt: Date.now(),

        // Version
        schemaVersion: LIS_SCHEMA_VERSION,
    };
}
