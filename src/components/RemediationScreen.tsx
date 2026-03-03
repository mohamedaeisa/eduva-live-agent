
import React, { useState, useEffect } from 'react';
import { FixStudyData, Language, RemedialContent, StrategicStep } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';

interface RemediationScreenProps {
    data: FixStudyData;
    onStartQuiz: (contentJson: string) => void;
    onBack: () => void;
    appLanguage: Language;
}

const RemediationScreen: React.FC<RemediationScreenProps> = ({ data, onStartQuiz, onBack, appLanguage }) => {
    const isArabic = appLanguage === Language.ARABIC;
    let content: RemedialContent;
    
    try {
        content = JSON.parse(data.notesContent);
    } catch (e) {
        console.error("[UCCS_FIX_LOG] RemediationScreen: Payload parse error", e);
        return <div className="p-10 text-center">System Fault: Remedial payload corrupted.</div>;
    }
    
    const isStrategic = data.repairedType === 'STRATEGIC';
    const narrativeSteps = content.narrative || [];
    const [step, setStep] = useState(1);
    const [readProgress, setReadProgress] = useState<Record<number, boolean>>({});

    const totalSteps = isStrategic ? narrativeSteps.length : 3;

    useEffect(() => {
        console.log(`[UCCS_FIX_LOG] RemediationScreen: Screen Loaded. Mode: ${data.repairedType} for ${data.conceptTag}`);
    }, [data.repairedType, data.conceptTag]);

    const handleAcknowledge = (s: number) => {
        console.log(`[UCCS_FIX_LOG] RemediationScreen: Step ${s} Acknowledged.`);
        const nextReadProgress = { ...readProgress, [s]: true };
        setReadProgress(nextReadProgress);
        
        if (s < totalSteps) {
            setStep(s + 1);
        }
    };

    const handleUnlockMastery = () => {
        console.log(`[UCCS_FIX_LOG] RemediationScreen: User clicked Unlock Mastery. Transitioning to QUIZ mode.`);
        onStartQuiz(data.notesContent);
    };

    // --- STRATEGIC RENDERER (Linear Path) ---
    const renderStrategicStep = (currentStep: StrategicStep, idx: number) => (
        <div key={idx} className="animate-slide-up space-y-8">
            <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm border ${
                    currentStep.phase?.includes('Foundation') ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                    currentStep.phase?.includes('Projection') ? 'bg-amber-50 border-amber-100 text-amber-600' :
                    'bg-indigo-50 border-indigo-100 text-indigo-600'
                }`}>
                    {currentStep.phase?.includes('Foundation') ? '🧱' : currentStep.phase?.includes('Projection') ? '🔭' : '🔗'}
                </div>
                <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{currentStep.phase} Phase</h4>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">{currentStep.title}</h3>
                </div>
            </div>

            <div className="space-y-6">
                <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                    {currentStep.content}
                </p>
                
                <div className="bg-amber-50/50 dark:bg-amber-900/10 p-6 rounded-[2rem] border border-amber-100 dark:border-amber-800/50 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 text-6xl group-hover:rotate-12 transition-transform">💡</div>
                    <h5 className="text-[9px] font-black uppercase text-amber-600 tracking-widest mb-2 flex items-center gap-2">
                        <span>Real-World Projection</span>
                    </h5>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 italic leading-relaxed">
                        "{currentStep.projection}"
                    </p>
                </div>
            </div>
        </div>
    );

    // --- ATOMIC RENDERER (3-Card) ---
    const renderAtomicStep = (stepNum: number) => {
        if (stepNum === 1) return (
            <div className="animate-slide-up space-y-6">
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-amber-100/50">💡</div>
                <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.3em]">Card 1: Think of it this way</h3>
                    <p className="text-2xl md:text-3xl font-bold text-slate-700 dark:text-slate-200 leading-[1.4] italic">
                        "{content.analogy}"
                    </p>
                </div>
            </div>
        );
        if (stepNum === 2) return (
            <div className="animate-slide-up space-y-8">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-indigo-100/50">🧠</div>
                <div className="space-y-6">
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.3em]">Card 2: The Why & The How</h3>
                    <p className="text-xl md:text-2xl font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
                        {content.explanation}
                    </p>
                </div>
            </div>
        );
        return (
            <div className="animate-slide-up space-y-8">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-emerald-100/50">🚀</div>
                <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.3em]">Card 3: New Scenarios</h3>
                    <div className="grid grid-cols-1 gap-4">
                        {content.examples?.map((ex, i) => (
                            <div key={i} className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-100">
                                <p className="text-sm font-black text-slate-800 dark:text-white uppercase mb-2">Scenario {i+1}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium italic">"{ex.scenario}" → {ex.application}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const isLastStepRead = readProgress[totalSteps];
    
    // UCCS 6.5: Display SANITATION - FALLBACK to Subject name if Topic is generic wrapper
    const displaySubject = data.conceptTag?.toLowerCase().includes('generated quiz') ? data.subject : data.conceptTag;

    return (
        <div className="max-w-2xl mx-auto py-12 px-4 animate-fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="flex justify-between items-center mb-8">
                <button 
                    onClick={onBack} 
                    className="text-slate-400 hover:text-red-500 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                    <span className="text-sm">✕</span> {isArabic ? 'إلغاء المهمة' : 'Abort Mission'}
                </button>
                <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                        {Array.from({length: totalSteps}).map((_, i) => (
                            <div 
                                key={i} 
                                className={`h-1.5 rounded-full transition-all duration-700 ${
                                    step === (i+1) ? (isStrategic ? 'w-8 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'w-8 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]') : 
                                    readProgress[i+1] ? 'w-4 bg-emerald-500' : 'w-4 bg-slate-200 dark:bg-slate-800'
                                }`}
                            ></div>
                        ))}
                    </div>
                </div>
            </div>

            <Card className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border-0 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-50 dark:bg-slate-800/50">
                    <div 
                        className={`h-full transition-all duration-1000 ease-out ${isStrategic ? 'bg-indigo-600' : 'bg-orange-500'}`} 
                        style={{ width: `${(step / totalSteps) * 100}%` }}
                    ></div>
                </div>

                <div className="p-8 md:p-12">
                    <div className="mb-10">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border mb-4 inline-block ${
                            isStrategic ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                        }`}>
                            {isStrategic ? 'Strategic Rescue Mission' : 'Surgical Concept Repair'}
                        </span>
                        <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white leading-tight">
                            {isStrategic ? (isArabic ? 'إنقاذ دراسي: ' : 'Rescue Mission: ') : (isArabic ? 'إصلاح المفهوم: ' : 'Concept Repair: ')}
                            <span className={`${isStrategic ? 'text-indigo-600' : 'text-orange-600'} italic block mt-1`}>
                                {isStrategic ? data.subject : displaySubject}
                            </span>
                        </h2>
                    </div>

                    <div className="min-h-[350px] flex flex-col justify-center">
                        {isStrategic ? (
                            narrativeSteps[step - 1] && renderStrategicStep(narrativeSteps[step - 1], step - 1)
                        ) : (
                            renderAtomicStep(step)
                        )}
                    </div>

                    <div className="mt-12 pt-10 border-t border-slate-50 dark:border-slate-800">
                        {step < totalSteps || !isLastStepRead ? (
                            <button 
                                onClick={() => handleAcknowledge(step)}
                                className={`w-full py-6 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-xs transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-4 group ${
                                    isStrategic ? 'bg-indigo-900 text-white dark:bg-white dark:text-indigo-900' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                }`}
                            >
                                {isArabic ? 'فهمت هذا الجزء' : 'I get this part'}
                                <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
                            </button>
                        ) : (
                            <div className="space-y-6 animate-slide-up">
                                <div className={`p-5 rounded-2xl flex items-start gap-4 border ${
                                    isStrategic ? 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/10' : 'bg-orange-50 border-orange-100 dark:bg-orange-900/10'
                                }`}>
                                    <span className="text-2xl mt-1">🔒</span>
                                    <div>
                                        <p className={`text-xs font-black uppercase tracking-widest mb-1 ${isStrategic ? 'text-indigo-700' : 'text-orange-700'}`}>
                                            {isStrategic ? 'Strategic Mastery Gate' : 'Atomic Mastery Gate'}
                                        </p>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                            {isStrategic 
                                                ? "Structural thread complete. Now prove you've connected all failing dots to close the mission."
                                                : "Foundations rebuilt. Now prove your understanding to close the repair mission."}
                                        </p>
                                    </div>
                                </div>
                                <Button 
                                    onClick={handleUnlockMastery}
                                    className={`w-full py-6 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-xs shadow-2xl border-none transition-all hover:scale-[1.02] active:scale-95 ${
                                        isStrategic ? 'bg-gradient-to-r from-indigo-600 to-indigo-500' : 'bg-gradient-to-r from-orange-600 to-orange-500'
                                    }`}
                                >
                                    Unlock Mastery Challenge 🔓
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <div className="mt-8 text-center opacity-30">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.4em]">
                    UCCS CLIP Protocol v6.5 • Mission ID: {data.fixMissionId.slice(-8)}
                </p>
            </div>
        </div>
    );
};

export default RemediationScreen;
