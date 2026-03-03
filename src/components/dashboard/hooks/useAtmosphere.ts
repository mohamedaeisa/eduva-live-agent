import { useDashboard } from '../context/DashboardContext';

export const useAtmosphere = () => {
  const { state } = useDashboard();

  const getBackground = () => {
    switch (state.state) {
      case 'IDLE': return 'bg-slate-50 dark:bg-slate-900';
      case 'PRIMED': return 'bg-indigo-50 dark:bg-slate-900';
      case 'FLOW': return 'bg-slate-100 dark:bg-slate-950';
      case 'FRICTION': return 'bg-amber-50 dark:bg-amber-950/30';
      case 'RECOVERY': return 'bg-teal-50 dark:bg-teal-950/30';
      default: return 'bg-slate-50';
    }
  };

  const getAccentColor = () => {
    switch (state.state) {
      case 'IDLE': return 'text-slate-500';
      case 'PRIMED': return 'text-indigo-600';
      case 'FLOW': return 'text-indigo-500';
      case 'FRICTION': return 'text-amber-600';
      case 'RECOVERY': return 'text-teal-600';
      default: return 'text-slate-500';
    }
  };

  return {
    bgClass: getBackground(),
    accentClass: getAccentColor(),
    isFlow: state.state === 'FLOW'
  };
};
