
import React, { useState } from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS, LEVEL_THRESHOLD } from '../constants';

interface GamificationBarProps {
  user: UserProfile;
  appLanguage: Language;
}

const GamificationBar: React.FC<GamificationBarProps> = ({ user, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const { level, xp, streak } = user.gamification;

  // Calculate progress to next level
  const currentLevelXpStart = (level - 1) * LEVEL_THRESHOLD;
  const nextLevelXpStart = level * LEVEL_THRESHOLD;
  const progress = Math.min(100, Math.max(0, ((xp - currentLevelXpStart) / LEVEL_THRESHOLD) * 100));

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 py-2 px-4 sticky top-16 z-40 shadow-sm animate-fade-in">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Level & XP */}
        <div className="flex items-center flex-grow max-w-md gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold shadow-lg shadow-brand-500/30 border-2 border-white dark:border-slate-800">
              {level}
            </div>
            <span className="absolute -bottom-1 -right-1 bg-slate-800 text-white text-[9px] px-1 rounded-full uppercase font-bold">
              {t.level}
            </span>
          </div>
          
          <div className="flex-grow flex flex-col gap-1">
            <div className="flex justify-between text-xs font-bold text-slate-500">
               <span>{xp} {t.xp}</span>
               <span>{nextLevelXpStart} {t.xp}</span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-gradient-to-r from-brand-400 to-purple-500 transition-all duration-1000 ease-out"
                 style={{ width: `${progress}%` }}
               ></div>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-full border border-orange-100 dark:border-orange-900/30">
           <span className={`text-xl ${streak > 0 ? 'animate-pulse' : 'grayscale'}`}>🔥</span>
           <div className="flex flex-col leading-none">
             <span className="text-sm font-black text-orange-600 dark:text-orange-400">{streak}</span>
             <span className="text-[9px] uppercase font-bold text-orange-400">{t.streak}</span>
           </div>
        </div>

      </div>
    </div>
  );
};

export default GamificationBar;