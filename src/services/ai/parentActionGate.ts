import { LearningState } from './learningStateService';
import { ParentActionType } from '../../types';

/**
 * Advisory gating for parent actions. 
 * Recommends actions that maximize student confidence and minimize friction.
 */
export const getRecommendedActions = (state: LearningState): ParentActionType[] => {
  switch (state) {
    case LearningState.STABLE:
      return ['TALK', 'EXAM']; // Celebrate or Challenge
    case LearningState.RECOVERING:
      return ['TALK', 'MONITOR']; // Boost confidence, don't interrupt
    case LearningState.FRICTION:
      return ['FOUNDATION_REPAIR', 'PRACTICE']; // Tactical help
    case LearningState.FALSE_CONFIDENCE:
      return ['PRACTICE']; // Re-grounding
    case LearningState.PARTIAL_ENGAGEMENT:
      return ['TALK']; // Nudge for consistency
    case LearningState.INCONSISTENT:
    default:
      return ['TALK', 'MONITOR'];
  }
};

/**
 * Checks if an action is currently "safe" (Soft-gate).
 */
export const isActionStrategic = (action: ParentActionType, state: LearningState): boolean => {
  const recommended = getRecommendedActions(state);
  return recommended.includes(action);
};
