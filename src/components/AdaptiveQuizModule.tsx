
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TRANSLATIONS } from '../i18n';
import {
    UserProfile, Language, LocalTrainingSource,
    QuizSessionInit, QuestionRuntime, QuestionResult, Difficulty, QuizType, DetailLevel
} from '../types';
import { getLocalTrainingSources, getLocalAtoms, updateMasteryBatch } from '../services/storageService';
import { initializeAdaptiveSession, generateAdaptiveQuestion } from '../services/ai/adaptiveQuizService';
import { getDB } from '../services/idbService';
import Button from './ui/Button';
import Card from './ui/Card';

const RECOVERY_KEY = 'eduva_active_session_v2';

interface AdaptiveQuizModuleProps {
    user: UserProfile;
    appLanguage: Language;
    onBack: () => void;
    onComplete: () => void;
}

const AdaptiveQuizModule: React.FC<AdaptiveQuizModuleProps> = ({ user, appLanguage, onBack, onComplete }) => {
    const t: any = TRANSLATIONS[appLanguage];
    console.log('[AdaptiveQuizModule] Debug:', {
        receivedLang: appLanguage,
        resolvedPickerTitle: t.quiz?.picker?.title,
        expectedAr: "مصفوفة التدريب"
    });
    const [phase, setPhase] = useState<'PICKER' | 'LOBBY' | 'ENGINE' | 'PULSE' | 'SUMMARY'>('PICKER');
    const [sources, setSources] = useState<LocalTrainingSource[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string>(user.preferences.defaultSubject || user.preferences.subjects[0]);
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
    const [session, setSession] = useState<QuizSessionInit | null>(null);
    const [currentQ, setCurrentQ] = useState<QuestionRuntime | null>(null);
    const [results, setResults] = useState<QuestionResult[]>([]);
    const [currentLevel, setCurrentLevel] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
    const [sessionMessage, setSessionMessage] = useState<string | null>(null);

    useEffect(() => {
        loadSources();
        attemptRecovery();
    }, [user.id]);

    /**
     * DR-04 Bunker Mode 2.0: Durable Recovery via IndexedDB
     */
    const attemptRecovery = async () => {
        const idb = await getDB();
        const snapshotId = localStorage.getItem(RECOVERY_KEY);
        if (!snapshotId) return;

        try {
            const snapshot = await idb.get('history', snapshotId);
            if (snapshot && (Date.now() - snapshot.timestamp < 3600000)) {
                const data = snapshot.data;
                setSession(data.session);
                setResults(data.results || []);
                setCurrentLevel(data.currentLevel);
                setPhase('LOBBY');
            }
        } catch (e) { localStorage.removeItem(RECOVERY_KEY); }
    };

    const persistState = async (currentResults: QuestionResult[], lvl: number, sess: QuizSessionInit) => {
        const idb = await getDB();
        const snapId = `snapshot_${sess.identity.sessionId}`;
        // Truth lives in IndexedDB 'history' store
        await idb.put('history', {
            id: snapId,
            userId: user.id,
            type: 'adaptive-quiz',
            title: 'Bunker Snapshot v2',
            timestamp: Date.now(),
            data: { results: currentResults, currentLevel: lvl, session: sess },
            tags: ['bunker-snapshot'],
            version: 2
        } as any);
        localStorage.setItem(RECOVERY_KEY, snapId);
    };

    const loadSources = async () => {
        setIsProcessing(true);
        const data = await getLocalTrainingSources(user.id);
        setSources(data);
        setIsProcessing(false);
    };

    const currentSubjectSources = useMemo(() => {
        return sources.filter(s => s.subject === selectedSubject).sort((a, b) => {
            if (a.status === 'Completed' && b.status !== 'Completed') return -1;
            if (a.status !== 'Completed' && b.status === 'Completed') return 1;
            return b.createdAt - a.createdAt;
        });
    }, [sources, selectedSubject]);

    const toggleDoc = (hash: string) => {
        if (isProcessing) return;
        setSelectedDocIds(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash);
            else next.add(hash);
            return next;
        });
    };

    const handleStartSession = async () => {
        if (selectedDocIds.size === 0) return;
        setIsProcessing(true);
        setSessionMessage(null);
        try {
            const init = await initializeAdaptiveSession({
                year: user.preferences.defaultYear, curriculum: user.preferences.defaultCurriculum,
                subject: selectedSubject, topic: `Mastery Matrix: ${selectedSubject}`,
                mode: 'adaptive-quiz', language: appLanguage, difficulty: Difficulty.MEDIUM,
                detailLevel: DetailLevel.DETAILED, quizType: QuizType.MIX, questionCount: 10,
                selectedDocumentIds: Array.from(selectedDocIds),
                quizMode: 'PRACTICE'
            }, user, (msg) => {
                if (msg.includes("Bunker Mode")) setSessionMessage(t.quiz.errors.bunkerMode);
            });

            setSession(init);
            setCurrentLevel(init.ladderConstraints.startLevel);
            setSessionStartTime(Date.now());
            setPhase('LOBBY');
            await persistState([], init.ladderConstraints.startLevel, init);
        } catch (e) {
            setSessionMessage(t.quiz.errors.protocolFault);
        }
        finally { setIsProcessing(false); }
    };

    const loadNextQuestion = async () => {
        if (!session) return;
        setIsProcessing(true);
        try {
            const nextQ = await generateAdaptiveQuestion(session, user, currentLevel, results, (msg) => {
                if (msg.includes("Bunker Mode")) setSessionMessage(t.quiz.errors.handshakeTimeout);
            });
            setCurrentQ(nextQ);
            setPhase('ENGINE');
        } catch (e) {
            setSessionMessage(t.quiz.errors.synthesisInterrupted);
        }
        finally { setIsProcessing(false); }
    };

    const handleAnswerSubmit = async (res: QuestionResult) => {
        const resultWithAtom = { ...res, atomId: currentQ?.atomId };
        const newResults = [...results, resultWithAtom];
        setResults(newResults);

        let nextLvl = currentLevel;
        if (res.isCorrect === true && currentLevel < session!.ladderConstraints.maxLevel) nextLvl++;
        else if (res.isCorrect === false && currentLevel > 1) nextLvl--;

        setCurrentLevel(nextLvl);
        await persistState(newResults, nextLvl, session!);

        const elapsedMins = (Date.now() - sessionStartTime) / 60000;
        if (newResults.length >= 10 || elapsedMins >= 15) {
            setPhase('PULSE');
            localStorage.removeItem(RECOVERY_KEY);
        } else {
            loadNextQuestion();
        }
    };

    const processMasterySync = async () => {
        setIsProcessing(true);
        try {
            const updates = results.map(r => ({ atomId: (r as any).atomId, isCorrect: !!r.isCorrect }));
            await updateMasteryBatch(user.id, updates);
        } finally { setIsProcessing(false); setPhase('SUMMARY'); }
    };

    return (
        <div className="max-w-xl mx-auto p-4 animate-fade-in pb-44 pt-6 flex flex-col min-h-screen">

            {sessionMessage && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black text-amber-700 uppercase tracking-widest animate-pop shadow-sm flex items-center gap-3">
                    <span className="text-lg">⚠️</span>
                    {sessionMessage}
                    <button onClick={() => setSessionMessage(null)} className="ml-auto opacity-40 hover:opacity-100">✕</button>
                </div>
            )}

            {phase === 'PICKER' && (
                <div className="space-y-8">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{t.quiz.picker.title}</h1>

                    <section className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">{t.quiz.picker.selectDomain}</label>
                        <select
                            className="w-full p-5 rounded-[1.5rem] border-2 border-slate-100 bg-white text-xl font-black text-slate-800 outline-none focus:border-indigo-500 shadow-xl cursor-pointer transition-all"
                            value={selectedSubject}
                            onChange={(e) => { setSelectedSubject(e.target.value); setSelectedDocIds(new Set()); }}
                        >
                            {user.preferences.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </section>

                    <section className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.quiz.picker.selectMaterial}</label>
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{selectedDocIds.size} {t.quiz.picker.selected}</span>
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                            {currentSubjectSources.length > 0 ? (
                                currentSubjectSources.map(s => (
                                    <div
                                        key={s.fileHash}
                                        onClick={() => s.status === 'Completed' && toggleDoc(s.fileHash)}
                                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedDocIds.has(s.fileHash)
                                            ? 'border-indigo-600 bg-indigo-50/10 shadow-md'
                                            : 'border-slate-100 bg-white opacity-80 hover:opacity-100 hover:border-indigo-200 shadow-sm'
                                            } ${s.status !== 'Completed' ? 'opacity-40 grayscale cursor-not-allowed border-dashed' : ''}`}
                                    >
                                        <div className="min-w-0 flex-grow pr-4">
                                            <p className={`font-black text-sm truncate ${selectedDocIds.has(s.fileHash) ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                {s.fileName}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${s.status === 'Completed' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-slate-100 text-slate-400'}`}>
                                                    {s.status === 'Completed' ? t.quiz.picker.status.verified : t.quiz.picker.status.untrained}
                                                </span>
                                                {s.status === 'Completed' && (
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{t.notes.source.density}: {s.trustScore}%</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedDocIds.has(s.fileHash) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200'
                                            }`}>
                                            {selectedDocIds.has(s.fileHash) && <span className="text-[10px]">✓</span>}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 px-6 text-center border-4 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/50">
                                    <span className="text-4xl block mb-4 opacity-20">🌫️</span>
                                    <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">{t.quiz.picker.noMaterials}</p>
                                    <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase leading-relaxed">{t.quiz.picker.libraryTip}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <Button
                        onClick={handleStartSession}
                        disabled={selectedDocIds.size === 0 || isProcessing}
                        isLoading={isProcessing}
                        className="w-full py-6 rounded-[1.5rem] bg-indigo-600 text-white font-black uppercase tracking-[0.4em] text-xs shadow-2xl transition-all active:scale-95 disabled:grayscale disabled:opacity-30"
                    >
                        {selectedDocIds.size === 0 ? t.quiz.picker.actions.selectToUnlock : t.quiz.picker.actions.launch}
                    </Button>
                </div>
            )}

            {phase === 'LOBBY' && session && (
                <div className="animate-slide-up flex flex-col items-center justify-center min-h-[60vh] text-center">
                    <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-5xl mb-8 shadow-inner">🎯</div>
                    <h2 className="text-3xl font-black mb-10">{t.quiz.lobby.readyTitle}</h2>
                    <Button onClick={loadNextQuestion} isLoading={isProcessing} className="w-full py-6 rounded-3xl text-lg font-black bg-indigo-600 shadow-2xl">{t.quiz.lobby.begin}</Button>
                </div>
            )}

            {phase === 'ENGINE' && currentQ && (
                <div className="animate-fade-in space-y-10">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{t.quiz.hud.level} {currentLevel}</span>
                    </div>
                    <Card className="p-10 border-b-8 border-indigo-600 shadow-2xl">
                        <span className="text-[9px] font-black uppercase text-slate-400 mb-4 block">{currentQ.conceptTag}</span>
                        <h3 className="text-2xl font-bold leading-relaxed">{currentQ.questionText}</h3>
                    </Card>
                    <div className="grid grid-cols-1 gap-3">
                        {currentQ.options?.map((opt, idx) => (
                            <button key={idx} onClick={() => handleAnswerSubmit({ response: opt, isCorrect: opt === currentQ.validation.correctAnswer, responseTimeSec: 10, hintsUsedCount: 0, masteryDelta: 0.05 })}
                                className="w-full p-5 text-left rounded-2xl border-2 border-slate-100 bg-white hover:border-indigo-400 font-bold shadow-sm"
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {phase === 'PULSE' && (
                <div className="text-center py-20 animate-slide-up">
                    <h2 className="text-3xl font-black mb-8">{t.quiz.pulse.title}</h2>
                    <div className="grid grid-cols-3 gap-4">
                        {[{ id: 'SHARP', icon: '⚡', label: t.quiz.pulse.sharp }, { id: 'NEUTRAL', icon: '🌓', label: t.quiz.pulse.neutral }, { id: 'TIRED', icon: '🔋', label: t.quiz.pulse.tired }].map(f => (
                            <button key={f.id} onClick={() => processMasterySync()} className="p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-500 group">
                                <span className="text-4xl block mb-2">{f.icon}</span>
                                <span className="text-[10px] font-black uppercase text-slate-500">{f.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {phase === 'SUMMARY' && (
                <div className="text-center py-20 animate-fade-in flex flex-col items-center">
                    <span className="text-6xl block mb-6">🏆</span>
                    <h2 className="text-4xl font-black mb-10 tracking-tight">{t.quiz.summary.title}</h2>
                    <Button onClick={() => setPhase('PICKER')} className="w-full py-5 rounded-2xl font-black bg-indigo-600 shadow-xl">{t.quiz.summary.back}</Button>
                </div>
            )}

            {isProcessing && <div className="fixed inset-0 z-[300] bg-white/95 backdrop-blur-md flex items-center justify-center p-8"><div className="text-center w-full"><div className="flex flex-col items-center gap-4"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><p className="text-lg font-bold text-slate-700 animate-pulse">{t.quiz.loading.initializing}</p></div></div></div>}
        </div>
    );
};

export default AdaptiveQuizModule;
