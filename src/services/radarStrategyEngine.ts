
import { RadarStrategy } from '../types/radar';
import { RadarSignals } from './radarSignalService';
import { SubjectHealthState } from '../types';

/**
 * PHASE 3: Strategy Engine
 * Pure Logic. No DB calls.
 * 
 * Rules:
 */
import { RadarRecommendationHistoryItem } from '../types/radar';
import { logger } from '../utils/logger';

export interface StrategySignal {
    strategy: RadarStrategy;
    subjectId?: string;
    score: number; // 0.0 to 1.0 (Higher is more urgent)
    reason?: string;
    // Debug metadata
    baseScore?: number;
    effectivenessMultiplier?: number;
    fatiguePenalty?: number;
    decayBoost?: number;
}

/**
 * STAGE 7.4.3: Strategy Fatigue
 * Checks how often this strategy was used in the last 5 cycles.
 */
const calculateFatiguePenalty = (strategy: RadarStrategy, history: RadarRecommendationHistoryItem[]): number => {
    if (!history || history.length === 0) return 1.0;

    // Window: Last 5 cycles only
    const recentWindow = history.slice(0, 5);
    const count = recentWindow.filter(h => h.strategy === strategy).length;

    if (count <= 1) return 1.0;
    if (count === 2) return 0.9;
    if (count === 3) return 0.75;
    return 0.6; // Cap at 0.6
};

/**
 * STAGE 7.4.3: Strategy Decay / Rotation
 * Context-aware boosts and penalties to encourage healthy rotation.
 */
const calculateDecayBoost = (strategy: RadarStrategy, history: RadarRecommendationHistoryItem[]): number => {
    if (!history || history.length === 0) return 1.0;

    const last3 = history.slice(0, 3);
    const last2 = history.slice(0, 2);

    // 5.1 RECOVERY -> BUILD (Positive Decay)
    if (strategy === RadarStrategy.RECOVERY) {
        const recoveryCount = last2.filter(h => h.strategy === RadarStrategy.RECOVERY).length;
        const improved = last2.some(h => h.strategy === RadarStrategy.RECOVERY && h.outcome === 'IMPROVED');
        // If taken 2 times recently AND improved -> Reduce priority to let BUILD rise
        if (recoveryCount >= 2 && improved) return 0.85;
    }

    // 5.2 BUILD -> MAINTAIN (Stabilization)
    if (strategy === RadarStrategy.BUILD) {
        const buildCount = last3.filter(h => h.strategy === RadarStrategy.BUILD).length;
        const mostlyNoChange = last3.filter(h => h.strategy === RadarStrategy.BUILD && h.outcome === 'NO_CHANGE').length >= 2;
        if (buildCount >= 3 && mostlyNoChange) return 0.8;
    }

    // 5.3 CHALLENGE -> Cooldown
    if (strategy === RadarStrategy.CHALLENGE) {
        const challengeTakenRecently = last2.some(h => h.strategy === RadarStrategy.CHALLENGE);
        if (challengeTakenRecently) return 0.7;
    }

    // 5.4 MAINTAIN -> BUILD (Re-engagement)
    // Rule: If MAINTAIN taken 3 times, Boost BUILD.
    if (strategy === RadarStrategy.BUILD) { // This boost applies TO 'BUILD'
        const maintainCount = last3.filter(h => h.strategy === RadarStrategy.MAINTAIN).length;
        if (maintainCount >= 3) return 1.1; // Boost BUILD to break out of maintain loop
    }

    return 1.0;
};

/**
 * STAGE 7.4.2: Strategy Effectiveness Weighting
 * Calculates a multiplier [0.5, 1.5] based on past outcomes.
 */
const calculateEffectivenessMultiplier = (strategy: RadarStrategy, history: RadarRecommendationHistoryItem[]): number => {
    if (!history || history.length === 0) return 1.0;

    // Filter relevant history for this strategy
    const attempts = history.filter(h => h.strategy === strategy);
    if (attempts.length === 0) return 1.0;

    let scoreSum = 0;
    attempts.forEach(h => {
        if (h.outcome === 'IMPROVED') scoreSum += 1.0;
        else if (h.outcome === 'NO_CHANGE') scoreSum += 0.2;
        else if (h.outcome === 'DECLINED') scoreSum += -0.7;
    });

    const effectivenessScore = scoreSum / attempts.length;

    // Clamp result: (score + 1) -> [0.5, 1.5]
    const multiplier = Math.max(0.5, Math.min(1.5, effectivenessScore + 1.0));
    return parseFloat(multiplier.toFixed(2));
};

/**
 * PHASE 6: Strategy Engine Extension (v2.2)
 * Detects ALL potential strategies and ranks them.
 */
