
import React, { useState, useEffect } from 'react';
import { Language, EducationSystem, UserProfile } from '../types';
import { SUBJECTS, YEARS, EDUCATION_SYSTEMS, TRANSLATIONS } from '../constants';
import Button from './ui/Button';

interface ContextBarProps {
  context: any;
  onUpdate: (field: string, value: any) => void;
  appLanguage: Language;
  user: UserProfile | null;
}

const ContextBar: React.FC<ContextBarProps> = ({ context, onUpdate, appLanguage, user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const t = TRANSLATIONS[appLanguage];

  // Use profile list or fallback to global
  const userSubjects = user?.preferences?.subjects || SUBJECTS;

  // Sync custom subject local state if context changes externally
  useEffect(() => {
    if (!userSubjects.includes(context.subject) && context.subject) {
      setIsCustomSubject(true);
      setCustomSubject(context.subject);
    } else {
      setIsCustomSubject(false);
      setCustomSubject('');
    }
  }, [context.subject, userSubjects]);

  const handleCustomSubjectBlur = () => {
    if (customSubject.trim()) {
      onUpdate('subject', customSubject);
    } else {
      // Revert to default if empty
      onUpdate('subject', userSubjects[0]);
      setIsCustomSubject(false);
    }
  };

  return (
    <div className="sticky top-16 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Compact Summary Bar (Click to Expand) */}
        <div 
          className="py-3 cursor-pointer group" 
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-4">
            {/* Icon Box */}
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm transition-colors ${isOpen ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400'}`}>
              {isOpen ? '⚙️' : '📚'}
            </div>
            
            <div className="flex-grow min-w-0 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest group-hover:text-brand-600 transition-colors">
                  {(t as any).subject || 'Subject'} & {(t as any).eduLevel || 'Grade'} Context
                </span>
                <span className={`text-slate-400 text-xs transition-transform duration-300 transform ${isOpen ? 'rotate-180 text-brand-600' : ''}`}>
                  ▼
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-hidden">
                <span className="truncate font-black text-slate-800 dark:text-white text-sm md:text-base leading-none">
                  {context.subject}
                </span>
                <span className="h-4 w-px bg-slate-300 dark:bg-slate-700"></span>
                <span className="truncate text-slate-600 dark:text-slate-300 font-bold text-xs md:text-sm leading-none">
                  {context.year}
                </span>
                
                {/* Mobile Hidden Badges */}
                <div className="hidden sm:flex items-center gap-2 ml-2">
                   <span className="inline-flex items-center text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 border border-slate-200 dark:border-slate-700">
                     {context.curriculum}
                   </span>
                   <span className="inline-flex items-center text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 border border-slate-200 dark:border-slate-700">
                     {context.language}
                   </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Controls */}
        {isOpen && (
          <div className="pb-6 pt-2 border-t border-slate-100 dark:border-slate-700 animate-slide-up">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Subject Selector */}
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <span>📖</span> {(t as any).subject || 'Subject'}
                   </label>
                   <div className="relative">
                      {!isCustomSubject ? (
                        <div className="flex">
                          <select 
                            className="w-full p-2.5 pl-3 pr-8 rounded-l-xl bg-slate-50 dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
                            value={context.subject}
                            onChange={e => onUpdate('subject', e.target.value)}
                          >
                            {userSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button 
                            onClick={() => { setIsCustomSubject(true); setCustomSubject(''); }}
                            className="px-3 bg-slate-100 dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-xl text-slate-400 hover:text-brand-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold"
                            title="Custom Subject"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : (
                        <div className="flex">
                          <input 
                            type="text" 
                            className="w-full p-2.5 rounded-l-xl bg-white dark:bg-slate-900 border border-r-0 border-brand-500 text-sm font-bold text-slate-800 dark:text-white outline-none ring-2 ring-brand-500/20"
                            value={customSubject}
                            onChange={e => setCustomSubject(e.target.value)}
                            onBlur={handleCustomSubjectBlur}
                            onKeyDown={e => e.key === 'Enter' && handleCustomSubjectBlur()}
                            placeholder="Type Subject..."
                            autoFocus
                          />
                          <button 
                            onClick={() => { setIsCustomSubject(false); onUpdate('subject', userSubjects[0]); }}
                            className="px-3 bg-red-50 dark:bg-red-900/20 border border-l-0 border-red-200 dark:border-red-900/50 rounded-r-xl text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                   </div>
                </div>

                {/* 2. Grade / Year */}
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <span>🎓</span> {(t as any).eduLevel || 'Grade'}
                   </label>
                   <div className="relative group">
                      <select 
                        className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
                        value={context.year}
                        onChange={e => onUpdate('year', e.target.value)}
                      >
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                   </div>
                </div>

                {/* 3. Curriculum */}
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <span>🏫</span> {(t as any).curriculum || 'Curriculum'}
                   </label>
                   <div className="relative group">
                      <select 
                        className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
                        value={context.curriculum}
                        onChange={e => onUpdate('curriculum', e.target.value)}
                      >
                        {EDUCATION_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                        {!EDUCATION_SYSTEMS.includes(context.curriculum) && (
                           <option value={context.curriculum}>{context.curriculum}</option>
                        )}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                   </div>
                </div>

                {/* 4. Language Toggle */}
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <span>🌐</span> {(t as any).language || 'Language'}
                   </label>
                   <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <button 
                        onClick={() => onUpdate('language', Language.ENGLISH)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${context.language === Language.ENGLISH ? 'bg-white dark:bg-slate-600 text-brand-600 dark:white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        English
                      </button>
                      <button 
                        onClick={() => onUpdate('language', Language.ARABIC)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${context.language === Language.ARABIC ? 'bg-white dark:bg-slate-600 text-brand-600 dark:white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        العربية
                      </button>
                   </div>
                </div>

             </div>

             <div className="mt-6 flex justify-end">
                <Button size="sm" onClick={() => setIsOpen(false)} className="px-8 shadow-md">
                   Done
                </Button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContextBar;
