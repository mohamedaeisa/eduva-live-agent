/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Learning Intelligence System — Guards & Validation
 * 
 * Three critical guards for data integrity:
 * 1. Active Time Cap — prevents distraction inflation
 * 2. Idempotency Key — prevents duplicate event processing
 * 3. Validation — ensures all values in valid ranges
 */

// crypto import removed for browser compatibility
import {
    MAX_ACTIVE_TIME_PER_ATTEMPT_SEC,
    IDEMPOTENCY_BUCKET_MS,
    FLUENCY_FLOOR,
    FLUENCY_CEILING,
    MASTERY_FLOOR,
} from './constants';

import type { AtomSignals, SubjectHealth } from './types';

// ==================== GUARD 1: ACTIVE TIME CAP ====================

/**
 * Caps active time per attempt to prevent inflation from:
 * - Tab left open
 * - Device sleep
 * - Extended distraction
 * 
 * @param reportedTimeSec - Time reported by client (seconds)
 * @returns Capped time (max 180 seconds = 3 minutes)
 * 
 * Implementation point: Apply at telemetry ingestion, NOT at aggregation
 */
export function capActiveTime(reportedTimeSec: number): number {
    return Math.min(reportedTimeSec, MAX_ACTIVE_TIME_PER_ATTEMPT_SEC);
}

/**
 * Checks if time was capped (for logging/analytics)
 */
export function wasTimeCapped(reportedTimeSec: number): boolean {
    return reportedTimeSec > MAX_ACTIVE_TIME_PER_ATTEMPT_SEC;
}

// ==================== GUARD 2: IDEMPOTENCY KEY ====================

/**
 * Generates deterministic idempotency key to prevent duplicate processing.
 * 
 * Same inputs = same key = skip if already processed.
 * 
 * @param studentId - Student ID
 * @param atomId - Atom ID
 * @param attemptIndex - Attempt number (from client)
 * @param timestamp - Event timestamp (milliseconds)
 * @returns SHA-256 hash as hex string
 */
export function generateIdempotencyKey(
    studentId: string,
    atomId: string,
    attemptIndex: number,
    timestamp: number
): string {
    const bucketed = bucketTimestamp(timestamp);
    const raw = `${studentId}:${atomId}:${attemptIndex}:${bucketed}`;

    // Browser-safe deterministic hash (non-cryptographic but collision-resistant for small sets)
    // Replaces Node.js crypto.createHash('sha256') which breaks in browser builds
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < raw.length; i++) {
        ch = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'));
}

/**
 * Buckets timestamp to nearest minute.
 * 
 * Prevents same answer submitted at :00 and :01 being treated as different.
 * 
 * @param timestamp - Timestamp in milliseconds
 * @returns Bucketed timestamp (floored to minute)
 */
export function bucketTimestamp(timestamp: number): number {
    return Math.floor(timestamp / IDEMPOTENCY_BUCKET_MS) * IDEMPOTENCY_BUCKET_MS;
}

// ==================== GUARD 3: VALIDATION ====================

/**
 * Validates AtomSignals are in correct ranges.
 * 
 * Throws error if validation fails.
 * 
 * @param signals - AtomSignals to validate
 * @throws Error if any value is out of range
 */
