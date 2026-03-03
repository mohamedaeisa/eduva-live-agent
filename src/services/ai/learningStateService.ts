
import { SubjectHealthState, SubjectHealthEvidence } from '../../types';

export enum LearningState {
  STABLE = 'STABLE',
  PARTIAL_ENGAGEMENT = 'PARTIAL_ENGAGEMENT',
  INCONSISTENT = 'INCONSISTENT',
  FRICTION = 'FRICTION',
  RECOVERING = 'RECOVERING',
  FALSE_CONFIDENCE = 'FALSE_CONFIDENCE'
}

/**
 * Technical Flow: Diagnostic Extension
 * Derives a conceptual learning state from raw telemetry without persisting new data.
 */
export const classifyLearningState = (
  health: SubjectHealthState,
  evidence: SubjectHealthEvidence | null
): LearningState => {
  const confidence = health.confidenceScore;
  const trend = health.trend;
  const accuracy = evidence?.masteryScore ?? confidence;
  const engagement = evidence?.engagementSummary.hoursPerWeek ?? health.hoursLogged;

  // 1. RECOVERING: Improving trend from a low base
  if (trend === 'UP' && confidence < 60) {
    return LearningState.RECOVERING;
  }

  // 2. FALSE_CONFIDENCE: High historical score vs low current accuracy
  if (confidence > 75 && accuracy < 60) {
    return LearningState.FALSE_CONFIDENCE;
  }

  // 3. FRICTION: Declining performance with specific gaps
  if (trend === 'DOWN' || accuracy < 50) {
    return LearningState.FRICTION;
  }

  // 4. STABLE: High scores and consistent engagement
  /* Fixed: Removed redundant trend check as rule 3 already narrowed trend by handling 'DOWN' */
  if (confidence >= 80 && accuracy >= 80) {
    return LearningState.STABLE;
  }

  // 5. PARTIAL_ENGAGEMENT: Good results but low time logged
  if (accuracy >= 70 && engagement < 1.5) {
    return LearningState.PARTIAL_ENGAGEMENT;
  }

  // Default Fallback
  return LearningState.INCONSISTENT;
};
