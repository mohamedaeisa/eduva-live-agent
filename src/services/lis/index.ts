/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Learning Intelligence System — Public API
 * 
 * Single entry point for all LIS functionality.
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Canonical Formulas (LOCKED)
export {
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
} from './formulas';

// Guards
export {
    capActiveTime,
    wasTimeCapped,
    generateIdempotencyKey,
    bucketTimestamp,
    validateAtomSignals,
    validateSubjectHealth,
    safeValidateAtomSignals,
    safeValidateSubjectHealth,
} from './guards';
