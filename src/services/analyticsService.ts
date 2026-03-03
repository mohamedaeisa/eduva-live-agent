
import { UserProfile, SessionData } from '../types';
import firebase from 'firebase/compat/app';

/**
 * LEGACY ANALYTICS SERVICE (DEPRECATED)
 * All tracking to 'analytics_sessions' has been deactivated.
 * Interface is maintained for compatibility with existing modules.
 */

export const identifyUser = async (user: firebase.User | null) => {
  // NO-OP: Deprecated tracking
};

export const initSession = async (userProfile?: UserProfile) => {
  // NO-OP: Deprecated tracking
};

export const flushSession = async () => {
  // NO-OP: Deprecated tracking
};

export const syncSession = () => {
  // NO-OP: Deprecated tracking
};

export const updateBehavior = (updates: Partial<SessionData>) => {
  // NO-OP: Deprecated tracking
};

export const logEvent = (actionName: string, details?: string) => {
  // NO-OP: Deprecated tracking
};

/**
 * AI Performance logging is now handled by the LIS Telemetry system.
 */
export const logAiPerformance = (
  actionName: string,
  latencyMs: number,
  topic: string = '',
  isError: boolean = false,
  model: string = 'gemini-2.0-flash',
  estimatedTokens: number = 0,
  metadata: any = {}
) => {
  // NO-OP: Deprecated tracking
};

export const logAiPrompt = (actionName: string, prompt: string | object, result: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.groupCollapsed(`📝 AI PROMPT LOG (Debug): ${actionName}`);
    console.log("PROMPT:", prompt);
    console.log("RESULT:", result);
    console.groupEnd();
  }
};

export interface PaginatedSessions {
  sessions: SessionData[];
  lastDoc: any;
  strategy: 'sorted' | 'unsorted';
}

export const fetchSessions = async (): Promise<PaginatedSessions> => {
  return { sessions: [], lastDoc: null, strategy: 'unsorted' };
};

export const fetchAnalyticsData = async (): Promise<SessionData[]> => {
  return [];
}

export const fetchTotalSessionCount = async (): Promise<number> => {
  return 0;
};

export const collectAndPushLead = async (user: UserProfile) => {
  // NO-OP: Deprecated tracking
};

export const checkFirebaseStatus = async (): Promise<{ status: 'ok' | 'auth_error' | 'db_error', message?: string }> => {
  return { status: 'ok' };
};
