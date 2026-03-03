
import { db } from '../services/firebaseConfig';
import { ParentSignalLog, ParentSignalType, SubjectHealthState } from '../types';
import { UCCS_COLLECTION_SIGNALS, UCCS_ENABLED } from './Constants';

export const logParentSignal = async (
  parentId: string, 
  studentId: string, 
  subject: string, 
  signalType: ParentSignalType,
  currentHealth?: SubjectHealthState,
  contentId?: string,
  fileName?: string
) => {
  if (!UCCS_ENABLED) return;

  const healthStatusMap: Record<string, 'STABLE' | 'NEEDS_ATTENTION' | 'CRITICAL'> = {
    'GOOD': 'STABLE',
    'NEEDS_ATTENTION': 'NEEDS_ATTENTION',
    'CRITICAL': 'CRITICAL'
  };

  const log: ParentSignalLog = {
    parentId,
    studentId,
    subject,
    signalType,
    studentHealthAtTime: healthStatusMap[currentHealth?.overallStatus || 'GOOD'] || 'STABLE',
    contentId,
    fileName,
    timestamp: Date.now()
  };

  try {
    await db.collection(UCCS_COLLECTION_SIGNALS).add(log);
    // Standard Audit Log Format (Requested)
    console.debug(`[UCCS] Signal Logged: ${signalType} | ContentID: ${contentId || 'GLOBAL'} | Filename: ${fileName || 'TOPIC_STUDY'}`);
  } catch (e) {
    console.warn('[UCCS] Failed to log signal', e);
  }
};
