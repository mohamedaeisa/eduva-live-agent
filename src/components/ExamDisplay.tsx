
import React, { useState, useEffect } from 'react';
import { ExamData, Language, ExamBlueprint, ExamSession, UserProfile } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import { getActiveUser } from '../services/authService';
import { logRawActivity } from '../services/parentService';

import { saveExamResult, saveGrowthSnapshot, updateMasteryBatch, completeMicroLoopSession } from '../services/storageService';
import { createExamSkeleton, generateMicroLoop } from '../services/ai/examService';
import { computeExamResult, generateGrowthSnapshot } from '../services/scoring/scoringService';
import { ExamResult, GrowthSnapshot } from '../services/scoring/types';
import { monetizationClient } from '../services/monetization/client';

// V2 Hooks (Hoisted)
import { useExamBunker } from '../hooks/useExamBunker';
import { useExamStreamer } from '../hooks/useExamStreamer';

// New Stage 2 & 3 Components
import ExamIntentBuilder from './Exam/ExamIntentBuilder';
import ExamBlueprintPreview from './Exam/ExamBlueprintPreview';
import ExamRunner from './Exam/ExamRunner';
import ExamPreparationView from './Exam/ExamPreparationView';
import ExamResultsView from './Exam/Results/ExamResultsView';
import GrowthMirrorView from './Exam/Results/GrowthMirrorView';

interface ExamDisplayProps {
    data: ExamData;
    onBack: () => void;
    appLanguage: Language;
    contentLanguage?: Language;
    user?: UserProfile;
}

// ------------------------------------------------------------------
// ORCHESTRATOR
// ------------------------------------------------------------------