export const detectAllStrategies = (signals: RadarSignals): StrategySignal[] => {
    const candidates: StrategySignal[] = [];
    const { subjects, recentGrowth, history } = signals; // Destructure history too

    // 1. ONBOARDING CHECK (Exclusive)
    if (!signals.subjects || signals.subjects.length === 0) {
        return [{ strategy: RadarStrategy.ONBOARDING, score: 1.0, reason: "No history found" }];
    }

    // 2. Iterate ALL subjects to find candidates
    subjects.forEach(subject => {
        // A. CRITICAL / RECOVERY (Score: 0.9)
        if (subject.overallStatus === 'CRITICAL' || subject.confidenceScore < 40) {
            candidates.push({
                strategy: RadarStrategy.RECOVERY,
                subjectId: subject.subjectId,
                score: 0.95 - (subject.confidenceScore / 1000), // Lower confidence = Higher score
                reason: "Critical status detected"
            });
            return; // Don't add other strategies for this subject
        }

        // B. FRAGILITY / RECOVERY (Score: 0.85)
        if (recentGrowth?.deltas.confidence === 'DOWN' &&
            recentGrowth.headlineKey?.toLowerCase() === subject.subjectId.toLowerCase()) {
            candidates.push({
                strategy: RadarStrategy.RECOVERY,
                subjectId: subject.subjectId,
                score: 0.85,
                reason: "Recent confidence drop"
            });
            return;
        }

        // C. CHALLENGE (Score: 0.7)
        // If status GOOD + Trending UP + No Fatigue
        const isFatigued = recentGrowth?.headlineKey === 'NEED_FOCUS';
        if (subject.overallStatus === 'GOOD' && !isFatigued) {
            if (subject.trend === 'UP' || subject.confidenceScore > 80) {
                candidates.push({
                    strategy: RadarStrategy.CHALLENGE,
                    subjectId: subject.subjectId,
                    score: 0.7 + (subject.confidenceScore / 1000), // Higher confidence = Higher score
                    reason: "Ready for next level"
                });
                return;
            }
        }

        // D. BUILD (Score: 0.6)
        // Default active state
        candidates.push({
            strategy: RadarStrategy.BUILD,
            subjectId: subject.subjectId,
            score: 0.6,
            reason: "Building foundation"
        });
    });

    // 3. MAINTAIN (Score: 0.3)
    // Add maintenance for good subjects not picked for Challenge? 
    // For now, let's keep it simple. If we have few candidates, we might add generic maintain.

    // 3. APPLY FULL INTELLIGENCE WEIGHTING (Stage 7.4.3)
    return candidates.map(c => {
        const baseScore = c.score;

        // A. Effectiveness (7.4.2)
        const multiplier = calculateEffectivenessMultiplier(c.strategy, history || []);

        // B. Fatigue (7.4.3)
        const fatigue = calculateFatiguePenalty(c.strategy, history || []);

        // C. Decay/Rotation (7.4.3)
        const decay = calculateDecayBoost(c.strategy, history || []);

        const finalScore = baseScore * multiplier * fatigue * decay;

        if (fatigue !== 1.0 || decay !== 1.0) {
            logger.orchestrator(`[RADAR_STRATEGY_DECAY] strategy=${c.strategy} fatigue=${fatigue} decayBoost=${decay}`);
        }

        logger.orchestrator(`[RADAR_STRATEGY_SCORE] strategy=${c.strategy} subject=${c.subjectId} base=${baseScore.toFixed(2)} eff=${multiplier} fat=${fatigue} dec=${decay} final=${finalScore.toFixed(2)}`);

        return {
            ...c,
            score: finalScore,
            baseScore,
            effectivenessMultiplier: multiplier,
            fatiguePenalty: fatigue,
            decayBoost: decay
        };
    });
};

export const applySafetyRules = (candidates: StrategySignal[]): StrategySignal[] => {
    // Rule 1: Onboarding is exclusive
    if (candidates.some(c => c.strategy === RadarStrategy.ONBOARDING)) {
        return candidates.filter(c => c.strategy === RadarStrategy.ONBOARDING);
    }

    // Rule 2: RECOVERY suppresses CHALLENGE
    // If ANY recovery signal exists, remove ALL challenge signals
    const hasRecovery = candidates.some(c => c.strategy === RadarStrategy.RECOVERY);
    if (hasRecovery) {
        return candidates
            .filter(c => c.strategy !== RadarStrategy.CHALLENGE)
            .sort((a, b) => b.score - a.score);
    }

    // Default Sort
    return candidates.sort((a, b) => b.score - a.score);
};

// Legacy Wrapper for backward compatibility (if needed) or main entry
export const resolveRadarStrategy = (signals: RadarSignals): { strategy: RadarStrategy; focusSubjectId?: string } => {
    const candidates = detectAllStrategies(signals);
    const safe = applySafetyRules(candidates);
    const top = safe[0];
    return { strategy: top.strategy, focusSubjectId: top.subjectId };
};
