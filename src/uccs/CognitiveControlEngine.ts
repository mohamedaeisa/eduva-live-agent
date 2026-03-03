
import { DecisionAction, SubjectHealthState, SubjectHealthEvidence } from '../types';
import { UCCS_ENABLED } from './Constants';

export const decideIntervention = (
  health: SubjectHealthState,
  evidence: SubjectHealthEvidence | null
): DecisionAction => {
  if (!UCCS_ENABLED) return { type: 'PROBE' };

  const accuracy = evidence?.masteryScore || health.confidenceScore;
  const engagement = evidence?.engagementSummary.hoursPerWeek || health.hoursLogged;
  
  // Rule set (Emotion-Blind)
  
  // 1. Conflict Check -> PROBE
  // Example: High confidence but very low recent accuracy signals discrepancy
  if (health.confidenceScore > 80 && accuracy < 60) {
    return { type: 'PROBE' };
  }

  // 2. High stability -> COMMIT mastery
  if (health.overallStatus === 'GOOD' && accuracy >= 80) {
    return { type: 'COMMIT', targetState: 'mastery' };
  }

  // 3. Repeated errors -> COMMIT struggle
  if (health.overallStatus === 'CRITICAL' || accuracy < 50) {
    return { type: 'COMMIT', targetState: 'struggle' };
  }

  // 4. Low engagement -> COMMIT disengaged
  if (health.overallStatus === 'GOOD' && engagement < 1) {
    return { type: 'COMMIT', targetState: 'disengaged' };
  }

  // Default to PROBE if uncertain
  return { type: 'PROBE' };
};
