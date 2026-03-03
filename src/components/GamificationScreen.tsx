
import React, { useState, useEffect } from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS, BADGES, LEVEL_THRESHOLD } from '../constants';
import Card from './ui/Card';
import Button from './ui/Button';
import { getLeaderboard } from '../services/socialService';

interface GamificationScreenProps {
  user: UserProfile;
  appLanguage: Language;
  onBack: () => void;
}

const GamificationScreen: React.FC<GamificationScreenProps> = ({ user, appLanguage, onBack }) => {
  const t = TRANSLATIONS[appLanguage];
  const [activeBoard, setActiveBoard] = useState<'global' | 'class'>('global');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  useEffect(() => {
    const fetchBoard = async () => {
      // Pass user's grade if 'class' mode is selected
      const gradeFilter = activeBoard === 'class' ? user?.preferences?.defaultYear : undefined;
      const data = await getLeaderboard(10, gradeFilter);
      setLeaderboardData(data);
    };
    fetchBoard();
  }, [activeBoard, user?.preferences?.defaultYear]);
  
  if (!user) return null;

  const currentLevelXpStart = (user.gamification.level - 1) * LEVEL_THRESHOLD;
  const nextLevelXpStart = user.gamification.level * LEVEL_THRESHOLD;
  const xpProgress = Math.min(100, Math.max(0, ((user.gamification.xp - currentLevelXpStart) / LEVEL_THRESHOLD) * 100));

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-fade-in space-y-8 pt-6 px-4">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
        <div className="order-2 md:order-1 text-center md:text-left">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-2">
            {t.menuGamification}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
            Track your achievements and compete with others!
            </p>
        </div>
        <div className="order-1 md:order-2 self-start md:self-center">
            <Button variant="outline" onClick={onBack} className="rounded-xl border-slate-200 shadow-sm bg-white dark:bg-slate-800">
                ← {t.back}
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Challenge & Progress */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Weekly Challenge Banner */}
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-8 border-l-4 border-amber-500 shadow-sm relative overflow-hidden">
            <h3 className="text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-widest mb-2 opacity-80">{t.weeklyChallenge}</h3>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">{t.challengeTitle}</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-6 font-medium text-lg max-w-md">{t.challengeDesc}</p>
            
            <div className="flex items-center gap-4">
                <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm">
                    <span className="text-lg">🎁</span> {t.challengeReward}
                </div>
                <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm">
                    <span className="text-lg">⏳</span> 2 Days Left
                </div>
            </div>
          </div>

          {/* Level Progress Detailed */}
          <Card className="p-8">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
               <span>📈</span> Level Progress
             </h3>
             
             <div className="flex items-center justify-between mb-2 text-sm font-bold text-slate-500">
                <span>Level {user.gamification.level}</span>
                <span>Level {user.gamification.level + 1}</span>
             </div>
             <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
                <div 
                  className="h-full bg-brand-600"
                  style={{ width: `${xpProgress}%` }}
                ></div>
             </div>
             <p className="text-center text-sm text-slate-500">
                <span className="font-bold text-brand-600">{nextLevelXpStart - user.gamification.xp} XP</span> needed for next level
             </p>
          </Card>

          {/* Trophy Room (Badges) */}
          <Card className="p-8">
            <h3 className="font-bold text-xl mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
               <span>🎖️</span> {t.trophyRoom}
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {BADGES.map(badge => {
                const isUnlocked = (user?.gamification?.earnedBadges || []).includes(badge.id);
                // @ts-ignore
                const name = t[badge.nameKey] || badge.nameKey;
                
                return (
                  <div key={badge.id} className="relative group flex flex-col items-center text-center">
                     <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl border-2 transition-all duration-300 ${
                       isUnlocked 
                         ? 'bg-white border-amber-200 text-amber-500 shadow-sm' 
                         : 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700 grayscale opacity-40'
                     }`}>
                       {badge.icon}
                     </div>
                     <span className={`mt-3 text-xs font-bold ${isUnlocked ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>{name}</span>
                  </div>
                );
              })}
            </div>
          </Card>

        </div>

        {/* Right Column: Leaderboard */}
        <div className="lg:col-span-1">
           <Card className="h-full border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex flex-col gap-4 mb-6">
                 <div className="flex items-center gap-2">
                    <span className="text-2xl">🏅</span>
                    <h3 className="font-bold text-xl text-slate-800 dark:text-white">{t.leaderboard}</h3>
                 </div>
                 
                 {/* Filters */}
                 <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                    <button 
                      onClick={() => setActiveBoard('global')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeBoard === 'global' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      Global
                    </button>
                    <button 
                      onClick={() => setActiveBoard('class')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeBoard === 'class' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      My Grade
                    </button>
                 </div>
              </div>

              <div className="space-y-3">
                 {leaderboardData.map((entry, index) => {
                    const isUser = entry.name === user.name;
                    return (
                        <div 
                          key={index} 
                          className={`flex items-center p-3 rounded-lg border transition-all ${
                            isUser 
                              ? 'bg-brand-50 border-brand-200 dark:bg-brand-900/20 dark:border-brand-800' 
                              : 'bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700'
                          }`}
                        >
                           <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs mr-3 ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700' :
                              index === 1 ? 'bg-slate-200 text-slate-700' :
                              index === 2 ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 dark:bg-slate-700 text-slate-500'
                           }`}>
                              {index + 1}
                           </div>
                           
                           <div className="flex-grow">
                              <p className={`font-bold text-sm ${isUser ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                 {entry.name} {isUser && '(You)'}
                              </p>
                              <p className="text-[10px] text-slate-500">Level {entry.level} {activeBoard === 'class' && `• ${entry.grade}`}</p>
                           </div>

                           <div className="font-mono font-bold text-xs text-slate-600 dark:text-slate-400">
                              {(entry.xp || 0).toLocaleString()} XP
                           </div>
                        </div>
                    );
                 })}
                 {leaderboardData.length === 0 && (
                    <p className="text-center text-slate-400 py-4 italic text-xs">No data available.</p>
                 )}
              </div>
           </Card>
        </div>

      </div>
    </div>
  );
};

export default GamificationScreen;
