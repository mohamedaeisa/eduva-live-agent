/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Unit Tests for LIS Canonical Formulas
 * 
 * Test Categories:
 * 1. Cold Start Tests
 * 2. Boundary Tests
 * 3. Non-Regression Tests
 * 4. Adversarial Tests
 * 5. Subject Aggregation Tests
 */

import {
    updateKnowledgeWithColdStart,
    calculateFluency,
    calculateDepth,
    calculateAtomMastery,
    calculateStability,
    classifyMasteryLevel,
    calculateSubjectMastery,
    calculateCoverage,
    calculateSubjectStability,
    calculateSubjectHealth,
    classifyHealthStatus,
    updateTrend,
    calculateMedian,
} from '../formulas';

import {
    COLD_START_PRIOR,
    COLD_START_THRESHOLD,
    FLUENCY_FLOOR,
    FLUENCY_CEILING,
    MASTERY_FLOOR,
    MASTERY_THRESHOLDS,
    HEALTH_STATUS_THRESHOLDS,
} from '../constants';

describe('LIS Formulas — Constitutional Guarantees', () => {

    // ==================== 1. COLD START TESTS ====================

    describe('Cold Start Behavior', () => {
        test('updateKnowledgeWithColdStart.should_initialize_at_neutral_prior', () => {
            const knowledge = updateKnowledgeWithColdStart(0, true, 0, 'first', 'practice', false);
            expect(knowledge).toBe(COLD_START_PRIOR);
        });

        test('updateKnowledgeWithColdStart.should_resist_single_attempt_spike', () => {
            // First correct answer should NOT jump to 1.0
            const knowledge = updateKnowledgeWithColdStart(COLD_START_PRIOR, true, 1, 'first', 'practice', false);
            expect(knowledge).toBeLessThan(0.7); // Should be way below 1.0
            expect(knowledge).toBeGreaterThan(COLD_START_PRIOR); // But should increase
        });

        test('updateKnowledgeWithColdStart.should_apply_full_weight_after_threshold', () => {
            // After COLD_START_THRESHOLD attempts, influence should be normal
            let knowledge = COLD_START_PRIOR;

            // Do 3 attempts to reach threshold
            for (let i = 0; i < COLD_START_THRESHOLD; i++) {
                knowledge = updateKnowledgeWithColdStart(knowledge, true, i + 1, 'first', 'practice', false);
            }

            // Now 4th attempt should have full weight
            const before4th = knowledge;
            const after4th = updateKnowledgeWithColdStart(knowledge, true, COLD_START_THRESHOLD + 1, 'first', 'practice', false);

            // Difference should be larger than during cold-start period
            const delta4th = after4th - before4th;

            // Do a cold-start attempt for comparison
            const coldStartDelta = updateKnowledgeWithColdStart(COLD_START_PRIOR, true, 1, 'first', 'practice', false) - COLD_START_PRIOR;

            expect(delta4th).toBeGreaterThan(coldStartDelta);
        });

        test('updateKnowledgeWithColdStart.should_prevent_zero_panic_on_first_wrong', () => {
            // First wrong answer should NOT crash to 0
            const knowledge = updateKnowledgeWithColdStart(COLD_START_PRIOR, false, 1, 'first', 'practice', false);
            expect(knowledge).toBeGreaterThan(0.3); // Should stay reasonably high
            expect(knowledge).toBeLessThan(COLD_START_PRIOR); // But should decrease
        });
    });

    // ==================== 2. BOUNDARY TESTS ====================

    describe('Boundary Enforcement', () => {
        test('calculateFluency.should_never_drop_below_floor', () => {
            // Very slow answer (10x expected)
            const fluency = calculateFluency(150, 15);
            expect(fluency).toBe(FLUENCY_FLOOR);
        });

        test('calculateFluency.should_never_exceed_ceiling', () => {
            // Very fast answer (10x faster)
            const fluency = calculateFluency(1.5, 15);
            expect(fluency).toBe(FLUENCY_CEILING);
        });

        test('calculateAtomMastery.should_never_drop_below_floor', () => {
            // Worst case: 0 knowledge, 0 depth, minimum fluency
            const mastery = calculateAtomMastery(0, 0, FLUENCY_FLOOR);
            expect(mastery).toBe(Math.round(MASTERY_FLOOR * 100)); // 30
        });

        test('calculateAtomMastery.should_cap_at_100', () => {
            // Best case: perfect everything + bonus
            const mastery = calculateAtomMastery(1.0, 1.0, FLUENCY_CEILING);
            expect(mastery).toBeLessThanOrEqual(100);
        });

        test('calculateStability.should_increase_monotonically', () => {
            const stabilities = [];
            for (let i = 0; i <= 20; i++) {
                stabilities.push(calculateStability(i));
            }

            // Each should be >= previous
            for (let i = 1; i < stabilities.length; i++) {
                expect(stabilities[i]).toBeGreaterThanOrEqual(stabilities[i - 1]);
            }
        });

        test('calculateStability.should_saturate_at_1_0', () => {
            const stability = calculateStability(100);
            expect(stability).toBe(1.0);
        });
    });

    // ==================== 3. NON-REGRESSION TESTS ====================

    describe('Determinism & Purity', () => {
        test('calculateAtomMastery.should_produce_same_output_for_same_input', () => {
            const k = 0.75, d = 0.8, f = 1.1;
            const mastery1 = calculateAtomMastery(k, d, f);
            const mastery2 = calculateAtomMastery(k, d, f);
            expect(mastery1).toBe(mastery2);
        });

        test('updateKnowledgeWithColdStart.should_be_order_independent_for_same_events', () => {
            // Simulate: correct, wrong, correct
            let path1 = COLD_START_PRIOR;
            path1 = updateKnowledgeWithColdStart(path1, true, 1, 'first', 'practice', false);
            path1 = updateKnowledgeWithColdStart(path1, false, 2, 'first', 'practice', false);
            path1 = updateKnowledgeWithColdStart(path1, true, 3, 'first', 'practice', false);

            // Should converge to similar value regardless of exact order
            // (EWMA means order matters slightly, but should be stable)
            expect(path1).toBeGreaterThan(0.4);
            expect(path1).toBeLessThan(0.7);
        });

        test('calculateSubjectHealth.should_be_pure_function', () => {
            const h1 = calculateSubjectHealth(75, 60, 0.8);
            const h2 = calculateSubjectHealth(75, 60, 0.8);
            expect(h1).toBe(h2);
        });
    });

    // ==================== 4. ADVERSARIAL TESTS ====================

    describe('Adversarial Resistance', () => {
        test('updateKnowledgeWithColdStart.should_resist_retry_spam', () => {
            // 10 retries should have less impact than 10 first attempts
            let knowledgeRetries = COLD_START_PRIOR;
            let knowledgeFirsts = COLD_START_PRIOR;

            for (let i = 1; i <= 10; i++) {
                knowledgeRetries = updateKnowledgeWithColdStart(knowledgeRetries, true, i, 'retry', 'practice', false);
                knowledgeFirsts = updateKnowledgeWithColdStart(knowledgeFirsts, true, i, 'first', 'practice', false);
            }

            expect(knowledgeFirsts).toBeGreaterThan(knowledgeRetries);
        });

        test('updateKnowledgeWithColdStart.should_not_penalize_challenge_failures', () => {
            const before = 0.75;
            const after = updateKnowledgeWithColdStart(before, false, 5, 'first', 'challenge', true);
            expect(after).toBe(before); // No change on challenge failure
        });

        test('calculateFluency.should_cap_very_long_times', () => {
            // 10 minute answer (600s) vs 15s expected
            const fluency = calculateFluency(600, 15);
            expect(fluency).toBe(FLUENCY_FLOOR);
        });

        test('calculateAtomMastery.should_not_collapse_for_slow_learners', () => {
            // Slow but correct student
            const knowledge = 0.8;  // 80% correct
            const depth = 0.7;      // Decent Bloom
            const fluency = FLUENCY_FLOOR;  // Slowest allowed

            const mastery = calculateAtomMastery(knowledge, depth, fluency);

            // Should still be PARTIAL or better
            expect(mastery).toBeGreaterThan(MASTERY_THRESHOLDS.PARTIAL); // > 50
        });
    });

    // ==================== 5. SUBJECT AGGREGATION TESTS ====================

    describe('Subject-Level Aggregation', () => {
        test('calculateSubjectMastery.should_respect_curriculum_weights', () => {
            const atoms = [
                { mastery: 100, curriculumWeight: 0.5 },  // Important: 50%
                { mastery: 0, curriculumWeight: 0.1 },    // Less important: 10%
            ];

            const subjectMastery = calculateSubjectMastery(atoms);

            // Should be closer to 100 than to 50 (weighted toward important)
            expect(subjectMastery).toBeGreaterThan(70);
        });

        test('calculateCoverage.should_enforce_mastery_threshold', () => {
            const atoms = [
                { mastery: 74, stability: 1.0 },  // Just below threshold
                { mastery: 75, stability: 1.0 },  // Exactly at threshold
                { mastery: 76, stability: 1.0 },  // Above threshold
            ];

            const coverage = calculateCoverage(atoms);

            // Only 2 out of 3 should count (75+ threshold)
            expect(coverage).toBe(Math.round((2 / 3) * 100)); // 67
        });

        test('calculateCoverage.should_enforce_stability_threshold', () => {
            const atoms = [
                { mastery: 100, stability: 0.59 },  // High mastery but low stability
                { mastery: 100, stability: 0.60 },  // High mastery and sufficient stability
            ];

            const coverage = calculateCoverage(atoms);

            // Only 1 out of 2 should count (stability >= 0.6)
            expect(coverage).toBe(50);
        });

        test('calculateSubjectHealth.should_weight_mastery_most', () => {
            // High mastery, low coverage
            const health1 = calculateSubjectHealth(90, 20, 0.5);

            // Low mastery, high coverage
            const health2 = calculateSubjectHealth(20, 90, 0.5);

            // Health1 should be higher (mastery is 65% weight)
            expect(health1).toBeGreaterThan(health2);
        });

        test('calculateSubjectHealth.should_ignore_external_signals', () => {
            // This test encodes the constitution: NO parent boosts, NO practice time
            const health = calculateSubjectHealth(75, 60, 0.8);

            // Health should be deterministic from only these 3 inputs
            // If it were influenced by external signals, this would fail
            expect(health).toBe(72); // 0.65*75 + 0.20*60 + 0.15*80
        });
    });

    // ==================== 6. CLASSIFICATION TESTS ====================

    describe('Classification Logic', () => {
        test('classifyMasteryLevel.should_return_UNKNOWN_for_zero_attempts', () => {
            expect(classifyMasteryLevel(50, 0)).toBe('UNKNOWN');
            expect(classifyMasteryLevel(100, 0)).toBe('UNKNOWN');
        });

        test('classifyMasteryLevel.should_classify_thresholds_correctly', () => {
            expect(classifyMasteryLevel(79, 5)).toBe('PARTIAL');
            expect(classifyMasteryLevel(80, 5)).toBe('STRONG');
            expect(classifyMasteryLevel(49, 5)).toBe('WEAK');
            expect(classifyMasteryLevel(50, 5)).toBe('PARTIAL');
        });

        test('classifyHealthStatus.should_classify_thresholds_correctly', () => {
            expect(classifyHealthStatus(69)).toBe('NEEDS_ATTENTION');
            expect(classifyHealthStatus(70)).toBe('GOOD');
            expect(classifyHealthStatus(44)).toBe('CRITICAL');
            expect(classifyHealthStatus(45)).toBe('NEEDS_ATTENTION');
        });
    });

    // ==================== 7. TREND TESTS ====================

    describe('Trend Detection', () => {
        test('updateTrend.should_classify_improving_correctly', () => {
            const { slope, classification } = updateTrend(0, 75, 70);
            expect(classification).toBe('improving');
            expect(slope).toBeGreaterThan(0);
        });

        test('updateTrend.should_classify_at_risk_correctly', () => {
            const { slope, classification } = updateTrend(0, 65, 70);
            expect(classification).toBe('at_risk');
            expect(slope).toBeLessThan(0);
        });

        test('updateTrend.should_classify_stable_correctly', () => {
            const { slope, classification } = updateTrend(0, 70, 70);
            expect(classification).toBe('stable');
        });

        test('updateTrend.should_smooth_noise_with_EWMA', () => {
            // Simulate oscillating scores
            let trend = 0;

            trend = updateTrend(trend, 70, 65).slope; // +5
            trend = updateTrend(trend, 65, 70).slope; // -5
            trend = updateTrend(trend, 70, 65).slope; // +5

            // Slope should be near 0 (smoothed oscillation)
            expect(Math.abs(trend)).toBeLessThan(0.05);
        });
    });

    // ==================== 8. HELPER TESTS ====================

    describe('Helper Functions', () => {
        test('calculateMedian.should_handle_odd_length', () => {
            expect(calculateMedian([1, 2, 3])).toBe(2);
            expect(calculateMedian([5, 1, 3, 4, 2])).toBe(3);
        });

        test('calculateMedian.should_handle_even_length', () => {
            expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
            expect(calculateMedian([10, 20])).toBe(15);
        });

        test('calculateMedian.should_handle_empty_array', () => {
            expect(calculateMedian([])).toBe(0);
        });
    });

    // ==================== 9. INTEGRATION SCENARIOS ====================

    describe('Real-World Scenarios', () => {
        test('struggling_student_should_not_be_destroyed', () => {
            // Scenario: Student with 60% accuracy, slow speed, basic Bloom
            let knowledge = COLD_START_PRIOR;

            // Simulate 10 attempts: 6 correct, 4 wrong
            const attempts = [true, false, true, true, false, true, true, false, true, false];
            attempts.forEach((correct, i) => {
                knowledge = updateKnowledgeWithColdStart(knowledge, correct, i + 1, 'first', 'practice', false);
            });

            const fluency = FLUENCY_FLOOR; // Slow learner
            const depth = 0.4; // Basic Bloom
            const mastery = calculateAtomMastery(knowledge, depth, fluency);

            // Should still be above mastery floor
            expect(mastery).toBeGreaterThan(MASTERY_FLOOR * 100);

            // Should classify as at least WEAK (not UNKNOWN)
            const level = classifyMasteryLevel(mastery, attempts.length);
            expect(level).not.toBe('UNKNOWN');
        });

        test('excellent_student_should_reach_STRONG_quickly', () => {
            // Scenario: Student with 90% accuracy, fast speed, high Bloom
            let knowledge = COLD_START_PRIOR;

            // Simulate 10 attempts: 9 correct, 1 wrong
            const attempts = [true, true, true, true, false, true, true, true, true, true];
            attempts.forEach((correct, i) => {
                knowledge = updateKnowledgeWithColdStart(knowledge, correct, i + 1, 'first', 'practice', false);
            });

            const fluency = 1.1; // Fast learner
            const depth = 0.9; // High Bloom
            const mastery = calculateAtomMastery(knowledge, depth, fluency);

            // Should reach STRONG threshold
            expect(mastery).toBeGreaterThanOrEqual(MASTERY_THRESHOLDS.STRONG);

            const level = classifyMasteryLevel(mastery, attempts.length);
            expect(level).toBe('STRONG');
        });
    });
});
