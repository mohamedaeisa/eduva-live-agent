import { LearningState } from './learningStateService';
import { TopicMetric } from '../../types';

export interface NextBestMove {
  label: string;
  reason: string;
  icon: string;
}

/**
 * Computes the single most valuable move a parent can make right now.
 */
export const getNextBestMove = (state: LearningState, weakestTopic?: string): NextBestMove => {
  switch (state) {
    case LearningState.STABLE:
      return { 
        label: "Celebrate the Win", 
        reason: "Success breeds success. Acknowledge their consistency.",
        icon: "🏆"
      };
    case LearningState.RECOVERING:
      return { 
        label: "Send Encouragement", 
        reason: "Improvement is happening. Keep the spirits high.",
        icon: "✨"
      };
    case LearningState.FRICTION:
      return { 
        label: `Repair ${weakestTopic || 'Foundations'}`, 
        reason: "Address specific gaps before moving to new content.",
        icon: "🛠️"
      };
    case LearningState.FALSE_CONFIDENCE:
      return { 
        label: "Targeted Practice", 
        reason: "Stabilize core concepts to prevent future errors.",
        icon: "🎯"
      };
    case LearningState.PARTIAL_ENGAGEMENT:
      return { 
        label: "Check-in on Progress", 
        reason: "A brief nudge can help restore study consistency.",
        icon: "👋"
      };
    case LearningState.INCONSISTENT:
    default:
      return { 
        label: "Observation Mode", 
        reason: "Wait for more signals before initiating a major task.",
        icon: "🔭"
      };
  }
};
