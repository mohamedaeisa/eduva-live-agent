import React, { useState } from 'react';
import { QuizQuestion, Language, QuestionResult, GenerationRequest, UserProfile } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';

interface DebriefViewProps {
    results: QuestionResult[];
    questions: QuizQuestion[];
    appLanguage: Language;
    user: UserProfile;
    onBack: () => void;
    onRetry: () => void;
    onGapCloser: () => void;
}

const DebriefView: React.FC<DebriefViewProps> = ({ 
    results, questions, appLanguage, user, onBack, onRetry, onGapCloser 
}) => {
    const isArabic = appLanguage === Language.ARABIC;
    const score = results.filter(r => r.isCorrect).length;
    const total = questions.length;
    const percentage = Math.round((score / total) * 100);
    const avgTime = Math.round(results.reduce((acc, curr) => acc + curr.responseTimeSec, 0) / results.length);

    return (
        <div className="max-w-xl mx-auto py-10 px-4 animate-fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="text-center mb-12">
                <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full mx-auto mb-6 flex items-center justify-center text-5xl shadow-xl border-4 border-indigo-500">
                    {percentage >= 80 ? '🏆' : percentage >= 50 ? '📈' : '🧩'}
                </div>
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                    {isArabic ? 'ملخص الإتقان' : 'Mastery Debrief'}
                </h1>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-2">
                    {isArabic ? 'تمت مزامنة البيانات العصبية' : 'Neural Data Synchronized'}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <Card className="text-center p-6 bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-800/50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accuracy</p>
                    <p className="text-3xl font-black text-indigo-600">{percentage}%</p>
                </Card>
                <Card className="text-center p-6 bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Velocity</p>
                    <p className="text-3xl font-black text-emerald-600">{avgTime}s/q</p>
                </Card>
            </div>

            {/* AI Insights Section */}
            <div className="mb-10 space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                   <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span> AI Analysis
                </h3>
                <Card className="bg-slate-900 text-white border-0 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">🤖</div>
                    <p className="text-lg font-bold leading-relaxed italic pr-8">
                        {percentage >= 80 
                            ? "Core foundations are extremely stable. I recommend advancing to Expert level logic."
                            : "Minor friction detected in terminology precision. A quick gap-closer session will seal this knowledge."}
                    </p>
                </Card>
            </div>

            {/* Strategic Pathing */}
            <div className="space-y-3">
                {percentage < 100 && (
                    <button 
                        onClick={onGapCloser}
                        className="w-full py-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-orange-500/20 transition-all flex items-center justify-center gap-3"
                    >
                        <span>🎯</span> Fix Mistakes (Gap Closer)
                    </button>
                )}
                <button 
                    onClick={onRetry}
                    className="w-full py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-indigo-500/20 transition-all"
                >
                    Quick Re-Try (Shuffle Bank)
                </button>
                <button 
                    onClick={onBack}
                    className="w-full py-5 rounded-2xl bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 font-black uppercase tracking-[0.2em] text-xs border border-slate-100 transition-all"
                >
                    Return to Mission Hub
                </button>
            </div>
        </div>
    );
};

export default DebriefView;