import React from 'react';

interface TemporalScrubberProps {
  timeOffset: number;
  onScrub: (val: number) => void;
}

const TemporalScrubber: React.FC<TemporalScrubberProps> = ({ timeOffset, onScrub }) => {
  
  const getLabel = () => {
      if (timeOffset === 0) return "PRESENT";
      if (timeOffset < 0) return `${Math.abs(timeOffset)} DAYS AGO`;
      return `FUTURE +${timeOffset} DAYS`;
  };

  const getColor = () => {
      if (timeOffset === 0) return "text-indigo-600";
      if (timeOffset < 0) return "text-slate-500";
      return "text-emerald-500";
  };

  return (
    <div className="flex justify-center mb-10 relative z-[150]">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 p-4 rounded-full shadow-2xl flex flex-col items-center gap-2 w-72 md:w-96 transition-all hover:scale-105">
            <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${getColor()}`}>
                {getLabel()}
            </span>
            <input 
                type="range" 
                min="-30" 
                max="30" 
                step="1"
                value={timeOffset}
                onChange={(e) => onScrub(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between w-full px-1">
                <span className="text-[8px] font-bold text-slate-400 opacity-50">-30d</span>
                <span className="text-[8px] font-bold text-indigo-400 opacity-50">NOW</span>
                <span className="text-[8px] font-bold text-slate-400 opacity-50">+30d</span>
            </div>
        </div>
    </div>
  );
};

export default TemporalScrubber;