/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Unit Tests for LIS Guards
 */

import {
    capActiveTime,
    wasTimeCapped,
    generateIdempotencyKey,
    bucketTimestamp,
    validateAtomSignals,
    validateSubjectHealth,
    safeValidateAtomSignals,
    safeValidateSubjectHealth,
} from '../guards';

import {
    MAX_ACTIVE_TIME_PER_ATTEMPT_SEC,
    IDEMPOTENCY_BUCKET_MS,
} from '../constants';

import type { AtomSignals, SubjectHealth } from '../types';

describe('LIS Guards', () => {

    // ==================== GUARD 1: ACTIVE TIME CAP ====================

    describe('Active Time Cap', () => {
        test('capActiveTime.should_not_modify_reasonable_times', () => {
            expect(capActiveTime(10)).toBe(10);
            expect(capActiveTime(60)).toBe(60);
            expect(capActiveTime(120)).toBe(120);
        });

        test('capActiveTime.should_cap_at_maximum', () => {
            expect(capActiveTime(200)).toBe(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC);
            expect(capActiveTime(1000)).toBe(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC);
            expect(capActiveTime(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC)).toBe(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC);
        });

        test('wasTimeCapped.should_detect_capped_times', () => {
            expect(wasTimeCapped(60)).toBe(false);
            expect(wasTimeCapped(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC)).toBe(false);
            expect(wasTimeCapped(MAX_ACTIVE_TIME_PER_ATTEMPT_SEC + 1)).toBe(true);
            expect(wasTimeCapped(1000)).toBe(true);
        });
    });

    // ==================== GUARD 2: IDEMPOTENCY ====================

    describe('Idempotency Key Generation', () => {
        test('generateIdempotencyKey.should_be_deterministic', () => {
            const key1 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            const key2 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            expect(key1).toBe(key2);
        });

        test('generateIdempotencyKey.should_differ_for_different_students', () => {
            const key1 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            const key2 = generateIdempotencyKey('student2', 'atom1', 1, 1000000);
            expect(key1).not.toBe(key2);
        });

        test('generateIdempotencyKey.should_differ_for_different_atoms', () => {
            const key1 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            const key2 = generateIdempotencyKey('student1', 'atom2', 1, 1000000);
            expect(key1).not.toBe(key2);
        });

        test('generateIdempotencyKey.should_differ_for_different_attempts', () => {
            const key1 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            const key2 = generateIdempotencyKey('student1', 'atom1', 2, 1000000);
            expect(key1).not.toBe(key2);
        });

        test('generateIdempotencyKey.should_bucket_timestamps', () => {
            // Same bucket (within 1 minute)
            const key1 = generateIdempotencyKey('student1', 'atom1', 1, 1000000);
            const key2 = generateIdempotencyKey('student1', 'atom1', 1, 1000000 + 30000); // +30s
            expect(key1).toBe(key2); // Should be same (bucketed)

            // Different bucket (different minute)
            const key3 = generateIdempotencyKey('student1', 'atom1', 1, 1000000 + 61000); // +61s
            expect(key1).not.toBe(key3);
        });

        test('bucketTimestamp.should_floor_to_minute', () => {
            const minute = 60 * 1000;
            expect(bucketTimestamp(0)).toBe(0);
            expect(bucketTimestamp(30000)).toBe(0); // 30s → 0
            expect(bucketTimestamp(59999)).toBe(0); // 59.999s → 0
            expect(bucketTimestamp(60000)).toBe(minute); // 60s → 1 minute
            expect(bucketTimestamp(90000)).toBe(minute); // 90s → 1 minute
            expect(bucketTimestamp(120000)).toBe(2 * minute); // 120s → 2 minutes
        });
    });

    // ==================== GUARD 3: VALIDATION ====================

    describe('AtomSignals Validation', () => {
        const validAtomSignals: AtomSignals = {
            studentId: 'student1',
            atomId: 'atom1',
            subject: 'math',
            knowledge: 0.75,
            fluency: 1.0,
            depth: 0.8,
            mastery: 75,
            stability: 0.7,
            masteryLevel: 'PARTIAL',
            attempts: 5,
            correctCount: 4,
            firstAttemptTimes: [12, 15, 18],
            totalActiveTimeSec: 75,
            bloomHistory: [2, 3, 3],
            challengeAttempts: 0,
            challengeSuccesses: 0,
            lastTestedAt: Date.now(),
            updatedAt: Date.now(),
            schemaVersion: '2.1.1',
        };

        test('validateAtomSignals.should_accept_valid_signals', () => {
            expect(() => validateAtomSignals(validAtomSignals)).not.toThrow();
        });

        test('validateAtomSignals.should_reject_invalid_knowledge', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, knowledge: -0.1 })).toThrow('Invalid knowledge');
            expect(() => validateAtomSignals({ ...validAtomSignals, knowledge: 1.1 })).toThrow('Invalid knowledge');
        });

        test('validateAtomSignals.should_reject_invalid_fluency', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, fluency: 0.5 })).toThrow('Invalid fluency');
            expect(() => validateAtomSignals({ ...validAtomSignals, fluency: 1.3 })).toThrow('Invalid fluency');
        });

        test('validateAtomSignals.should_reject_invalid_depth', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, depth: -0.1 })).toThrow('Invalid depth');
            expect(() => validateAtomSignals({ ...validAtomSignals, depth: 1.1 })).toThrow('Invalid depth');
        });

        test('validateAtomSignals.should_reject_invalid_mastery', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, mastery: 29 })).toThrow('Invalid mastery');
            expect(() => validateAtomSignals({ ...validAtomSignals, mastery: 101 })).toThrow('Invalid mastery');
        });

        test('validateAtomSignals.should_reject_invalid_stability', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, stability: -0.1 })).toThrow('Invalid stability');
            expect(() => validateAtomSignals({ ...validAtomSignals, stability: 1.1 })).toThrow('Invalid stability');
        });

        test('validateAtomSignals.should_reject_negative_attempts', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, attempts: -1 })).toThrow('Invalid attempts');
        });

        test('validateAtomSignals.should_reject_correctCount_exceeding_attempts', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, correctCount: 10, attempts: 5 })).toThrow('Invalid correctCount');
        });

        test('validateAtomSignals.should_reject_negative_time', () => {
            expect(() => validateAtomSignals({ ...validAtomSignals, totalActiveTimeSec: -1 })).toThrow('Invalid totalActiveTimeSec');
        });

        test('safeValidateAtomSignals.should_return_true_for_valid', () => {
            expect(safeValidateAtomSignals(validAtomSignals)).toBe(true);
        });

        test('safeValidateAtomSignals.should_return_false_for_invalid', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation();
            const invalid = { ...validAtomSignals, knowledge: 2.0 };
            expect(safeValidateAtomSignals(invalid)).toBe(false);
            spy.mockRestore();
        });
    });

    describe('SubjectHealth Validation', () => {
        const validSubjectHealth: SubjectHealth = {
            studentId: 'student1',
            subjectId: 'math',
            subjectMastery: 75,
            coverage: 60,
            stability: 0.8,
            health: 72,
            status: 'GOOD',
            trendSlope: 0.01,
            trendClassification: 'improving',
            totalAtoms: 20,
            masteredAtoms: 12,
            weakAtoms: 3,
            unknownAtoms: 5,
            totalStudyTimeSec: 3600,
            lastEvaluatedAt: Date.now(),
            schemaVersion: '2.1.1',
        };

        test('validateSubjectHealth.should_accept_valid_health', () => {
            expect(() => validateSubjectHealth(validSubjectHealth)).not.toThrow();
        });

        test('validateSubjectHealth.should_reject_invalid_subjectMastery', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, subjectMastery: -1 })).toThrow('Invalid subjectMastery');
            expect(() => validateSubjectHealth({ ...validSubjectHealth, subjectMastery: 101 })).toThrow('Invalid subjectMastery');
        });

        test('validateSubjectHealth.should_reject_invalid_coverage', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, coverage: -1 })).toThrow('Invalid coverage');
            expect(() => validateSubjectHealth({ ...validSubjectHealth, coverage: 101 })).toThrow('Invalid coverage');
        });

        test('validateSubjectHealth.should_reject_invalid_stability', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, stability: -0.1 })).toThrow('Invalid stability');
            expect(() => validateSubjectHealth({ ...validSubjectHealth, stability: 1.1 })).toThrow('Invalid stability');
        });

        test('validateSubjectHealth.should_reject_invalid_health', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, health: -1 })).toThrow('Invalid health');
            expect(() => validateSubjectHealth({ ...validSubjectHealth, health: 101 })).toThrow('Invalid health');
        });

        test('validateSubjectHealth.should_reject_masteredAtoms_exceeding_totalAtoms', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, masteredAtoms: 25, totalAtoms: 20 })).toThrow('Invalid masteredAtoms');
        });

        test('validateSubjectHealth.should_reject_weakAtoms_exceeding_totalAtoms', () => {
            expect(() => validateSubjectHealth({ ...validSubjectHealth, weakAtoms: 25, totalAtoms: 20 })).toThrow('Invalid weakAtoms');
        });

        test('safeValidateSubjectHealth.should_return_true_for_valid', () => {
            expect(safeValidateSubjectHealth(validSubjectHealth)).toBe(true);
        });

        test('safeValidateSubjectHealth.should_return_false_for_invalid', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation();
            const invalid = { ...validSubjectHealth, health: 150 };
            expect(safeValidateSubjectHealth(invalid)).toBe(false);
            spy.mockRestore();
        });
    });
});
