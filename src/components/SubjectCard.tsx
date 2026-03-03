import React from 'react';
import { SubjectHealthState } from '../types';
import Card from './ui/Card';

interface SubjectCardProps {
  health: SubjectHealthState; 
  onClick: () => void;
}

const SubjectCard: React.FC<SubjectCardProps> = ({ health, onClick }) => {
  const isCritical = health.overallStatus === 'CRITICAL' || (health.confidenceScore > 0 && health.confidenceScore < 50);
  
  const getSubjectIcon = (subjectId: string) => {
    const s = subjectId.toLowerCase();
    if (s.includes('ict') || s.includes('computer')) return '💻';
    if (s.includes('physic')) return '⌛';
    if (s.includes('math')) return 'Σ';
    if (s.includes('science')) return '🧪';
    if (s.includes('history')) return '📜';
    return '📘';
  };

  const progressColor = isCritical ? 'bg-rose-500' : health.confidenceScore >= 70 ? 'bg-emerald-500' : 'bg-amber-500';

  return (
    <Card 
      onClick={onClick}
      className={`p-4 md:p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-lg bg-white dark:bg-slate-900 relative overflow-hidden group ${
        isCritical ? 'border-rose-100 dark:border-rose-900/20' : 'border-slate-50 dark:border-slate-800 hover:border-indigo-400'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
           <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-2xl md:text-3xl shadow-inner border border-slate-50 dark:border-slate-800 ${isCritical ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-slate-50 dark:bg-slate-800'}`}>
              {getSubjectIcon(health.subjectId)}
           </div>
           <div>
              <h4 className="text-lg font-black text-slate-800 dark:text-white leading-none mb-1 group-hover:text-indigo-600 transition-colors uppercase italic">{health.subjectId}</h4>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{health.primaryRiskTopic || 'GENERAL STUDY'}</p>
           </div>
        </div>
        <div className="text-right">
           <span className={`text-xl md:text-2xl font-black ${isCritical ? 'text-rose-500' : 'text-slate-900 dark:text-white'} italic leading-none`}>
              {health.confidenceScore > 0 ? `${health.confidenceScore}%` : '--%'}
           </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
           <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out ${progressColor}`} 
              style={{ width: `${health.confidenceScore || 5}%` }}
           />
        </div>
        
        <div className="flex flex-wrap gap-2">
           {isCritical && (
             <div className="px-3 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-rose-100 dark:border-rose-900/50 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse"></span> ANALYSIS WEAK
             </div>
           )}
           <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700">
              NEIS
           </div>
           {health.trend === 'UP' && (
             <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-1">
                MOMENTUM ↗
             </div>
           )}
        </div>
      </div>

      {/* Hover reveal icon */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
         <span className="text-xs text-indigo-500">🔍</span>
      </div>
    </Card>
  );
};

export default SubjectCard;