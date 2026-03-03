
import React from 'react';

interface FloatingProgressProps {
  // Fix: changed props to match usage in App.tsx
  status: string;
  progress: number;
  onExpand: () => void;
}

const FloatingProgress: React.FC<FloatingProgressProps> = ({ status, progress, onExpand }) => {
  return (
    <div 
      className="fixed bottom-24 right-4 z-[150] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-72 animate-slide-up cursor-pointer hover:scale-105 transition-transform group"
      onClick={onExpand}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Background Task</span>
        </div>
        <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400">{Math.round(progress)}%</span>
      </div>
      
      <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate mb-2">{status || "Processing..."}</h4>
      
      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <p className="text-[10px] text-slate-400 mt-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">Click to view details</p>
    </div>
  );
};

export default FloatingProgress;
