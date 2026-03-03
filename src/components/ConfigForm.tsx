
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GenerationRequest, EducationSystem, Language, Difficulty, DetailLevel, QuizType, UserProfile, AppView, LibraryItem, CoverageRule, ParentNudge, LocalTrainingSource } from '../types';
import { TRANSLATIONS, SUBJECTS, YEARS, EDUCATION_SYSTEMS } from '../constants';
import Button from './ui/Button';
import { getLibraryItems, getLocalTrainingSources } from '../services/storageService';
import { getActiveCoverageRules, getActiveStudentNudges } from '../services/parentService';

interface ConfigFormProps {
  onSubmit: (data: GenerationRequest) => void;
  isLoading: boolean;
  loadingStatus?: string;
  appLanguage: Language;
  user: UserProfile;
  prefill?: Partial<GenerationRequest>;
  onNavigate: (view: AppView) => void;
  onOpenLibrary?: (tab: 'uploads' | 'generated') => void;
  onContinue?: (item: any) => void;
  studyContext: any; 
}

const ConfigForm: React.FC<ConfigFormProps> = ({ onSubmit, isLoading, appLanguage, user, onNavigate }) => {
  const t = TRANSLATIONS[appLanguage];

  const [activeTab, setActiveTab] = useState('Create');
  const [selectedTool, setSelectedTool] = useState<string | null>(null); 
  const [coverageRules, setCoverageRules] = useState<CoverageRule[]>([]);

  const userSubjects = user.preferences.subjects || [user.preferences.defaultSubject || SUBJECTS[0]];

  const [formData, setFormData] = useState<GenerationRequest>({
    year: user.preferences.defaultYear,
    curriculum: user.preferences.defaultCurriculum,
    subject: user.preferences.defaultSubject || userSubjects[0],
    topic: '',
    mode: 'study-with-me',
    language: user.preferences.defaultLanguage,
    difficulty: Difficulty.MEDIUM,
    detailLevel: DetailLevel.DETAILED,
    quizType: QuizType.MCQ,
    questionCount: 12
  });

  const [customSubjectInput, setCustomSubjectInput] = useState('');

  const currentSubject = useMemo(() => customSubjectInput || formData.subject, [customSubjectInput, formData.subject]);

  const isSubjectSuspended = useMemo(() => {
    return coverageRules.some(r => r.subject.toLowerCase() === currentSubject.toLowerCase() && r.status === 'LOCKED');
  }, [coverageRules, currentSubject]);

  useEffect(() => {
    const fetchParentData = async () => {
        try {
            const [rules] = await Promise.all([
                getActiveCoverageRules(user.id)
            ]);
            setCoverageRules(rules);
        } catch (error: any) {
            console.error("Failed to fetch parent data:", error);
        }
    };
    if (selectedTool) fetchParentData();
  }, [user.id, selectedTool, currentSubject]);

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      year: user.preferences.defaultYear,
      curriculum: user.preferences.defaultCurriculum,
      subject: user.preferences.defaultSubject || userSubjects[0],
      language: user.preferences.defaultLanguage
    }));
  }, [user, userSubjects]);

  const handleToolClick = async (toolId: string) => {
    if (toolId === 'adaptive_quiz') {
        onNavigate(AppView.ADAPTIVE_QUIZ);
        return;
    }
    if (toolId === 'study_notes_assembler') {
        onNavigate(AppView.STUDY_NOTES_ASSEMBLER);
        return;
    }
    if (toolId.startsWith('library_') || toolId === 'atom_training') {
        onNavigate(AppView.LIBRARY);
        return;
    }
    handleChange('mode', toolId);
    setSelectedTool(toolId);
  };

  const closeModal = () => {
    setSelectedTool(null);
    setFormData(prev => ({ ...prev, topic: '', fileName: undefined, studyMaterialFile: undefined, studyMaterialUrl: undefined }));
    setCustomSubjectInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubjectSuspended) return; 

    let currentRequest = { ...formData };
    
    if (customSubjectInput.trim()) {
        currentRequest.subject = customSubjectInput.trim();
    }

    onSubmit(currentRequest);
    closeModal();
  };

  const handleChange = (field: keyof GenerationRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const GRID_ITEMS = [
    { id: 'study-with-me', icon: '📚', label: "Study Part", category: 'Create', color: 'bg-indigo-50 text-indigo-600' },
    { id: 'podcast', icon: '🎧', label: (t as any).modePodcast || 'Podcast', category: 'Create', color: 'bg-purple-50 text-purple-600' },
    { id: 'study_notes_assembler', icon: '🏗️', label: "Note Assembler", category: 'Create', color: 'bg-blue-50 text-blue-600' },
    { id: 'lazy', icon: '📺', label: (t as any).modeLazy || 'Lazy Mode', category: 'Create', color: 'bg-red-50 text-red-600' },
    { id: 'adaptive_quiz', icon: '🎯', label: "Practice Matrix", category: 'Practice', color: 'bg-emerald-50 text-emerald-600' },
    { id: 'quiz', icon: '⚡️', label: (t as any).modeQuiz || 'Quiz', category: 'Practice', color: 'bg-amber-50 text-amber-600' },
    { id: 'exam-generator', icon: '📝', label: (t as any).modeExam || 'Exam', category: 'Practice', color: 'bg-red-50 text-red-600' },
    { id: 'library_uploads', icon: '📂', label: "My Library", category: 'Library', color: 'bg-blue-50 text-blue-600' }
  ];

  const categories = ['Create', 'Practice', 'Library'];
  const filteredItems = GRID_ITEMS.filter(i => i.category === activeTab);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in pb-24 px-4">
      <div className="flex justify-between items-end mb-6 mt-4">
        <div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-none">Hi, {(user?.name || 'Student').toString().split(' ')[0]}</h2>
        </div>
        <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-3 py-1 rounded-full text-xs font-bold border border-orange-100 dark:border-orange-900/30">
           <span>🔥</span> <span>{user.gamification.streak}</span>
        </div>
      </div>

      <div className="w-full mb-8 relative z-10">
        <div className="relative flex p-1.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700">
           {categories.map((cat) => (
              <button 
                key={cat} 
                onClick={() => setActiveTab(cat)} 
                className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === cat ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {cat}
              </button>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredItems.map(item => (
          <button key={item.id} onClick={() => handleToolClick(item.id)} className={`flex flex-col items-center justify-center p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-300 transition-all group aspect-[4/3]`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 ${item.color} group-hover:scale-110 transition-transform`}>{item.icon}</div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 text-center">{item.label}</span>
          </button>
        ))}
      </div>

      {selectedTool && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={closeModal}>
          <div className="bg-white dark:bg-slate-800 w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-slide-up border border-slate-100 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900/50">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-2xl">{GRID_ITEMS.find(i => i.id === selectedTool)?.icon}</div>
                 <div>
                   <h3 className="text-lg font-black text-slate-800 dark:text-white">{GRID_ITEMS.find(i => i.id === selectedTool)?.label}</h3>
                   <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Setup Session</p>
                 </div>
               </div>
               <button onClick={closeModal} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors">✕</button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
               <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-6">
                        <div className="space-y-4 animate-fade-in">
                            <h4 className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 text-[10px] font-black uppercase tracking-widest border border-cyan-100 dark:border-cyan-800 shadow-sm">
                                <span className="w-4 h-4 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[8px]">1</span>
                                STEP 1: SELECT SUBJECT
                            </h4>
                            <select 
                                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-sm font-bold"
                                value={formData.subject}
                                onChange={e => handleChange('subject', e.target.value)}
                            >
                                {userSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="space-y-4">
                            <h4 className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-800 shadow-sm">
                                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[8px]">2</span>
                                STEP 2: SOURCE MATERIAL
                            </h4>
                            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 space-y-6">
                                <input 
                                    className="w-full p-4 rounded-xl border-2 transition-all text-sm font-bold" 
                                    placeholder="Type a specific topic..." 
                                    value={formData.topic} 
                                    onChange={e => handleChange('topic', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                  <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancel</Button>
                    <Button type="submit" className="flex-[2] bg-gradient-to-r from-brand-600 to-indigo-600" isLoading={isLoading}>Generate Now</Button>
                  </div>
               </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigForm;
