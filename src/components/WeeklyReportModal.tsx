
import React from 'react';
import { WeeklyReport } from '../services/parentService';
import Card from './ui/Card';

interface WeeklyReportModalProps {
  report: WeeklyReport;
  studentName: string;
  onClose: () => void;
}

const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ report, studentName, onClose }) => {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in overflow-hidden">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-slide-up flex flex-col max-h-[85vh]">
        
        {/* HEADER - High Visibility Intelligence Theme */}
        <div className="bg-[#2464bc] p-6 text-center relative overflow-hidden shrink-0">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] opacity-50"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
            
            {/* Exit Button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 border border-white/10"
              aria-label="Exit"
            >
              <span className="text-sm font-black">✕</span>
            </button>

            <div className="inline-block p-3 bg-white/10 rounded-2xl mb-3 backdrop-blur-md border border-white/10 shadow-lg">
                <span className="text-3xl drop-shadow-lg">📊</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-sm">Intelligence Briefing</h2>
            <p className="text-blue-100 text-[9px] font-black uppercase tracking-[0.3em] mt-2 opacity-80">
                {report.period} • {studentName}
            </p>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="p-6 md:p-8 space-y-8 overflow-y-auto custom-scrollbar flex-grow bg-white dark:bg-slate-900">
            
            {/* KEY METRICS GRID */}
            <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 text-center shadow-inner">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Weekly Effort</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">
                        {Math.floor(report.totalTimeMins / 60)}<span className="text-xs text-slate-400 font-bold ml-1">h</span> {report.totalTimeMins % 60}<span className="text-xs text-slate-400 font-bold ml-1">m</span>
                    </p>
                </div>
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 text-center shadow-inner">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Active Missions</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">{report.tasksCompleted}</p>
                </div>
            </div>

            {/* PERFORMANCE EXTREMES */}
            <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-green-50/50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/30 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-xl">🏆</div>
                        <div>
                            <p className="text-[8px] font-black uppercase text-green-600 tracking-widest mb-0.5">Top Performance</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-green-100">{report.topSubject}</p>
                        </div>
                    </div>
                </div>

                {report.struggleSubject !== 'None' && (
                    <div className="flex items-center justify-between p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-xl">🚧</div>
                            <div>
                                <p className="text-[8px] font-black uppercase text-amber-600 tracking-widest mb-0.5">Focus Required</p>
                                <p className="text-sm font-bold text-slate-700 dark:text-amber-100">{report.struggleSubject}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* AI OBSERVATIONS */}
            <div className="bg-indigo-50/30 dark:bg-indigo-900/10 p-5 rounded-[2rem] border border-indigo-100/50 dark:border-indigo-800/30">
                <h3 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.3em] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    AI Strategic Observations
                </h3>
                <div className="space-y-4">
                    {report.insights.map((insight, i) => (
                        <div key={i} className="flex gap-3 items-start group">
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-300 dark:bg-indigo-600 group-hover:scale-125 transition-transform shrink-0"></div>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                "{insight}"
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
            <button 
                onClick={onClose} 
                className="w-full py-4 bg-slate-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-95"
            >
                Acknowledge Briefing
            </button>
            <p className="text-center text-[7px] font-black text-slate-400 uppercase tracking-widest mt-4 opacity-50">
                Proprietary Educational Intelligence Engine • V6.2
            </p>
        </div>
      </div>
    </div>
  );
};

export default WeeklyReportModal;
