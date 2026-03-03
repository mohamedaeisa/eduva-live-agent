import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { dashboardReducer, initialDashboardState } from '../machine/studentDashboardMachine';
import { DashboardContextData, DashboardEvent } from '../types';

interface DashboardContextProps {
  state: DashboardContextData;
  dispatch: React.Dispatch<DashboardEvent>;
}

export const DashboardContext = createContext<DashboardContextProps | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState);

  // Biological Heartbeat: Decay momentum or reset primed state on inactivity
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (Date.now() - state.lastActionTimestamp > 30000 && state.state !== 'FLOW') {
         dispatch({ type: 'IDLE_TIMEOUT' });
      }
    }, 10000);
    return () => clearInterval(heartbeat);
  }, [state.lastActionTimestamp, state.state]);

  return (
    <DashboardContext.Provider value={{ state, dispatch }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};