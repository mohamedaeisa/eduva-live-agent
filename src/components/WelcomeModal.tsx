
import React, { useState } from 'react';
import { EducationSystem, Language } from '../types';
import { YEARS, EDUCATION_SYSTEMS, SUBJECTS } from '../constants';
import { db } from '../services/firebaseConfig';
import Button from './ui/Button';
import Card from './ui/Card';
import firebase from 'firebase/compat/app';

interface WelcomeModalProps {
  onComplete: (year: string, curriculum: EducationSystem, subjects: string[]) => void;
  appLanguage: Language;
  userId: string;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onComplete, appLanguage, userId }) => {
  const [year, setYear] = useState(YEARS[9]); // Default to Grade 10
  const [curriculum, setCurriculum] = useState(EducationSystem.NEIS);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([SUBJECTS[0]]);
  const [currentSubject, setCurrentSubject] = useState(SUBJECTS[0]);
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);

  const isArabic = appLanguage === Language.ARABIC;

  const handleAddSubject = () => {
    const subjToAdd = isCustomSubject ? customSubjectText.trim() : currentSubject;
    if (subjToAdd && !selectedSubjects.includes(subjToAdd)) {
        setSelectedSubjects(prev => [...prev, subjToAdd]);
        if (isCustomSubject) setCustomSubjectText('');
    }
  };

  const handleRemoveSubject = (subj: string) => {
    setSelectedSubjects(prev => prev.filter(s => s !== subj));
  };

  const handleSubmit = async () => {
    setIsInitializing(true);
    let finalSubjects = [...selectedSubjects];
    if (finalSubjects.length === 0) {
        const fallback = isCustomSubject ? customSubjectText.trim() : currentSubject;
        if (fallback) finalSubjects.push(fallback);
        else finalSubjects.push(SUBJECTS[0]);
    }

    try {
        // --- UCCS SEEDING PROTOCOL ---
        // Initialize placeholder health docs so queries return them immediately
        const batch = db.batch();
        finalSubjects.forEach(subjectName => {
            const docRef = db.collection('student_decisions').doc(userId).collection('subjects').doc(subjectName);
            batch.set(docRef, {
                subjectId: subjectName,
                studentId: userId,
                overallStatus: 'GOOD',
                confidenceScore: 0, // Day 0
                trend: 'STABLE',
                primaryRiskTopic: 'Neural Bridge Ready',
                cause: 'Awaiting first study session',
                sparkline: [0],
                hoursLogged: 0,
                lastEvaluatedAt: Date.now()
            }, { merge: true });
        });
        await batch.commit();
        
        onComplete(year, curriculum, finalSubjects);
    } catch (e) {
        console.error("Matrix seeding failed", e);
        onComplete(year, curriculum, finalSubjects);
    } finally {
        setIsInitializing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 animate-fade-in overflow-y-auto">
        <div className="w-full max-w-xl my-auto">
            <Card className="w-full bg-white dark:bg-slate-900 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.5)] border-t-8 border-brand-500 rounded-[3rem] p-8 md:p-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] text-[15rem] pointer-events-none select-none">🎓</div>
                
                <div className="relative z-10">
                    <div className="text-center mb-10">
                        <div className="w-20 h-20 bg-brand-50 dark:bg-brand-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner animate-float">
                            <span className="text-4xl">🚀</span>
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">
                            {isArabic ? 'لنبدأ رحلتك' : "Initialize Learning"}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                            {isArabic ? 'إعداد ملفك الشخصي الأول' : 'System Configuration v1.0'}
                        </p>
                    </div>
                    
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest ml-1">
                                    {isArabic ? 'السنة الدراسية' : 'Grade / Year'}
                                </label>
                                <select 
                                    className="w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 dark:text-white font-bold outline-none focus:border-brand-500 transition-all shadow-inner"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                >
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest ml-1">
                                    {isArabic ? 'المنهج الدراسي' : 'Curriculum'}
                                </label>
                                <select 
                                    className="w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 dark:text-white font-bold outline-none focus:border-brand-500 transition-all shadow-inner"
                                    value={curriculum}
                                    onChange={(e) => setCurriculum(e.target.value as EducationSystem)}
                                >
                                    {EDUCATION_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">
                                {isArabic ? 'المواد الدراسية المستهدفة' : 'Primary Target Subjects'}
                            </label>
                            
                            <div className="flex gap-2">
                                {!isCustomSubject ? (
                                    <div className="relative flex-grow">
                                        <select 
                                            className="w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 dark:text-white font-bold outline-none focus:border-brand-500 transition-all shadow-inner"
                                            value={currentSubject}
                                            onChange={(e) => setCurrentSubject(e.target.value)}
                                        >
                                            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <input 
                                        className="flex-grow p-4 rounded-2xl border-2 border-brand-500 bg-white dark:bg-slate-950 dark:text-white font-bold outline-none ring-4 ring-brand-500/10"
                                        placeholder={isArabic ? "ادخل اسم المادة..." : "Enter subject name..."}
                                        value={customSubjectText}
                                        onChange={e => setCustomSubjectText(e.target.value)}
                                        autoFocus
                                    />
                                )}
                                <button 
                                    type="button" 
                                    onClick={handleAddSubject}
                                    className="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border-2 bg-brand-50 text-brand-600 border-brand-200 transition-all shadow-md active:scale-90 hover:bg-brand-100"
                                >
                                    <span className="text-2xl">+</span>
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setIsCustomSubject(!isCustomSubject)}
                                    className={`w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border-2 transition-all shadow-md active:scale-90 ${isCustomSubject ? 'bg-red-50 text-red-500 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                >
                                    <span className="text-xl">{isCustomSubject ? '✕' : '✏️'}</span>
                                </button>
                            </div>

                            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl min-h-[80px] flex flex-wrap gap-2">
                                {selectedSubjects.length > 0 ? selectedSubjects.map(s => (
                                    <div key={s} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 px-4 py-2 rounded-xl flex items-center gap-2 font-bold animate-pop border border-indigo-100 dark:border-indigo-800 shadow-sm text-sm">
                                        {s}
                                        <button 
                                            type="button" 
                                            onClick={() => handleRemoveSubject(s)}
                                            className="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 flex items-center justify-center text-[10px] hover:bg-red-500 hover:text-white transition-colors"
                                        >✕</button>
                                    </div>
                                )) : (
                                    <div className="w-full flex items-center justify-center text-slate-400 font-bold italic text-xs">
                                        {isArabic ? 'لم يتم إضافة مواد بعد' : 'No subjects added yet.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-6">
                            <Button onClick={handleSubmit} isLoading={isInitializing} className="w-full py-6 text-sm font-black uppercase tracking-[0.3em] shadow-2xl shadow-brand-500/30 rounded-3xl">
                                {isArabic ? 'تفعيل النظام 🚀' : 'Initialize Core 🚀'}
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    </div>
  );
};

export default WelcomeModal;
