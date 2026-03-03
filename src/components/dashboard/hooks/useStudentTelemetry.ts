import { useDashboard } from '../context/DashboardContext';

export type TelemetrySignal =
  | 'task_start'
  | 'task_complete_smooth'
  | 'task_complete_struggle'
  | 'task_abort'
  | 'retry_burst'
  | 'idle_timeout';

export const useStudentTelemetry = () => {
  const { dispatch } = useDashboard();

  const logSignal = (signal: TelemetrySignal, metadata?: any) => {
    // Optional: Integrate with analytics service here if needed
    // logEvent('TELEMETRY', signal); 

    switch (signal) {
      case 'task_start':
        // Just a heartbeat, ensures we aren't idle
        break;
      case 'task_complete_smooth':
        dispatch({ type: 'TELEMETRY_FLOW' });
        break;
      case 'task_complete_struggle':
      case 'retry_burst':
        dispatch({ type: 'TELEMETRY_FRICTION' });
        break;
      case 'task_abort':
        // If aborting, we usually want to cool down
        dispatch({ type: 'TELEMETRY_RECOVERY' });
        break;
      case 'idle_timeout':
         dispatch({ type: 'IDLE_TIMEOUT' });
         break;
    }
  };

  return { logSignal };
};
