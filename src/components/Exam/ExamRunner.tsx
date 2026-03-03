import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ExamSession, ExamItem, UserProfile, Difficulty, EXAM_EVENTS } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { getActiveUser } from '../../services/authService';
import { logRawActivity } from '../../services/parentService';
import { useExamBunker } from '../../hooks/useExamBunker';
import { useExamStreamer } from '../../hooks/useExamStreamer';

interface ExamRunnerProps {
    session: ExamSession;
    onComplete: (session: ExamSession) => void;
    onExit: () => void;
    bunker: ReturnType<typeof useExamBunker>;
}

const ExamRunner: React.FC<ExamRunnerProps> = ({ session: initialSession, onComplete, onExit, bunker }) => {
    // V2: Bunker Mode Authority (Single Source of Truth) - Passthrough
    const {
        bunkerState,
        isLoading: isBunkerLoading,
        recordAnswer,
        updateQuestionMaterialization, // Still needed for optimistic updates or internal logic?
        setIndex,
        finishSession,
        getTimeRemaining
    } = bunker;

    // CRASH GUARD: ExamRunner must NEVER be mounted without READY questions
    // This protects against routing violations.
    if (!bunkerState || !initialSession) return null; // Wait for loading wrapped below

    // We check this AFTER loading state is resolved
    if (!isBunkerLoading && bunkerState) {
        // Calculate ready count
        const readyCount = Object.values(bunkerState.materializedQuestions || {}).filter(m => !(m as any).isFailed).length;
        if (readyCount === 0) {
            throw new Error("VIOLATION: ExamRunner mounted with 0 READY questions. Use ExamPreparationView.");
        }
    }

    // Initialize User for Telemetry
    const [user, setUser] = useState<UserProfile | null>(null);
    useEffect(() => { getActiveUser().then(setUser); }, []);

    // NOTE: Streamer is now lifted to Orchestrator (ExamDisplay)

    // Derived Display Item (Merge Skeleton + Materallized)
    const currentIndex = bunkerState?.currentQuestionIndex || 0;
    const [localTimeRemaining, setLocalTimeRemaining] = useState(0);

    // Timer Loop
    useEffect(() => {
        const timer = setInterval(() => {
            setLocalTimeRemaining(getTimeRemaining());

            // Record Time Spent (Heartbeat)
            if (bunkerState && !bunkerState.finished) {
                const currentAtomId = initialSession.items[currentIndex].atomId;
                // recordTimeSpent(currentAtomId, 1000); // 1s tick
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [bunkerState, currentIndex, initialSession, getTimeRemaining]);

    // FILTER: validItems (Exclude explicitly failed generations)
    const validItems = useMemo(() => {
        if (!bunkerState) return [];
        return initialSession.items.filter(item => {
            const mat = bunkerState.materializedQuestions[item.atomId];
            return !mat || !(mat as any).isFailed;
        });
    }, [initialSession.items, bunkerState]);

    // Derived Display Item (Merge Skeleton + Mastered)
    const currentItem = useMemo(() => {
        if (!bunkerState || validItems.length === 0) return initialSession.items[0]; // Fallback

        // Safety Clamp
        const safeIndex = Math.min(currentIndex, validItems.length - 1);
        const skeleton = validItems[safeIndex];

        // If index was out of bounds due to filtering, we schedule a correction, 
        // but for render we just use safeIndex

        const materialized = bunkerState.materializedQuestions[skeleton.atomId];

        return {
            ...skeleton,
            question: materialized ? {
                text: materialized.text || materialized.questionText,
                options: materialized.options,
                correctAnswerIndex: materialized.correctAnswerIndex,
                isFallback: materialized.isFallback,
                // Pass through failure reason if somehow it got here (should be filtered though)
                failureReason: (materialized as any).failureReason
            } : undefined,
            status: materialized ? 'READY' : 'PENDING'
        } as ExamItem;
    }, [validItems, bunkerState, currentIndex]);

    // CLAMP INDEX EFFECT
    useEffect(() => {
        if (validItems.length > 0 && currentIndex >= validItems.length) {
            setIndex(validItems.length - 1);
        }
    }, [validItems.length, currentIndex, setIndex]);

    // KEYBOARD NAVIGATION: Enter -> Next
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (currentIndex < validItems.length - 1) {
                    setIndex(currentIndex + 1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, validItems.length, setIndex]);


    const handleAnswer = (answer: string) => {
        recordAnswer(currentItem.atomId, answer);

        // Optimistic Telemetry
        if (user) {
            logRawActivity({
                atomId: currentItem.atomId,
                studentId: user.id,
                subject: initialSession.blueprint.sourceId,
                actionName: EXAM_EVENTS.QUESTION_ANSWERED,
                timestamp: Date.now(),
                durationMs: bunkerState?.timestamps[currentItem.atomId] || 0,
                isCorrect: false // Adjusted post-recon
            }, false);
        }
    };

    if (isBunkerLoading || !bunkerState) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center animate-pulse">
                    <span className="text-4xl">🛡️</span>
                    <div className="mt-4 text-slate-500 font-bold text-sm">INITIALIZING SECURE ENVIRONMENT</div>
                </div>
            </div>
        );
    }

    const currentAnswer = bunkerState.answers[currentItem.atomId];
    const isReady = currentItem.status === 'READY';

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Sidebar (Compact) */}
            <div className="w-20 bg-white border-r border-slate-200 flex flex-col hidden md:flex items-center">
                <div className="p-4 border-b border-slate-100 w-full text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time</div>
                    <div className="text-sm font-black text-indigo-600 font-mono">
                        {Math.floor(localTimeRemaining / 60000)}:{(Math.floor((localTimeRemaining % 60000) / 1000)).toString().padStart(2, '0')}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto w-full p-2 space-y-2 custom-scrollbar">
                    {validItems.map((item, idx) => {
                        const isAnswered = !!bunkerState.answers[item.atomId];
                        const isCurrent = idx === currentIndex;
                        return (
                            <button
                                key={item.atomId}
                                onClick={() => setIndex(idx)}
                                className={`w-full aspect-square rounded-lg text-xs font-bold flex items-center justify-center transition-all relative ${isCurrent ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200' :
                                    isAnswered ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-100'
                                    }`}
                            >
                                <span>{idx + 1}</span>
                                {isAnswered && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col">
                <div className="flex-1 p-4 md:p-6 overflow-y-auto flex items-center justify-center">
                    <Card className="w-full max-w-4xl mx-auto min-h-[400px] flex flex-col p-4 md:p-6 shadow-sm">

                        {/* Stream & Freeze Waiting State */}
                        {!isReady ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 animate-pulse">
                                <div className="text-4xl mb-4">🔮</div>
                                <div className="font-medium text-lg text-slate-400">Materializing Challenge...</div>
                                <div className="text-xs mt-2 opacity-50">Stream & Freeze Engine Active</div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4 flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
                                            QUESTION {currentIndex + 1}
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-300 hidden md:block">
                                        [ID: {currentItem.atomId.substring(0, 8)}...]
                                    </div>
                                </div>

                                <h2 className="text-lg md:text-xl font-bold text-slate-800 mb-4 leading-snug">
                                    {currentItem.question?.text}
                                </h2>

                                <div className="space-y-2">
                                    {currentItem.question?.options?.map((opt, optIdx) => (
                                        <button
                                            key={optIdx}
                                            onClick={() => handleAnswer(opt)}
                                            className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center group ${currentAnswer === opt
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                                                : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50 text-slate-600'
                                                }`}
                                        >
                                            <div className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center text-[10px] font-bold ${currentAnswer === opt
                                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                                : 'border-slate-300 text-slate-400 group-hover:border-indigo-400'
                                                }`}>
                                                {String.fromCharCode(65 + optIdx)}
                                            </div>
                                            <span className="font-medium text-sm">{opt}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                    </Card>
                </div>

                {/* Action Bar */}
                <div className="p-3 md:p-4 bg-white border-t border-slate-200 flex justify-between items-center z-10 safe-area-bottom">
                    {currentIndex > 0 ? (
                        <Button variant="outline" size="sm" onClick={() => setIndex(currentIndex - 1)}>
                            ← Prev
                        </Button>
                    ) : <div></div>}

                    {/* Mobile Index Indicator */}
                    <div className="md:hidden text-xs font-bold text-slate-400">
                        {currentIndex + 1} / {validItems.length}
                    </div>

                    {currentIndex < validItems.length - 1 ? (
                        <Button size="sm" onClick={() => setIndex(currentIndex + 1)}>
                            Next (Enter) →
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200"
                            onClick={() => {
                                finishSession();
                                // Merge answers for Result View (Convert String -> Index for Scoring)
                                onComplete({
                                    ...initialSession,
                                    items: initialSession.items.map(i => {
                                        const answerStr = bunkerState.answers[i.atomId];
                                        const materialized = bunkerState.materializedQuestions[i.atomId];
                                        let answerIdx: number | undefined = undefined;

                                        if (answerStr && materialized?.options) {
                                            const foundIdx = materialized.options.indexOf(answerStr);
                                            if (foundIdx !== -1) answerIdx = foundIdx;
                                        }

                                        return {
                                            ...i,
                                            userAnswer: answerIdx, // Pass Index
                                            question: materialized // Pass generated content
                                        };
                                    })
                                });
                            }}
                        >
                            <span className="mr-2">🏁</span> Submit Exam
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ExamRunner;
