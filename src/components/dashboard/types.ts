export type DashboardState = 
  | 'IDLE' 
  | 'PRIMED' 
  | 'FLOW' 
  | 'FRICTION' 
  | 'RECOVERY';

export type FeatureId = 
  | 'adaptive_quiz' 
  | 'notes' 
  | 'library' 
  | 'exam' 
  | 'stats'
  | 'study_assembler'
  | 'gamification'
  | 'subject_compass';

export interface DashboardContextData {
  state: DashboardState;
  activeFeatureId: FeatureId | null;
  activeFeatureProps: any;
  activeSubject: string | null;
  momentum: number; // 0-100
  lastActionTimestamp: number;
}

export type DashboardEvent = 
  | { type: 'PRIME_SUBJECT'; subject: string }
  | { type: 'OPEN_FEATURE'; featureId: FeatureId; props?: any }
  | { type: 'CLOSE_FEATURE' }
  | { type: 'REPORT_FRICTION' }
  | { type: 'RESOLVE_FRICTION' }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'TELEMETRY_FLOW' }
  | { type: 'TELEMETRY_FRICTION' }
  | { type: 'TELEMETRY_RECOVERY' };
