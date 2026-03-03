import { 
  ParentActionType, SubjectHealthState, ParentSignalType, 
  InterventionPlan, SubjectHealthEvidence 
} from '../types';
import { UCCS_ENABLED } from './Constants';
import { logParentSignal } from './SignalLayer';
import { decideIntervention } from './CognitiveControlEngine';
import { mapIntentToPlan } from './IntentMappingService';
import { getSubjectHealthEvidence } from '../services/parentService';

export class UCCSManager {
  static async processParentAction(
    parentId: string,
    studentId: string,
    subject: string,
    action: ParentActionType,
    currentHealth: SubjectHealthState,
    contentId?: string,
    fileName?: string
  ): Promise<void> {
    if (!UCCS_ENABLED) return;

    let signalType: ParentSignalType = 'NEUTRAL';
    
    // Map actions to descriptive signal types for audit trail
    if (action === 'TALK') {
      signalType = currentHealth.overallStatus === 'GOOD' ? 'CELEBRATION' : 'SUPPORT';
    } else if (action === 'FOUNDATION_REPAIR') {
      signalType = 'FIX';
    } else if (action === 'EXAM' || (action === 'IMPROVE' && currentHealth.overallStatus === 'GOOD')) {
      signalType = 'CHALLENGE';
    } else if (action === 'PRACTICE' || action === 'IMPROVE') {
      signalType = 'SUPPORT';
    } else if (action === 'MONITOR') {
      // MONITOR intent: Parent is checking health or seeking explanation
      signalType = 'NEUTRAL';
    }

    await logParentSignal(parentId, studentId, subject, signalType, currentHealth, contentId, fileName);
  }

  static async getInterventionPlan(
    studentId: string,
    subject: string,
    currentHealth: SubjectHealthState,
    lastParentSignal: ParentSignalType = 'NEUTRAL'
  ): Promise<InterventionPlan | null> {
    if (!UCCS_ENABLED) return null;

    try {
      const evidence = await getSubjectHealthEvidence(studentId, subject);
      const decision = decideIntervention(currentHealth, evidence);
      return mapIntentToPlan(decision, lastParentSignal, currentHealth);
    } catch (e) {
      console.warn('[UCCS] Plan Generation Failed', e);
      return null;
    }
  }
}