export function validateAtomSignals(signals: AtomSignals): void {
    // Knowledge: 0-1
    if (signals.knowledge < 0 || signals.knowledge > 1) {
        throw new Error(
            `Invalid knowledge: ${signals.knowledge}. Must be 0-1.`
        );
    }

    // Fluency: 0.6-1.2
    if (signals.fluency < FLUENCY_FLOOR || signals.fluency > FLUENCY_CEILING) {
        throw new Error(
            `Invalid fluency: ${signals.fluency}. Must be ${FLUENCY_FLOOR}-${FLUENCY_CEILING}.`
        );
    }

    // Depth: 0-1
    if (signals.depth < 0 || signals.depth > 1) {
        throw new Error(
            `Invalid depth: ${signals.depth}. Must be 0-1.`
        );
    }

    // Mastery: 30-100 (floor enforced)
    if (signals.mastery < (MASTERY_FLOOR * 100) || signals.mastery > 100) {
        throw new Error(
            `Invalid mastery: ${signals.mastery}. Must be ${MASTERY_FLOOR * 100}-100.`
        );
    }

    // Stability: 0-1
    if (signals.stability < 0 || signals.stability > 1) {
        throw new Error(
            `Invalid stability: ${signals.stability}. Must be 0-1.`
        );
    }

    // Attempts: non-negative
    if (signals.attempts < 0) {
        throw new Error(
            `Invalid attempts: ${signals.attempts}. Must be non-negative.`
        );
    }

    // Correct count: <= attempts
    if (signals.correctCount > signals.attempts) {
        throw new Error(
            `Invalid correctCount: ${signals.correctCount} > attempts ${signals.attempts}.`
        );
    }

    // Total time: non-negative
    if (signals.totalActiveTimeSec < 0) {
        throw new Error(
            `Invalid totalActiveTimeSec: ${signals.totalActiveTimeSec}. Must be non-negative.`
        );
    }
}

/**
 * Validates SubjectHealth is in correct ranges.
 * 
 * Throws error if validation fails.
 * 
 * @param health - SubjectHealth to validate
 * @throws Error if any value is out of range
 */
export function validateSubjectHealth(health: SubjectHealth): void {
    // Subject mastery: 0-100
    if (health.subjectMastery < 0 || health.subjectMastery > 100) {
        throw new Error(
            `Invalid subjectMastery: ${health.subjectMastery}. Must be 0-100.`
        );
    }

    // Coverage: 0-100
    if (health.coverage < 0 || health.coverage > 100) {
        throw new Error(
            `Invalid coverage: ${health.coverage}. Must be 0-100.`
        );
    }

    // Stability: 0-1
    if (health.stability < 0 || health.stability > 1) {
        throw new Error(
            `Invalid stability: ${health.stability}. Must be 0-1.`
        );
    }

    // Health: 0-100
    if (health.health < 0 || health.health > 100) {
        throw new Error(
            `Invalid health: ${health.health}. Must be 0-100.`
        );
    }

    // Total atoms: non-negative
    if (health.totalAtoms < 0) {
        throw new Error(
            `Invalid totalAtoms: ${health.totalAtoms}. Must be non-negative.`
        );
    }

    // Mastered <= Total
    if (health.masteredAtoms > health.totalAtoms) {
        throw new Error(
            `Invalid masteredAtoms: ${health.masteredAtoms} > totalAtoms ${health.totalAtoms}.`
        );
    }

    // Weak <= Total
    if (health.weakAtoms > health.totalAtoms) {
        throw new Error(
            `Invalid weakAtoms: ${health.weakAtoms} > totalAtoms ${health.totalAtoms}.`
        );
    }
}

/**
 * Safe wrapper for validation — logs instead of throwing in production.
 * 
 * @param signals - AtomSignals to validate
 * @param logger - Logger function (optional)
 * @returns true if valid, false if invalid
 */
export function safeValidateAtomSignals(
    signals: AtomSignals,
    logger?: (msg: string) => void
): boolean {
    try {
        validateAtomSignals(signals);
        return true;
    } catch (error) {
        if (logger) {
            logger(`[LIS_VALIDATION_ERROR] ${(error as Error).message}`);
        } else {
            console.error('[LIS_VALIDATION_ERROR]', error);
        }
        return false;
    }
}

/**
 * Safe wrapper for subject health validation.
 */
export function safeValidateSubjectHealth(
    health: SubjectHealth,
    logger?: (msg: string) => void
): boolean {
    try {
        validateSubjectHealth(health);
        return true;
    } catch (error) {
        if (logger) {
            logger(`[LIS_VALIDATION_ERROR] ${(error as Error).message}`);
        } else {
            console.error('[LIS_VALIDATION_ERROR]', error);
        }
        return false;
    }
}
