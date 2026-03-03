
import { db } from './firebaseConfig';
import { getAggregatedState } from './radarSignalService';
import { detectAllStrategies, applySafetyRules } from './radarStrategyEngine';
import { buildRadarActions } from './radarActionFactory';
import { StudentRadarSnapshot, RadarAction, RadarStrategy } from '../types/radar';
import { logger } from '../utils/logger';

/**
 * PHASE 5: Radar Orchestrator
 * "The Rebuilder"
 * 
 * triggered by: DecisionService, GrowthService
 * Logic:
 * 1. Read Signals
 * 2. Resolve Strategy -> v2.2: Resolve Top 3 Strategies
 * 3. Build Actions -> v2.2: 1 Action per Strategy
 * 4. Replace Snapshot
 */

// COALESCING GUARD (Stage 7.4): Prevent duplicate rebuilds
const rebuildLocks = new Map<string, number>();

export const rebuildRadar = async (studentId: string): Promise<StudentRadarSnapshot | null> => {

    // 0. Soft Coalescing Check
    const now = Date.now();
    const lastRebuild = rebuildLocks.get(studentId) || 0;

    if (now - lastRebuild < 2000) {
        logger.orchestrator(`[RADAR_SKIPPED] Coalescing rebuild for ${studentId} (last: ${now - lastRebuild}ms ago)`);
        return null;
    }

    rebuildLocks.set(studentId, now);
    logger.orchestrator(`[RADAR_REBUILD] Starting snapshot rebuild for ${studentId}`);

    try {
        // 1. Read Truth
        const signals = await getAggregatedState(studentId);

        // 2. Resolve Logic (v2.2 Multi-Strategy)
        // Detect all candidates -> Apply Rules -> Sort -> Top 3
        const allCandidates = detectAllStrategies(signals);
        const safeCandidates = applySafetyRules(allCandidates).slice(0, 3);
        const topStrategy = safeCandidates[0];

        logger.orchestrator(`[RADAR_STRATEGY] Resolved Top ${safeCandidates.length}: ${safeCandidates.map(s => `${s.strategy}(${s.subjectId})`).join(', ')}`);

        // 3. Build Actions (1 per strategy)
        let allActions: RadarAction[] = [];

        for (const candidate of safeCandidates) {
            const actions = await buildRadarActions(candidate.strategy, studentId, candidate.subjectId, 1);
            if (actions.length > 0) {
                allActions.push(actions[0]); // Take the best action for this strategy
            }
        }

        // 4. Construct Snapshot
        // Primary Strategy = The strategy of the #1 action
        // (If safeCandidates exists but actions failed, fall back safely)

        if (allActions.length === 0 && safeCandidates.length > 0) {
            // Fallback: This shouldn't happen unless Factory fails to produce for a valid strategy
            logger.error('STATE', `[RADAR_WARN] Strategies found but no actions generated. Force ONBOARDING.`);
        }

        const snapshot: StudentRadarSnapshot = {
            studentId,
            updatedAt: Date.now(),
            schemaVersion: 1,
            strategyOfTheDay: topStrategy?.strategy || RadarStrategy.ONBOARDING, // Default safely
            actions: allActions
        };

        // 5. Atomic Replace
        const snapshotRef = db.collection('student_radar_snapshot').doc(studentId);

        logger.db(`[RADAR_WRITE] Writing snapshot to path: ${snapshotRef.path}`);

        await snapshotRef.set(snapshot);

        logger.orchestrator(`[RADAR_COMPLETE] Snapshot updated with ${allActions.length} actions.`);
        return snapshot;

    } catch (e: any) {
        logger.error('STATE', `[RADAR_CRITICAL_FAIL] Rebuild failed: ${e.message}`, e);
        return null;
    }
};
