import { LearningState } from './learningStateService';

interface ExplanationInput {
  confidenceScore: number;
  depthScore: number;
  momentum: 'UP' | 'DOWN' | 'STABLE';
  state: LearningState;
}

/**
 * Translates internal metrics into anxiety-reducing parent-safe language.
 */
export const generateParentExplanation = (input: ExplanationInput): string => {
  const { state, momentum } = input;

  const explanations: Record<LearningState, string> = {
    [LearningState.STABLE]: 
      "Your child has found a great rhythm. They are absorbing new information easily and recalling it with high accuracy.",
    [LearningState.RECOVERING]: 
      "We're seeing a positive turnaround. While scores are still building up, the effort and improvement in the last few sessions is very promising.",
    [LearningState.FALSE_CONFIDENCE]: 
      "They seem comfortable with the overall topic, but some recent tricky details are causing unexpected slips. A quick review of the basics will help.",
    [LearningState.FRICTION]: 
      "Some specific concepts are proving a bit stubborn right now. This is a natural part of the learning curve and just needs a little focused attention.",
    [LearningState.PARTIAL_ENGAGEMENT]: 
      "They understand what they've covered so far, but we need to increase the consistency of study time to ensure full coverage of the material.",
    [LearningState.INCONSISTENT]: 
      "The learning pattern is currently a bit mixed. Some days are great, others are challenging. Focusing on a steady routine is the priority here."
  };

  const momentumSuffix = momentum === 'UP' 
    ? " Momentum is building nicely." 
    : momentum === 'DOWN' 
    ? " It might be a good time for a supportive check-in." 
    : "";

  return (explanations[state] || "We are currently synchronizing the latest study patterns.") + momentumSuffix;
};
