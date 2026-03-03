import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QuizQuestion, Language, QuestionResult } from '../types';
import Button from './ui/Button';

interface QuizArenaProps {
    questions: QuizQuestion[];
    appLanguage: Language;
    onFinish: (results: QuestionResult[]) => void;
    onBack: () => void;
}

const QuizArena: React.FC<QuizArenaProps> = ({ questions, appLanguage, onFinish, onBack }) => {
    const [qStack, setQStack] = useState<QuizQuestion[]>(questions);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [results, setResults] = useState<QuestionResult[]>([]);
    const [timer, setTimer] = useState(15);
    const [isComplete, setIsComplete] = useState(false);
    const [showExplanation, setShowExplanation] = useState(false);

    const timerRef = useRef<any>(null);

    useEffect(() => {
        startTimer();
        return () => clearInterval(timerRef.current);
    }, [currentIdx]);

    const startTimer = () => {
        setTimer(15);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    handleAnswer(null, false); // Timeout counts as wrong
                    return 15;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleAnswer = (choice: string | null, correct: boolean) => {
        const result: QuestionResult = {
            response: choice,
            isCorrect: correct,
            responseTimeSec: 15 - timer,
            hintsUsedCount: 0,
            masteryDelta: correct ? 0.1 : -0.15
        };

        const newResults = [...results, result];
        setResults(newResults);

        if (!correct) {
            // SR Logic: Re-queue the card 3 slots ahead
            const currentQ = qStack[currentIdx];
            const newStack = [...qStack];
            const targetPos = Math.min(newStack.length, currentIdx + 4);
            newStack.splice(targetPos, 0, currentQ);
            setQStack(newStack);
        }

        if (currentIdx < qStack.length - 1) {
            setCurrentIdx(prev => prev + 1);
        } else {
            setIsComplete(true);
            onFinish(newResults);
        }
    };

    const q = qStack[currentIdx];

    return (
        <div className="fixed inset-0 bg-[#0F172A] z-[500] text-white animate-fade-in flex flex-col font-sans overflow-hidden pt-safe">
            {/* Top HUD - Optimized for mobile visibility */}
            <div className="p-4 md:p-8 flex justify-between items-center relative z-10">
               <div className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/5">
                  <span className="text-lg">⏱</span>
                  <span className={`text-xl font-mono font-black ${timer < 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    00:{timer.toString().padStart(2, '0')}
                  </span>
               </div>
               
               <button onClick={onBack} className="bg-slate-800 px-4 py-2 rounded-full border border-slate-700 shadow-lg text-slate-400 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                   QUIT MISSION
               </button>
            </div>

            {/* Progress line */}
            <div className="w-full h-1.5 bg-slate-800">
               <div className="h-full bg-cyan-400 transition-all duration-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]" style={{ width: `${((currentIdx + 1) / qStack.length) * 100}%` }} />
            </div>

            {/* Main Arena */}
            <div className="flex-grow flex flex-col items-center justify-center px-6 md:px-8 text-center pb-32 overflow-y-auto custom-scrollbar pt-10">
                <div className="bg-indigo-900/40 text-indigo-400 px-6 py-2.5 rounded-full font-black text-[10px] uppercase tracking-[0.3em] mb-6 md:mb-10 border border-indigo-500/30 shadow-lg">
                    {q.topic}
                </div>

                <h2 className="text-2xl md:text-5xl font-black tracking-tight mb-4 md:mb-8 leading-tight max-w-3xl">
                    {q.question}
                </h2>
                
                <p className="text-slate-500 text-sm md:text-xl font-bold mb-10 md:mb-20 max-w-2xl italic opacity-60">
                    Which describes the logic path?
                </p>

                <div className="w-full max-w-xl space-y-3 md:space-y-4">
                    {q.options?.map((opt, i) => (
                        <button 
                            key={i}
                            onClick={() => handleAnswer(opt, opt === q.correctAnswer)}
                            className="w-full group relative overflow-hidden bg-slate-900/50 hover:bg-indigo-900/30 border-2 border-slate-800 hover:border-indigo-500 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-left transition-all active:scale-95 shadow-sm"
                        >
                            <div className="flex items-center gap-4 md:gap-6">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl border-2 border-slate-700 flex items-center justify-center font-black text-slate-500 group-hover:border-indigo-500 group-hover:text-indigo-400 transition-all">
                                    {String.fromCharCode(65 + i)}
                                </div>
                                <span className="text-base md:text-xl font-bold text-slate-300 group-hover:text-white transition-colors">{opt}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Bar - Lifted for mobile navigation */}
            <div className="fixed bottom-20 md:bottom-0 left-0 right-0 p-6 md:p-8 grid grid-cols-2 gap-4 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50 z-20 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
               <button className="bg-slate-800 p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center gap-3 font-black uppercase tracking-widest text-[10px] border border-slate-700 hover:bg-slate-700 transition-colors shadow-lg active:scale-95">
                  <span className="text-yellow-500 text-lg">⚡</span> 50/50
               </button>
               <button 
                 onClick={() => setShowExplanation(true)}
                 className="bg-slate-800 p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center gap-3 font-black uppercase tracking-widest text-[10px] border border-slate-700 hover:bg-slate-700 transition-colors shadow-lg active:scale-95"
               >
                  <span className="text-blue-400 text-lg">💡</span> Explain
               </button>
            </div>

            {/* SR Feedback Drawer */}
            {showExplanation && (
                <div className="fixed inset-x-0 bottom-0 z-[600] animate-slide-up">
                    <div className="bg-white text-slate-900 p-8 md:p-12 rounded-t-[3rem] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] border-t border-slate-100">
                        <div className="flex justify-between items-center mb-8">
                           <div className="flex items-center gap-3">
                              <span className="text-2xl">🤖</span>
                              <h4 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Neural Diagnosis</h4>
                           </div>
                           <button onClick={() => setShowExplanation(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all active:scale-90">✕</button>
                        </div>
                        <p className="text-xl md:text-2xl font-black leading-relaxed mb-8 italic text-slate-800 tracking-tight">
                           {q.explanation}
                        </p>
                        <div className="bg-indigo-50 p-6 rounded-[1.5rem] border border-indigo-100 shadow-inner">
                           <p className="text-[10px] font-black uppercase text-indigo-600 mb-2 tracking-widest">Logic Anchor</p>
                           <p className="text-sm font-bold text-slate-600 leading-relaxed italic">{q.explanation}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuizArena;