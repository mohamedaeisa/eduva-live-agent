import React, { useState, useEffect, useMemo } from 'react';
import { AppView, Language, UserProfile, SubjectHealthState, UserRole, AuthorityLevel } from '../types';
import { getSubjectHealthSnapshots } from '../services/parentService';
import { getHistory } from '../services/storageService';
import Card from './ui/Card';
import SubjectCard from './SubjectCard';
import ParentSubjectDetail from './ParentSubjectDetail';

interface DashboardProps {
  user: UserProfile;
  appLanguage: Language;
  onNavigate: (view: AppView) => void;
  onLaunchMission: (mission: any) => void;
}

const MasteryHexagon = ({ percentage }: { percentage: number }) => (
  <div className="relative w-24 h-24 flex items-center justify-center">
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-indigo-100 dark:text-slate-800"
      />
      <path
        d="M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z"
        fill="none"
        stroke="url(#hexGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="300"
        strokeDashoffset={300 - (300 * percentage / 100)}
        className="transition-all duration-1000 ease-out"
      />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none mb-0.5">Mastery</span>
      <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">{percentage}%</span>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ user, appLanguage, onNavigate, onLaunchMission }) => {
  const [subjects, setSubjects] = useState<SubjectHealthState[]>([]);
  const [lastSubject, setLastSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<SubjectHealthState | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [healthData, historyData] = await Promise.all([
          getSubjectHealthSnapshots(user.id),
          getHistory(user.id)
        ]);
        
        setSubjects(healthData);

        if (historyData.length > 0) {
          const sortedHistory = historyData.sort((a, b) => b.timestamp - a.timestamp);
          for (const item of sortedHistory) {
              const sub = item.metadata?.subject || 
                          (item.title.includes(':') ? item.title.split(':')[0] : null);
              
              if (sub && !['Quiz', 'Study', 'Generated'].includes(sub)) {
                  setLastSubject(sub.trim());
                  break;
              }
          }
        }
      } catch (e) {
        console.error("Dashboard hydration fault:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user.id]);

  const nextAction = useMemo(() => {
    // 1. Parent Nudges/Missions take top priority
    if (user.activeMission) return { ...user.activeMission, type: user.activeMission.type || 'RESUME' };
    
    // 2. Fix critical gaps if health data exists (with actual progress > 0)
    const weakSubject = subjects.find(s => s.overallStatus === 'CRITICAL' && s.confidenceScore > 0);
    if (weakSubject) {
      return {
        id: `repair_${weakSubject.subjectId}`,
        topic: weakSubject.primaryRiskTopic || 'Core Foundations',
        subject: weakSubject.subjectId,
        type: 'REPAIR',
        label: 'Repair Gap'
      };
    }
    
    // 3. Resume the most recent local study activity
    if (lastSubject) {
        return {
            id: 'resume_active',
            topic: lastSubject,
            subject: lastSubject,
            type: 'RESUME',
            label: 'Resume Study'
        };
    }
    
    // 4. DYNAMIC ADAPTATION: If zero history/trained subjects, force training initialization
    const isSystemTrained = subjects.some(s => s.confidenceScore > 0);
    if (!isSystemTrained && !lastSubject) {
        return {
            id: 'initialize_ai',
            topic: 'Setup your first vault',
            subject: 'System Ready',
            type: 'TRAIN_REQUIRED',
            label: 'Initialize AI'
        };
    }

    // 5. Final fallback for trained systems with no current struggle points
    const sortedByConfidence = subjects.filter(s => s.confidenceScore > 0).sort((a,b) => b.confidenceScore - a.confidenceScore);
    const topSubject = sortedByConfidence[0];
    
    return {
      id: 'explore_new',
      topic: 'Explore Next Level',
      subject: topSubject?.subjectId || user.preferences.defaultSubject || 'Knowledge',
      type: 'NEW',
      label: 'New Mission'
    };
  }, [user.activeMission, subjects, lastSubject, user.preferences.defaultSubject]);

  const overallMastery = useMemo(() => {
    if (subjects.length === 0) return 0;
    const total = subjects.reduce((acc, s) => acc + s.confidenceScore, 0);
    return Math.round(total / subjects.length);
  }, [subjects]);

  const handleActionClick = () => {
      if (nextAction.type === 'TRAIN_REQUIRED') {
          onNavigate(AppView.LIBRARY);
      } else {
          onLaunchMission(nextAction);
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-10 pb-32 animate-fade-in relative z-10">
      {selectedSubjectDetail && (
        <ParentSubjectDetail 
          studentId={user.id}
          health={selectedSubjectDetail}
          feed={[]}
          onClose={() => setSelectedSubjectDetail(null)}
          onActionComplete={() => {}}
          authority={user.role === UserRole.PARENT ? AuthorityLevel.COMMANDER : AuthorityLevel.MONITOR}
          preferences={user.preferences as any}
          onUpdatePreferences={() => {}}
        />
      )}

      <div className="flex justify-between items-center px-4 pt-4">
        <div className="flex items-center gap-4">
           <div className="w-14 h-14 rounded-full border-2 border-white dark:border-slate-800 shadow-xl overflow-hidden bg-slate-200">
              <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} className="w-full h-full object-cover" alt="Profile" />
           </div>
           <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                Hello, {user.name.split(' ')[0]}
              </h2>
              <div className="flex items-center gap-2">
                 <p className="text-[8px] font-black uppercase text-emerald-500 tracking-widest">Neural Link: Stable</p>
                 <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px]">🔥</span>
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{user.gamification.streak} Streak</span>
                 </div>
              </div>
           </div>
        </div>
        
        <MasteryHexagon percentage={overallMastery || 0} />
      </div>

      <div className="px-4">
        <button 
          onClick={handleActionClick}
          className={`w-full relative overflow-hidden p-6 md:p-8 rounded-[2.5rem] text-white text-left shadow-2xl transition-all hover:scale-[1.01] active:scale-95 group border border-white/10 ${
              nextAction.type === 'TRAIN_REQUIRED' 
              ? 'bg-gradient-to-br from-slate-800 to-slate-950 shadow-slate-900/40' 
              : 'bg-gradient-to-br from-[#5c68ff] to-[#4f46e5] shadow-[0_20px_40px_rgba(92,104,255,0.3)]'
          }`}
        >
          <div className="absolute top-0 right-0 p-8 opacity-20 text-[12rem] font-black italic pointer-events-none ltr:block rtl:hidden leading-none select-none">
            {nextAction.type === 'TRAIN_REQUIRED' ? '?' : 'Σ'}
          </div>
          
          <div className="relative z-10">
             <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black backdrop-blur-md border border-white/30 ${nextAction.type === 'TRAIN_REQUIRED' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/20'}`}>
                  {nextAction.type === 'TRAIN_REQUIRED' ? '⚡' : nextAction.subject.charAt(0)}
                </div>
                <span className="px-3 py-1 rounded-full bg-black/20 text-[8px] font-black tracking-[0.2em] uppercase border border-white/10 backdrop-blur-sm">
                    {nextAction.type === 'TRAIN_REQUIRED' ? 'Intelligence Initialization' : 'Priority Mission'}
                </span>
             </div>
             
             <div className="flex justify-between items-end">
                <div className="space-y-1">
                   <h3 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-none">{nextAction.subject}</h3>
                   <p className="text-white/80 text-lg lg:text-xl font-medium italic">"{nextAction.topic}"</p>
                </div>
                
                {nextAction.type !== 'TRAIN_REQUIRED' && (
                    <div className="text-right pb-1">
                        <p className="text-[8px] font-black uppercase opacity-60 tracking-[0.2em] mb-0.5 whitespace-nowrap">Estimated Focus</p>
                        <p className="text-xl lg:text-2xl font-black leading-none whitespace-nowrap">25 Minutes</p>
                    </div>
                )}
             </div>
             
             <div className="flex justify-end mt-4 lg:mt-6">
                <div className={`bg-white/90 backdrop-blur-sm px-8 py-3.5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl flex items-center gap-3 group-hover:bg-white transition-all transform active:scale-95 ${nextAction.type === 'TRAIN_REQUIRED' ? 'text-slate-900' : 'text-indigo-900'}`}>
                   {nextAction.label} <span className="text-base leading-none">→</span>
                </div>
             </div>
          </div>
        </button>
      </div>

      <div className="px-4 space-y-4">
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] ml-2">Intelligence Tools</h3>
        <div className="grid grid-cols-3 gap-3 md:gap-6">
           <button onClick={() => onNavigate(AppView.STUDY_NOTES_ASSEMBLER)} className="bg-white dark:bg-slate-800 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center gap-3 hover:border-indigo-400 transition-all group aspect-square justify-center">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">📝</div>
              <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 tracking-widest text-center leading-tight">Study Notes</span>
           </button>
           <button onClick={() => onNavigate(AppView.ADAPTIVE_QUIZ)} className="bg-white dark:bg-slate-800 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center gap-3 hover:border-rose-400 transition-all group aspect-square justify-center">
              <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">🎯</div>
              <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 group-hover:text-rose-600 tracking-widest text-center leading-tight">Practice</span>
           </button>
           <button onClick={() => onNavigate(AppView.EXAM)} className="bg-white dark:bg-slate-800 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center gap-3 hover:border-amber-400 transition-all group aspect-square justify-center">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">🎓</div>
              <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 group-hover:text-amber-600 tracking-widest text-center leading-tight">Mock Exam</span>
           </button>
        </div>
      </div>

      <div className="px-4 space-y-6">
        <div className="flex justify-between items-center px-2">
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Subject Status</h3>
            <button className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center text-lg hover:text-indigo-600 transition-all">
               <span className="text-sm">⚙️</span>
            </button>
        </div>

        <div className="space-y-4">
          {loading ? (
             <div className="py-20 flex flex-col items-center">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-4">Syncing Matrix...</p>
             </div>
          ) : subjects.map(h => (
              <SubjectCard 
                key={h.subjectId} 
                health={h} 
                onClick={() => setSelectedSubjectDetail(h)} 
              />
          ))}
          
          {subjects.length === 0 && !loading && (
             <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem]">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No learning data indexed.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;