const ExamDisplay: React.FC<ExamDisplayProps> = (props) => {
    // Stage Management
    // LEGACY: Old static exam viewer
    // INTENT: New V2 Flow Start
    // BLUEPRINT: Blueprint review
    // PREPARING: (NEW) "Session Lobby", shows generation progress
    // SESSION_RUNNING: Actual ExamRunner
    // RESULTS: Post-exam (Immediate)
    // RESULTS_MIRROR: Deep dive
    const [stage, setStage] = useState<'LEGACY' | 'INTENT' | 'BLUEPRINT' | 'PREPARING' | 'SESSION_RUNNING' | 'RESULTS' | 'RESULTS_MIRROR'>('LEGACY');

    const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
    const [session, setSession] = useState<ExamSession | null>(null);
    const [examResult, setExamResult] = useState<ExamResult | null>(null);
    const [growthSnapshot, setGrowthSnapshot] = useState<GrowthSnapshot | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);

    // V2: Bunker (State Authority) - Hoisted to Orchestrator
    const bunker = useExamBunker(session?.id, session?.blueprint.config.durationMinutes);

    // V2: Streamer (Background Materialization) - Triggered when session exists
    // We pass the update function from bunker so streamer can feed it.
    const [activeUser, setActiveUser] = useState<UserProfile | null>(props.user || null);

    useEffect(() => {
        if (!props.user) getActiveUser().then(setActiveUser);
    }, [props.user]);

    useExamStreamer(session, activeUser, bunker.updateQuestionMaterialization, bunker.markGenerationComplete);

    useEffect(() => {
        // Detection Logic:
        const isDummy = !props.data || (props.data as any).id === 'exam_demo' || (props.data as any).id === 'dummy_exam' || (!props.data.sections || props.data.sections.length === 0);

        if (isDummy) {
            setStage('INTENT');
        } else {
            setStage('LEGACY');
        }
    }, [props.data]);

    const handleBlueprintGenerated = (bp: ExamBlueprint) => {
        setBlueprint(bp);
        setStage('BLUEPRINT');
    };

    const handleSessionInit = async (finalBlueprint: ExamBlueprint) => {
        setIsInitializing(true);
        try {
            const user = await getActiveUser();
            const newSession = await createExamSkeleton(finalBlueprint, user || { id: 'anon', name: 'Student' } as any);
            setSession(newSession);

            // ✅ QUOTA: Explicit Increment on Success
            await monetizationClient.incrementUsage('examsUsed');

            // Initialize Bunker immediately with Skeleton
            await bunker.initializeBunker(newSession);

            // Navigate to Preparation View (instead of generic lobby)
            setStage('PREPARING');
        } catch (e) {
            console.error("Session Init Failed", e);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleStartExam = () => {
        setStage('SESSION_RUNNING');
    };

    // STAGE 6: MICRO-LOOP TRIGGER
    const handleStartMicroLoop = async (atomId: string) => {
        if (!activeUser || !session) return;
        setIsInitializing(true);

        try {
            // Lazy load the service to keep bundle light if possible, or just import
            const { generateMicroLoop } = await import('../services/ai/examService');

            // 1. Generate Loop (Wait for AI) - It's small (1 batch), so we wait.
            // In future we could stream, but for 3 items simpler to block with spinner.
            const loopSession = await generateMicroLoop(atomId, activeUser, session.id);

            // 2. Wrap as ExamSession for Runner compatibility
            const loopExamSession: ExamSession = {
                id: loopSession.id,
                blueprint: {
                    ...session.blueprint,
                    id: `bp_${loopSession.id}`,
                    title: "Surgical Micro-Loop",
                    sections: [{
                        id: 'micro_loop_sec',
                        title: 'Micro-Loop',
                        atomProfile: {
                            bloomLevel: 'APPLICATION',
                            tags: ['correction'],
                            type: 'MCQ',
                            complexity: 'MEDIUM'
                        },
                        count: loopSession.questions.length,
                        description: 'Focused correction loop',
                        marksPerQuestion: 10
                    }]
                },
                studentId: loopSession.userId,
                startedAt: loopSession.startedAt,
                status: 'IN_PROGRESS',
                items: loopSession.questions,
                eiAuditLog: []
            };

            setSession(loopExamSession);
            await bunker.initializeBunker(loopExamSession);
            setStage('SESSION_RUNNING'); // Jump straight to runner

        } catch (e) {
            console.error("Micro-Loop Generation Failed", e);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleExamComplete = async (completedSession: ExamSession) => {
        setSession(completedSession);

        // 1. Compute Result (Standard & Loop)
        const result = computeExamResult(completedSession);

        // STAGE 6 CHECK: Is this a Micro-Loop?
        if (completedSession.id.startsWith('loop_')) {
            const correctCount = result.correct;
            const totalCount = result.evaluated;

            // Reconstruct Minimal MicroLoopSession wrapper for safety
            const microLoop: any = {
                id: completedSession.id,
                userId: completedSession.studentId,
                atomId: completedSession.items[0]?.atomId || 'unknown',
                questions: completedSession.items,
                startedAt: completedSession.startedAt,
                status: 'IN_PROGRESS'
            };

            completeMicroLoopSession(microLoop, { correctCount, totalCount })
                .catch(e => console.error("Micro-Loop completion failed", e));

            // Ensure ExamResult is set for viewing
            setExamResult(result);
        } else {
            // STANDARD EXAM SAVING
            setExamResult(result);

            // 2. Generate Snapshot
            const snapshot = generateGrowthSnapshot(result, completedSession);
            setGrowthSnapshot(snapshot);

            // 3. Persist (Fire & Forget)
            saveExamResult(result).catch(e => console.error("Failed to save result", e));
            saveGrowthSnapshot(snapshot).catch(e => console.error("Failed to save snapshot", e));

            // 4. Update Mastery (Feedback Loop)
            if (completedSession.studentId && result.itemMap) {
                const updates = Object.entries(result.itemMap).map(([atomId, itemData]) => ({
                    atomId,
                    isCorrect: itemData.status === 'CORRECT'
                })).filter(u => {
                    const status = result.itemMap[u.atomId].status;
                    return status !== 'SKIPPED' && status !== 'FAILED';
                });

                if (updates.length > 0) {
                    updateMasteryBatch(completedSession.studentId, updates)
                        .catch(e => console.error("Failed to update mastery", e));
                }
            }
        }

        setStage('RESULTS');

        // Force Refresh Entitlements (e.g. update count)
        monetizationClient.checkEntitlement('exams', true).catch(console.error);
    };

    // --- RENDERERS ---

    if (stage === 'INTENT') {
        return (
            <ExamIntentBuilder
                onBlueprintGenerated={handleBlueprintGenerated}
                onCancel={props.onBack}
                user={props.user}
            />
        );
    }

    if (stage === 'BLUEPRINT' && blueprint) {
        return (
            <ExamBlueprintPreview
                initialBlueprint={blueprint}
                onConfirm={handleSessionInit}
                onBack={() => setStage('INTENT')}
            />
        );
    }

    if (stage === 'PREPARING' && session) {
        return (
            <ExamPreparationView
                session={session}
                bunkerState={bunker.bunkerState}
                onStart={handleStartExam}
                onCancel={() => setStage('INTENT')}
            />
        );
    }

    if (stage === 'SESSION_RUNNING' && session) {
        return (
            <ExamRunner
                session={session}
                bunker={bunker} // Pass the hoisted bunker instance
                onComplete={handleExamComplete}
                onExit={() => {
                    // Force Refresh Entitlements to ensure "Generate" button is valid again
                    monetizationClient.checkEntitlement('exams', true).catch(console.error);
                    setStage('PREPARING');
                }} // Pausing goes back to Prep screen
            />
        );
    }

    if (stage === 'RESULTS' && examResult) {
        return (
            <ExamResultsView
                result={examResult}
                onViewMirror={() => setStage('RESULTS_MIRROR')}
                onBack={props.onBack}
            />
        );
    }

    if (stage === 'RESULTS_MIRROR' && growthSnapshot) {
        return (
            <GrowthMirrorView
                snapshot={growthSnapshot}
                onBack={() => setStage('RESULTS')}
            />
        );
    }

    // Fallback to Legacy Runner
    return <LegacyExamRunner {...props} />;
};

// ------------------------------------------------------------------
// LEGACY RUNNER (Preserved Implementation)
// ------------------------------------------------------------------

interface FlatQuestion {
    id: string;
    sectionTitle: string;
    number: string;
    text: string;
    marks: number;
    options?: string[];
    correctAnswer?: string;
    questionType?: string;
    instructions?: string;
    multiSelect?: boolean;
    lines?: number;
    reused?: boolean;
}

const LegacyExamRunner: React.FC<ExamDisplayProps> = ({ data, onBack, appLanguage, contentLanguage }) => {
    const t = TRANSLATIONS[appLanguage];
    const [viewMode, setViewMode] = useState<'paper' | 'interactive' | 'review-list' | 'results' | 'review-answers'>('paper');
    const [flatQuestions, setFlatQuestions] = useState<FlatQuestion[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<Record<string, string | string[]>>({});
    const [startTime, setStartTime] = useState(Date.now());
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [autoGradedScore, setAutoGradedScore] = useState(0);
    const [showExitConfirmation, setShowExitConfirmation] = useState(false);
    const [showConfirmToReview, setShowConfirmToReview] = useState(false);
    const [showFinalSubmitConfirmation, setShowFinalSubmitConfirmation] = useState(false);

    useEffect(() => {
        if (data && data.sections) {
            const flat: FlatQuestion[] = [];
            data.sections.forEach((sec, sIdx) => {
                sec.questions.forEach((q, qIdx) => {
                    flat.push({
                        id: q.id || `${sIdx}_${qIdx}`,
                        sectionTitle: sec.title,
                        number: q.number,
                        text: q.text,
                        marks: q.marks,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        questionType: q.questionType,
                        instructions: sec.instructions,
                        multiSelect: q.multiSelect,
                        lines: q.lines,
                        reused: q.reused
                    });
                });
            });
            setFlatQuestions(flat);
        }
    }, [data]);

    useEffect(() => {
        if (viewMode === 'interactive' || viewMode === 'review-list') {
            const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
            return () => clearInterval(timer);
        }
    }, [viewMode]);

    const handleAnswerChange = (qId: string, value: string, isMulti: boolean) => {
        setUserAnswers(prev => ({ ...prev, [qId]: value }));
    };

    const calculateScore = () => {
        let score = 0;
        flatQuestions.forEach(q => {
            if (userAnswers[q.id] === q.correctAnswer) score += (q.marks || 1);
        });
        return score;
    };

    const finishExamGrading = async () => {
        const finalScore = calculateScore();
        setAutoGradedScore(finalScore);
        setViewMode('results');
        setShowFinalSubmitConfirmation(false);

        // TELEMETRY
        const user = await getActiveUser();
        if (user) {
            await logRawActivity({
                atomId: `exam_${Date.now()}`,
                studentId: user.id,
                subject: data.subject || 'General',
                actionName: 'Exam',
                timestamp: Date.now(),
                durationMs: Date.now() - startTime,
                retries: 0,
                wasSkipped: false,
                isCorrect: finalScore > (flatQuestions.length / 2)
            }, true);
        }
    };

    const formatTimeDigital = (ms: number) => {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m.toString().padStart(2, '0')} : ${s.toString().padStart(2, '0')}`;
    };

    if (viewMode === 'interactive' && flatQuestions.length > 0) {
        const q = flatQuestions[currentQIndex];
        const totalMs = (parseInt(data.duration) || 60) * 60 * 1000;
        const elapsedMs = currentTime - startTime;
        const remainingMs = Math.max(0, totalMs - elapsedMs);

        return (
            <div className="fixed inset-0 z-[150] bg-slate-50 dark:bg-slate-950 flex flex-col animate-fade-in">
                <div className="bg-white dark:bg-slate-900 px-6 py-6 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowExitConfirmation(true)} className="text-red-500 font-bold">✕ Close</button>
                        <h2 className="text-xl font-black">Question {currentQIndex + 1}</h2>
                    </div>
                    <div className="bg-slate-900 text-white px-4 py-2 rounded-xl font-mono text-xl">
                        {formatTimeDigital(remainingMs)}
                    </div>
                </div>
                <div className="flex-grow p-8 overflow-y-auto">
                    <div className="max-w-3xl mx-auto">
                        <Card className="p-10 border-t-8 border-indigo-500 shadow-xl">
                            <div className="flex justify-between mb-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{q.sectionTitle}</span>
                                <span className="text-[10px] font-black uppercase text-slate-400">{q.marks} Marks</span>
                            </div>
                            <h3 className="text-2xl font-bold mb-8 leading-relaxed">{q.text}</h3>
                            <div className="space-y-4">
                                {q.options?.map((opt, idx) => (
                                    <button key={idx} onClick={() => handleAnswerChange(q.id, opt, false)} className={`w-full text-left p-6 rounded-2xl border-2 transition-all ${userAnswers[q.id] === opt ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
                <div className="p-6 bg-white border-t flex justify-between gap-4">
                    <Button variant="outline" onClick={() => setCurrentQIndex(i => Math.max(0, i - 1))} disabled={currentQIndex === 0}>Previous</Button>
                    {currentQIndex < flatQuestions.length - 1 ? (
                        <Button onClick={() => setCurrentQIndex(i => i + 1)} className="flex-grow">Next Question</Button>
                    ) : (
                        <Button onClick={() => setShowFinalSubmitConfirmation(true)} className="flex-grow bg-green-600">Finish Attempt</Button>
                    )}
                </div>
                {showFinalSubmitConfirmation && (
                    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
                        <Card className="max-w-md w-full p-8 text-center animate-pop">
                            <h3 className="text-2xl font-black mb-4">Submit Paper?</h3>
                            <p className="text-slate-500 mb-8">Confirm final submission for grading.</p>
                            <div className="flex flex-col gap-2">
                                <Button onClick={finishExamGrading} className="bg-green-600">Confirm & Submit</Button>
                                <button onClick={() => setShowFinalSubmitConfirmation(false)} className="text-slate-400 font-bold mt-2">Cancel</button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        );
    }

    if (viewMode === 'results') {
        return (
            <div className="max-w-xl mx-auto py-20 px-4 animate-fade-in text-center">
                <Card className="p-12 border-t-8 border-green-500 shadow-2xl">
                    <span className="text-6xl block mb-6">🏆</span>
                    <h2 className="text-3xl font-black mb-2">Graded</h2>
                    <div className="py-10">
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Result Accuracy</p>
                        <p className="text-7xl font-black text-indigo-600 italic">{Math.round((autoGradedScore / flatQuestions.reduce((a, c) => a + (c.marks || 1), 0)) * 100)}%</p>
                    </div>
                    <Button onClick={onBack} className="w-full py-4">Return Home</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in pb-20 px-4 pt-10">
            <div className="flex justify-between items-center mb-8">
                <Button variant="outline" onClick={onBack}>← Back</Button>
                <Button onClick={() => { setViewMode('interactive'); setStartTime(Date.now()); }} className="bg-indigo-600 px-10">Start Interactive Exam</Button>
            </div>
            <div className="bg-white text-black p-12 md:p-20 shadow-xl border-t-[12px] border-indigo-600 min-h-[800px] text-left">
                <h1 className="text-3xl font-serif font-black mb-4">{data.schoolName}</h1>
                <div className="border-y-2 border-black py-4 mb-10 flex justify-between uppercase font-bold text-xs">
                    <span>Subject: {data.subject}</span>
                    <span>Level: {data.grade}</span>
                </div>
                {data.sections?.map((s, idx) => (
                    <div key={idx} className="mb-12">
                        <h2 className="bg-black text-white px-4 py-1 text-sm font-bold uppercase mb-4">{s.title}</h2>
                        <p className="italic text-sm mb-6 opacity-70">{s.instructions}</p>
                        <div className="space-y-10">
                            {s.questions?.map((q, qidx) => (
                                <div key={qidx} className="relative">
                                    <div className="flex justify-between">
                                        <p className="font-serif text-lg"><strong>{q.number}.</strong> {q.text}</p>
                                        <span className="font-bold text-sm">[{q.marks}]</span>
                                    </div>
                                    {q.options && (
                                        <div className="grid grid-cols-2 gap-4 mt-4 ml-6">
                                            {q.options.map((o, oidx) => <div key={oidx} className="text-sm">• {o}</div>)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ExamDisplay;
