
import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { QuotaGuard } from '../monetization/QuotaGuard';
import {
    UserProfile, Language, LocalTrainingSource,
    QuizSessionV2, QuizQuestionV2, QuestionResult, GenerationRequest, AtomCore,
    AtomProgress, Difficulty, DetailLevel, QuizType, AppView
} from '../../types';
import { getLocalTrainingSources, updateMasteryBatch, getLocalAtoms } from '../../services/storageService';
import { fetchAtomsForSession, hydrateAtomList, hydrateBySourceId } from '../../services/hydrationService';
import { TRANSLATIONS } from '../../i18n';
import {
    getSessionV2,
    saveSessionV2,
    generateStaticSession,
    getNextQuestionSync,
    updateAtomProgress,
    connectTelemetry,
    initializeDurableSession,
    refillPoolsIfNecessary
} from '../../services/v2/adaptiveQuizServiceV2';
import { db } from '../../services/firebaseConfig';
import { getDB } from '../../services/idbService';
import { normalizeSubjectName } from '../../utils/subjectUtils';
import { resolveAllowedQuestionTypes, QuestionType } from '../../utils/quizPolicyResolver';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { logger } from '../../utils/logger';
import { ingestEvent } from '../../services/lis/telemetryIngestion'; // ✅ LIS
import { getStudentMasteryStats } from '../../services/telemetryBrainService';
import { monetizationClient } from '../../services/monetization/client';
import GeneratorHeader from '../ui/GeneratorHeader';
import { DashboardContext } from '../dashboard/context/DashboardContext';

const RECOVERY_KEY = 'eduva_active_session_v2';

interface AdaptiveQuizModuleProps {
    user: UserProfile;
    appLanguage: Language;
    onBack: () => void;
    onComplete: () => void;
    initialRequest?: GenerationRequest | null;
    setView?: (view: any) => void;
}

// ----------------------------------------------------------------------
// SNAPSHOT CONTEXT: Immutable Reference for Telemetry
// Prevents drift caused by UI re-renders or navigation state resets.
// ----------------------------------------------------------------------
interface QuizSessionContext {
    sessionId: string;
    subject: string;
    mode: string;
    scope: 'FILE' | 'SUBJECT' | 'ALL';
    scopeId: string | undefined; // MUST be defined for FILE scope
    atoms: string[];
    allowedTypes: string[];
    levelGoal: number;
    startedAt: number;
    isCompleted?: boolean; // Idempotency Guard
}

const QUESTION_TYPES = [
    { id: 'MCQ', label: 'Multiple Choice', icon: '🔘' },
    { id: 'TrueFalse', label: 'True / False', icon: '⚖️' },
    { id: 'FillIn', label: 'Fill in Blank', icon: '📝' },
    { id: 'Match', label: 'Matching', icon: '🔗' }
];

// Helper: Determine correctness for history re-evaluation (Pure Function)
const calculateCorrectness = (q: QuizQuestionV2 & { userAnswer: any }) => {
    if (!q.userAnswer && q.userAnswer !== 0) return false;

    if (q.questionType === 'MCQ' || q.questionType === 'TrueFalse') {
        // Hardened Check (v7.1)
        return (
            typeof q.userAnswer === "number" &&
            typeof q.correctIndex === "number" &&
            q.userAnswer === q.correctIndex
        );
    }
    if (q.questionType === 'FillIn') {
        // Hardened: Type checks + Punctuation Stripping
        const ans = q.userAnswer;
        const tgt = q.answer;
        if (typeof ans !== 'string' || typeof tgt !== 'string') return false;

        const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,!]+$/, '');
        return normalize(ans) === normalize(tgt);
    }
    if (q.questionType === 'Match') {
        const pairs = q.pairs;
        // 1. Guard against broken question data
        if (!Array.isArray(pairs) || pairs.length === 0) return false;

        // 2. Guard against broken user answer
        if (!Array.isArray(q.userAnswer)) return false;

        // 3. Strict Length Check (Bjection Required)
        // Prevents partial submission abuse
        if (q.userAnswer.length !== pairs.length) return false;

        // 4. Content Check (Tuple Integrity)
        return q.userAnswer.every((link: any) =>
            Array.isArray(link) && link.length === 2 &&
            pairs.some(p => p[0] === link[0] && p[1] === link[1])
        );
    }
    return false;
};


// --- VISUAL MATCHING LINES RESTORATION ---
const LINK_THEMES = [
    { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', icon: 'bg-blue-500', stroke: '#3b82f6' },
    { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', icon: 'bg-amber-500', stroke: '#f59e0b' },
    { bg: 'bg-teal-50', border: 'border-teal-400', text: 'text-teal-700', icon: 'bg-teal-500', stroke: '#0d9488' },
    { bg: 'bg-fuchsia-50', border: 'border-fuchsia-400', text: 'text-fuchsia-700', icon: 'bg-fuchsia-500', stroke: '#d946ef' },
    { bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-700', icon: 'bg-violet-500', stroke: '#8b5cf6' },
    { bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700', icon: 'bg-cyan-500', stroke: '#06b6d4' },
];

const MatchConnectionLines: React.FC<{
    matchState: { links: [string, string][] };
    leftRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
    rightRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
    containerRef: React.RefObject<HTMLDivElement>;
    isAnswered: boolean;
    currentQ: QuizQuestionV2;
}> = ({ matchState, leftRefs, rightRefs, containerRef, isAnswered, currentQ }) => {
    const [lines, setLines] = useState<{ x1: number, y1: number, x2: number, y2: number, color: string }[]>([]);

    useEffect(() => {
        const updateLines = () => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newLines: any[] = [];

            matchState.links.forEach((link, i) => {
                const leftEl = leftRefs.current.get(link[0]);
                const rightEl = rightRefs.current.get(link[1]);

                if (leftEl && rightEl) {
                    const lRect = leftEl.getBoundingClientRect();
                    const rRect = rightEl.getBoundingClientRect();

                    const correctPair = currentQ.pairs?.find(p => p[0] === link[0]);
                    const isCorrect = correctPair && correctPair[1] === link[1];
                    const theme = LINK_THEMES[i % LINK_THEMES.length];

                    newLines.push({
                        x1: lRect.right - containerRect.left,
                        y1: lRect.top + lRect.height / 2 - containerRect.top,
                        x2: rRect.left - containerRect.left,
                        y2: rRect.top + rRect.height / 2 - containerRect.top,
                        color: isAnswered ? (isCorrect ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)') : theme.stroke
                    });
                }
            });
            setLines(newLines);
        };

        const interval = setInterval(updateLines, 50);
        window.addEventListener('resize', updateLines);
        updateLines();
        console.log(`[QUIZ_DEBUG] 🕸️ MatchConnectionLines mounted. State:`, matchState);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateLines);
        };
    }, [matchState.links, isAnswered, currentQ]);

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block z-0">
            {lines.map((line, i) => (
                <line
                    key={i}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={line.color}
                    strokeWidth={isAnswered ? 3 : 2.5}
                    strokeOpacity={isAnswered ? 1 : 0.6}
                    strokeLinecap="round"
                    className="transition-colors duration-500"
                />
            ))}
        </svg>
    );
};

/**
 * 🌲 COGNITIVE LADDER TREE v7 - ULTRA-COMPACT (HUD Height)
 */
const CognitiveLadder: React.FC<{ session: QuizSessionV2 }> = ({ session }) => {
    const isChallenge = session.metadata?.origin === 'CHALLENGE';
    const levels = isChallenge
        ? [{ num: 4, label: 'Expert', emoji: '🏆', color: 'amber' }]
        : [
            { num: 1, label: 'Recall', emoji: '🧩', color: 'emerald' },
            { num: 2, label: 'Apply', emoji: '⚙️', color: 'blue' },
            { num: 3, label: 'Analyze', emoji: '🔬', color: 'purple' }
        ];

    const currentLevel = session.currentLevel;
    const questionsPerLevel = session.config.levelQuestionCount;
    const currentLevelAnswered = session.history.filter(q => q.difficulty === currentLevel).length;
    const currentLevelProgress = (currentLevelAnswered / questionsPerLevel) * 100;

    return (
        <div className="flex items-center justify-center gap-1">
            {levels.map((level, idx) => {
                const isActive = level.num === currentLevel;
                const isCompleted = level.num < currentLevel;
                const isFuture = level.num > currentLevel;

                const levelProgress = isCompleted ? 100 : isActive ? currentLevelProgress : 0;

                return (
                    <React.Fragment key={level.num}>
                        {/* Level Node */}
                        <div className="flex flex-col items-center gap-0 relative z-10">
                            {/* Tiny Circle */}
                            <div className={`
                                relative w-6 h-6 rounded-full flex items-center justify-center
                                transition-all duration-500 ease-out
                                ${isActive ? (isChallenge ? 'bg-amber-500 scale-125 shadow-lg shadow-amber-500/40 animate-pulse' : 'bg-indigo-600 scale-110 shadow-sm shadow-indigo-500/30') : ''}
                                ${isCompleted ? 'bg-green-500 shadow-sm shadow-green-500/20' : ''}
                                ${isFuture ? 'bg-slate-200 border border-slate-300 border-dashed opacity-60' : ''}
                            `}>
                                {/* Progress Ring */}
                                {isActive && (
                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                                        <circle
                                            cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="1.5"
                                            strokeDasharray={`${2 * Math.PI * 10}`}
                                            strokeDashoffset={`${2 * Math.PI * 10 * (1 - levelProgress / 100)}`}
                                            className="transition-all duration-700 ease-out"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                )}

                                {/* Content */}
                                <div className="relative z-10 text-center">
                                    {isCompleted ? (
                                        <span className="text-xs">✓</span>
                                    ) : (
                                        <div className="text-[10px]">{level.emoji}</div>
                                    )}
                                </div>
                            </div>

                            {/* Label */}
                            <div className={`text-[7px] font-bold uppercase tracking-wide transition-all duration-300 ${isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-slate-400'
                                }`}>
                                {level.label}
                            </div>
                        </div>

                        {/* Connector */}
                        {idx < levels.length - 1 && (
                            <div className="relative w-8 h-0.5 mx-0.5">
                                <div className="absolute inset-0 bg-slate-200 rounded-full" />
                                <div
                                    className={`absolute inset-0 rounded-full transition-all duration-700 ease-out ${isCompleted ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-slate-200'
                                        }`}
                                    style={{ width: isCompleted ? '100%' : '0%' }}
                                />
                                {isCompleted && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full shadow-sm"
                                        style={{
                                            animation: `slideAcross${idx} 2s ease-in-out infinite`,
                                            animationDelay: `${idx * 0.3}s`
                                        }}
                                    >
                                        <style>{`
                                            @keyframes slideAcross${idx} {
                                                0%, 100% { left: 0%; opacity: 0; }
                                                10% { opacity: 1; }
                                                90% { opacity: 1; }
                                                100% { left: 100%; opacity: 0; }
                                            }
                                        `}</style>
                                    </div>
                                )}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

/**
 * 🛰️ INTELLIGENCE HUD v3.2 - IMPROVED CLARITY (COMPACT)
 */
const IntelligenceHUD: React.FC<{ session: QuizSessionV2, isAnswered: boolean }> = ({ session, isAnswered }) => {
    // UI Counter: Only increment to next number AFTER current is answered
    const displayStep = session.history.length + (isAnswered ? 1 : 1);
    const sessionTotal = session.totalAtoms || 9;
    const progressPercent = Math.min(99, Math.round((session.history.length / sessionTotal) * 100));

    // Remaining questions
    const remainingPerLevel = [1, 2, 3].map(lvl => session.pools[lvl as 1 | 2 | 3]?.length || 0);
    const totalInPool = remainingPerLevel.reduce((a, b) => a + b, 0);

    return (
        <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-1.5 sm:p-2 px-2 sm:px-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm mb-3 sm:mb-4 mx-auto w-full max-w-full sm:max-w-lg">
            <div className="text-center flex-1">
                <p className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider sm:tracking-widest">Adaptive Progress</p>
                <div className="flex items-baseline justify-center gap-0.5 sm:gap-1">
                    <p className="text-xs sm:text-sm font-black text-indigo-600">{Math.min(displayStep, sessionTotal)}</p>
                    <span className="text-[9px] sm:text-[10px] text-slate-300 font-bold">/ Up to {sessionTotal}</span>
                </div>
            </div>

            <div className="h-5 sm:h-6 w-px bg-slate-100"></div>

            <div className="text-center flex-1">
                <p className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider sm:tracking-widest">Depth</p>
                <p className="text-xs sm:text-sm font-black text-emerald-600">{progressPercent}%</p>
            </div>

            <div className="h-5 sm:h-6 w-px bg-slate-100"></div>

            <div className="text-center flex-1">
                <p className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider sm:tracking-widest">Pool</p>
                <div className="flex items-center gap-0.5 sm:gap-1 justify-center">
                    <p className="text-xs sm:text-sm font-black text-amber-600">{totalInPool}</p>
                    <span className="text-[7px] sm:text-[8px] font-bold text-slate-400 opacity-60">
                        (L{session.currentLevel})
                    </span>
                </div>
            </div>
        </div>
    );
};

const QuizGenerationLoader: React.FC<{ status: string; history: string[] }> = ({ status, history }) => {
    const allSteps = React.useMemo(() => {
        const unique = new Set(history);
        if (status) unique.add(status);
        return Array.from(unique);
    }, [history, status]);

    return (
        <div className="fixed inset-0 z-[300] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-fade-in text-left">
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-[100px] animate-pulse"></div>
            </div>

            <div className="relative z-10 max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 p-8 animate-pop">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-float">
                        <span className="text-3xl">🧠</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-widest mb-1">
                        Constructing Quiz
                    </h3>
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest animate-pulse">
                        Neural Engine Active
                    </p>
                </div>

                <div className="space-y-4 sm:space-y-6 relative pr-2 pl-4">
                    {/* Connecting Line */}
                    <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-slate-100 dark:bg-slate-700 -z-0"></div>

                    {allSteps.map((step, idx) => {
                        const isLast = idx === allSteps.length - 1;
                        return (
                            <div key={idx} className="relative flex items-center gap-4 sm:gap-6 animate-slide-up" style={{ animationDelay: `${idx * 150}ms` }}>
                                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${!isLast
                                    ? 'bg-emerald-500 border-emerald-500 text-white scale-100 shadow-lg shadow-emerald-500/20'
                                    : 'bg-white dark:bg-slate-800 border-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-125'
                                    }`}>
                                    {!isLast ? (
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping"></div>
                                    )}
                                </div>
                                <div className={`flex-1 transition-all duration-500 ${isLast ? 'opacity-100 translate-x-1' : 'opacity-50'}`}>
                                    <p className={`text-[10px] sm:text-xs font-black uppercase tracking-wider ${isLast ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {step}
                                    </p>
                                    {isLast && (
                                        <div className="flex gap-1 mt-1">
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-0"></span>
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-75"></span>
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

const AdaptiveQuizModuleV2: React.FC<AdaptiveQuizModuleProps> = ({ user, appLanguage, onBack, onComplete, initialRequest, setView }) => {
    const t: any = TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];
    // LATENCY OPTIMIZATION (v3.2): Added 'SAVING' phase for immediate feedback
    const [phase, setPhase] = useState<'PICKER' | 'LOBBY' | 'ENGINE' | 'LEVEL_UP' | 'PULSE' | 'SUMMARY' | 'SAVING'>('PICKER');

    // Quota logic moved to QuotaGuard component inside render

    useEffect(() => {
        if (phase !== 'PICKER') {
            console.log(`[QUIZ_DEBUG] 🚦 PHASE CHANGE -> ${phase}`);
        }
    }, [phase]);

    const [sources, setSources] = useState<LocalTrainingSource[]>([]);
    const [selectedSubject, setSelectedSubject] = useState(user.preferences.subjects[0] || 'General');
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [levelGoalCount, setLevelGoalCount] = useState(4);
    const [allowedTypes, setAllowedTypes] = useState<string[]>(['MCQ']);
    const [docSearchTerm, setDocSearchTerm] = useState('');

    const [session, setSession] = useState<QuizSessionV2 | null>(null);
    const [currentQ, setCurrentQ] = useState<QuizQuestionV2 | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isAnswered, setIsAnswered] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [textInput, setTextInput] = useState('');
    const [matchState, setMatchState] = useState<{ left: string | null, right: string | null, links: [string, string][] }>({ left: null, right: null, links: [] });
    const [lobbyStatus, setLobbyStatus] = useState<string>("");
    const [loadingHistory, setLoadingHistory] = useState<string[]>([]);

    // Track loading steps for interactive loader
    useEffect(() => {
        if (isProcessing && lobbyStatus) {
            setLoadingHistory(prev => {
                // Avoid duplicates
                if (prev.includes(lobbyStatus)) return prev;
                // Avoid adding the "Processing Response..." placeholder if it ever leaks in
                if (lobbyStatus === "Processing Response...") return prev;
                return [...prev, lobbyStatus];
            });
        }
    }, [lobbyStatus, isProcessing]);

    const [results, setResults] = useState<QuestionResult[]>([]);
    const [currentLevel, setCurrentLevel] = useState(1);
    const [showReview, setShowReview] = useState(false);

    // CHALLENGE OUTCOME STATE
    const [challengeOutcome, setChallengeOutcome] = useState<'PASS' | 'PARTIAL' | 'FAIL' | null>(null);

    // IMMUTABLE SESSION SNAPSHOT REF
    const sessionContextRef = useRef<QuizSessionContext | null>(null);

    const sessionStartTimeRef = useRef<number>(0);
    const isSessionActiveRef = useRef(false);
    const aiRequestTokenRef = useRef<string | null>(null);
    const isChallengeModeRef = useRef(false);
    const questionStartTimeRef = useRef<number>(Date.now());

    // Policy enforcement refs - track origin and scope for the session
    const sessionOriginRef = useRef<'PRACTICE' | 'REPAIR' | 'EXPAND' | 'CHALLENGE'>('PRACTICE');
    const sessionScopeRef = useRef<'FILE' | 'SUBJECT' | 'ALL'>('SUBJECT');
    const selectedAnswerRef = useRef<any>(null);
    const hasAutoStarted = useRef(false);
    const hasClearedSessionRef = useRef(false);

    // Refs for Match Line Drawing
    const matchContainerRef = useRef<HTMLDivElement>(null);
    const leftRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
    const rightRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    const dashboardContext = useContext(DashboardContext);
    const isArabic = appLanguage === Language.ARABIC;

    // New sessionMessage logic for error handling or lobby status
    const [sessionMessage, setSessionMessage] = useState<string | null>(null);
    const [messageType, setMessageType] = useState<'warning' | 'error' | 'success'>('warning');
    // ERROR STATE - Display user-friendly error messages
    const [errorModal, setErrorModal] = useState<{ title: string; message: string; action?: string; onAction?: () => void } | null>(null);

    // RESUME QUIZ STATE - Track if there's a recoverable session
    const [resumableSession, setResumableSession] = useState<{
        snapshot: any;
        questionsLeft: number;
        subject: string;
        createdAt: number;
    } | null>(null);

    useEffect(() => {
        loadSources();
        isSessionActiveRef.current = true;
        aiRequestTokenRef.current = null;
        return () => {
            isSessionActiveRef.current = false;
            aiRequestTokenRef.current = null;
        };
    }, [user.id, selectedSubject]);

    // ⌨️ KEYBOARD SUPPORT: Press Enter to proceed after answering
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            // Only activate on ENGINE phase when answered and not processing
            if (phase === 'ENGINE' && isAnswered && e.key === 'Enter' && !isProcessing) {
                e.preventDefault();
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [phase, isAnswered, isProcessing]);

    useEffect(() => {
        // Auto-start session if initialRequest is provided (e.g. from Compass)
        if (initialRequest && !hasAutoStarted.current) {
            hasAutoStarted.current = true;
            setSelectedSubject(initialRequest.subject);
            setPhase('LOBBY'); // Skip Picker
            handleStart(initialRequest);
        }
    }, [initialRequest]);

    /**
     * DR-04 Bunker Mode 2.0: Durable Recovery via IndexedDB
     */
    const handleResumeQuiz = async () => {
        if (!resumableSession) return;

        try {
            const data = resumableSession.snapshot.data;
            const restoredSession = data.session;

            // Restore full state
            setSession(restoredSession);
            setResults(data.results || []);
            setCurrentLevel(data.currentLevel);
            if (data.sessionContext) {
                sessionContextRef.current = data.sessionContext;
                isChallengeModeRef.current = data.sessionContext.mode === 'CHALLENGE';
            }

            // Get next question
            const nextQ = getNextQuestionSync(restoredSession);
            if (nextQ) {
                setCurrentQ(nextQ);
                setPhase('ENGINE');
                setIsAnswered(false);
                logger.quiz("Resumed quiz from previous session");
            }
        } catch (e) {
            console.error('[QUIZ] Failed to resume:', e);
            setResumableSession(null);
        }
    };

    const handleStartFresh = () => {
        // Clear old session data
        localStorage.removeItem(RECOVERY_KEY);
        setResumableSession(null);
        setSession(null);
        setResults([]);
        hasClearedSessionRef.current = true;
        // Also trigger picker to reset any previous selection
        setPhase('PICKER');
        logger.quiz("Starting fresh quiz (cleared old session)");
    };

    // OPTIONAL RECOVERY: Check for resumable session on mount
    useEffect(() => {
        const checkForResumableSession = async () => {
            try {
                const idb = await getDB();

                // 1. First, check if there's a specific snapshot linked via RECOVERY_KEY (Precise Resume)
                const snapshotId = localStorage.getItem(RECOVERY_KEY);
                if (snapshotId) {
                    const snapshot = await idb.get('history', snapshotId);
                    if (snapshot && (Date.now() - snapshot.timestamp < 3600000)) {
                        const data = snapshot.data;
                        const sess = data.session;
                        const nextQ = getNextQuestionSync(sess);

                        if (nextQ && sess.status === 'ACTIVE') {
                            setResumableSession({
                                snapshot,
                                questionsLeft: 15 - (sess.history?.length || 0),
                                subject: sess.subject || 'General',
                                createdAt: sess.updatedAt || snapshot.timestamp
                            });
                            logger.quiz(`Precise resumable session found via localStorage: ${sess.subject}`);
                            return;
                        }
                    }
                }

                // 2. FALLBACK (Silent Recovery Fix): Search the quiz_sessions table for ANY active session
                // This catches sessions that lost their localStorage link but are still active in IDB.
                const allSessions = await idb.getAll('quiz_sessions');
                const activeSess = allSessions.find(s =>
                    s.status === 'ACTIVE' &&
                    s.expiresAt > Date.now() &&
                    (s.history?.length || 0) < 15
                );

                if (activeSess) {
                    // Create a synthetic snapshot if one doesn't exist for the UI banner
                    setResumableSession({
                        snapshot: { data: { session: activeSess } },
                        questionsLeft: 15 - (activeSess.history?.length || 0),
                        subject: activeSess.subject || 'General',
                        createdAt: activeSess.updatedAt
                    });
                    logger.quiz(`Implicit resumable session found in IDB: ${activeSess.subject}`);
                } else {
                    setResumableSession(null);
                    localStorage.removeItem(RECOVERY_KEY);
                }
            } catch (e) {
                console.error('[QUIZ] Error checking for resumable session:', e);
                setResumableSession(null);
            }
        };

        checkForResumableSession();
    }, [user.id]);

    const persistState = async (currentResults: QuestionResult[], lvl: number, sess: QuizSessionV2) => {
        if (!isSessionActiveRef.current) return;

        try {
            const idb = await getDB();
            const snapshotId = localStorage.getItem(RECOVERY_KEY) || `session_${Date.now()}`;

            await idb.put('history', {
                id: snapshotId,
                userId: user.id,
                type: 'quiz_v2_session',
                title: `Quiz: ${sessionContextRef.current?.subject || 'Unknown'}`,
                timestamp: Date.now(),
                data: {
                    session: sess,
                    results: currentResults,
                    currentLevel: lvl,
                    sessionContext: sessionContextRef.current
                }
            });

            localStorage.setItem(RECOVERY_KEY, snapshotId);
        } catch (e) {
            console.error('[QUIZ] Failed to persist state:', e);
        }
    };

    const loadSources = async () => {
        // 1. Fetch Local First (Immediate visibility)
        const localData = await getLocalTrainingSources(user.id);
        setSources(localData);

        // 2. Hydrate from Cloud in background
        try {
            const cloudSourcesSnap = await db.collection('training_sources')
                .where('studentId', '==', user.id)
                .get();
            const cloudData = cloudSourcesSnap.docs.map(d => d.data() as LocalTrainingSource);

            // Merge Logic: Local is primary, Cloud fills gaps
            setSources(prev => {
                const map = new Map<string, LocalTrainingSource>(prev.map(s => [s.fileHash, s]));
                cloudData.forEach(c => {
                    const existing = map.get(c.fileHash);
                    if (!existing || existing.status !== 'Completed') {
                        map.set(c.fileHash, c);
                    }
                });
                return Array.from(map.values());
            });
        } catch (e) {
            console.warn("[UCCS_SYNC] Background source hydration failed.");
        }
    };

    const trainedDocs = useMemo(() => {
        const normalizedSelected = normalizeSubjectName(selectedSubject);
        let docs = (sources as LocalTrainingSource[]).filter((s) => {
            const normSourceSub = normalizeSubjectName(s.subject);
            return normSourceSub === normalizedSelected && s.status === 'Completed';
        });
        if (docSearchTerm.trim()) {
            docs = docs.filter(d => d.fileName.toLowerCase().includes(docSearchTerm.toLowerCase()));
        }
        return docs.sort((a, b) => b.createdAt - a.createdAt);
    }, [sources, selectedSubject, docSearchTerm]);

    const toggleDoc = (hash: string) => {
        if (isProcessing) return;
        setSelectedDocId(hash);
    };

    const handleStart = async (overrideRequest?: GenerationRequest) => {
        const targetSubject = overrideRequest?.subject || selectedSubject;

        // --- SCOPE NORMALIZATION (CRITICAL FIX) ---
        let scope = (initialRequest?.metadata?.scope || 'SUBJECT') as 'FILE' | 'SUBJECT' | 'ALL';
        // STRICT FIX: Ensure SUBJECT scope uses Subject Name as ScopeID, NOT a potentially undefined contentId
        let scopeId = overrideRequest?.contentId || (scope === 'FILE' ? selectedDocId : selectedSubject);

        // ✅ SCOPE GUARD: If user selected a file in the picker, force FILE scope
        if (selectedDocId) {
            scope = 'FILE';
            scopeId = selectedDocId;
            console.log(`[QUIZ_CONTRACT] Forced FILE scope for selected document: ${selectedDocId}`);
        } else if (scope === 'SUBJECT') {
            scopeId = targetSubject;
        }

        const origin = overrideRequest?.metadata?.origin || 'SELF_PRACTICE';

        // --- DEFENSIVE CONTRACT WATCHDOG (V3.1) ---
        // Failsafe to detect if Radar normalization was bypassed
        if (origin === 'ONBOARDING' || scope === 'ALL') {
            console.error('[QUIZ_CONTRACT_VIOLATION] Illegal Contract Detected!', { origin, scope });
        }

        // ✅ INVARIANT CHECK: If origin is PRACTICE and file is selected, scope MUST be FILE
        if (origin === 'PRACTICE' && selectedDocId && scope !== 'FILE') {
            console.error('[QUIZ_INVARIANT_BREAK] Selected File but Scope is NOT FILE!', { selectedDocId, scope });
            // Auto-heal
            scope = 'FILE';
            scopeId = selectedDocId;
        }

        // Safety check for UI-picker start
        if (scope === 'FILE' && !scopeId) {
            alert("File scope selected but no file ID provided. Please select a file.");
            return;
        }

        // FIX: Robust check to prevent empty array from hijacking flow as Repair
        const isRepair = origin === 'REPAIR';

        // --- CLEAR HISTORY FOR LOADER ---
        setLoadingHistory([]);

        // --- SET CHALLENGE MODE FLAG ---
        isChallengeModeRef.current = origin === 'CHALLENGE';

        // --- STORE ORIGIN/SCOPE FOR POLICY ENFORCEMENT ---
        sessionOriginRef.current = origin as any;
        sessionScopeRef.current = scope;

        logger.quiz(`Initializing session. Scope: ${scope} | ID: ${scopeId} | Origin: ${origin}`);
        setIsProcessing(true);
        setLobbyStatus("Neural Bridge Handshake...");
        setSessionMessage(null);
        setMessageType('warning');
        setChallengeOutcome(null); // Reset outcome

        isSessionActiveRef.current = true;
        aiRequestTokenRef.current = null;

        console.log(`[QUIZ_DEBUG] 🏁 START REQUEST: Origin=${origin} | Scope=${scope} | ID=${scopeId}`);
        console.log(`[QUIZ_DEBUG]    Config: Subject=${targetSubject} | IsRepair=${isRepair} | StruggleAtoms=${overrideRequest?.struggleAtoms?.length || 0}`);
        console.log(`[QUIZ_DEBUG]    Target Level Goal: ${levelGoalCount} | Allowed Types: ${allowedTypes.join(', ')}`);

        // --- ATOM ELIGIBILITY FILTER ---
        let candidates: AtomCore[] = [];
        // Strategy 1: Explicit Atom Selection (Repair OR Expand)
        if (overrideRequest?.struggleAtoms && overrideRequest.struggleAtoms.length > 0) {
            setLobbyStatus("Hydrating Targeted Matrix...");
            candidates = await hydrateAtomList(overrideRequest.struggleAtoms);
            if (candidates.length === 0) {
                console.warn("[QUIZ] Repair atoms missing. Attempting fallback...");
            }
        }
        // Strategy 2: File Scope (Strict Document Filter)
        else if (scope === 'FILE' && scopeId) {
            setLobbyStatus(`Indexing File: ${scopeId.slice(0, 8)}...`);
            const hydration = await fetchAtomsForSession(user.id, scopeId);
            candidates = hydration.atoms;

            // 🔥 CRITICAL FIX: Fallback to global hydration if local cache is empty
            if (candidates.length === 0) {
                setLobbyStatus(`Hydrating content from cloud...`);
                // Import hydrateBySourceId dynamically or assume it's imported at top
                logger.quiz(`[QUIZ_HYDRATION] Local cache miss for ${scopeId}. Attempting global fetch...`);

                // Try fetching by source ID (JIT Fallback)
                const globalAtoms = await hydrateBySourceId(user.id, scopeId);

                if (globalAtoms.length > 0) {
                    candidates = globalAtoms;
                    logger.quiz(`[QUIZ_HYDRATION] JIT Hydration Successful: ${candidates.length} atoms.`);
                } else if (overrideRequest?.struggleAtoms?.length) {
                    // Second Fallback: Repair atoms
                    setLobbyStatus(`Hydrating ${overrideRequest.struggleAtoms.length} repair atoms...`);
                    candidates = await hydrateAtomList(overrideRequest.struggleAtoms);
                }
            }

            // 🔥 WARM-START: Ensure cold atoms (NEW/Exploration) have generation signals
            // The AI/Engine rejects atoms with no signals, so we inject baseline scaffold.
            if (candidates && candidates.length > 0) {
                let warmedCount = 0;
                candidates = candidates.map(atom => {
                    const a = atom as any; // Cast for signal access
                    const needsWarmUp = !a.masteryLevel || a.masteryLevel === 'UNKNOWN' || a.masteryScore === undefined;
                    if (needsWarmUp) {
                        warmedCount++;
                        return {
                            ...atom,
                            masteryScore: a.masteryScore || 50,
                            masteryLevel: a.masteryLevel === 'UNKNOWN' ? 'FAMILIAR' : (a.masteryLevel || 'FAMILIAR'),
                            stability: a.stability || 0.3, // Default low stability
                            metadata: {
                                ...atom.metadata,
                                difficulty: (atom.metadata as any).difficulty || 1 // bias to easy
                            }
                        } as AtomCore;
                    }
                    return atom;
                });
                if (warmedCount > 0) {
                    logger.quiz(`[QUIZ_INIT] Warm-Started ${warmedCount} cold atoms for generation stability.`);
                }
            }

            console.log(`[QUIZ_DEBUG] 📂 FILE SCOPE: Fetched ${candidates ? candidates.length : 0} atoms.`);
            if (candidates && candidates.length > 0) {
                console.log(`[QUIZ_DEBUG]    Sample Atom: ${candidates[0].atomId} (${candidates[0].metadata.conceptTag})`);
            }

            // Apply mastery filter for "Repair Weak Atoms" button
            if (origin === 'REPAIR') {
                const masteryStats = await getStudentMasteryStats(user.id);
                const statsMap = new Map(masteryStats.map(s => [s.atomId, s]));
                candidates = candidates.filter(a => {
                    const stat = statsMap.get(a.atomId);
                    // Include if Unknown, Weak, or Partial ( < 80% )
                    return !stat || stat.masteryPct < 80;
                });

                if (candidates.length === 0) {
                    setMessageType('success');
                    setSessionMessage("Excellent! All concepts in this file are fully mastered.");
                    setIsProcessing(false);
                    return;
                }
            }
        }
        // Strategy 3: Subject Scope (Broad Filter)
        else if (scope === 'SUBJECT') {
            setLobbyStatus(`Scanning Subject: ${targetSubject}...`);
            // Load ALL local atoms for user
            const allViewModels = await getLocalAtoms(user.id);
            const normalizedTarget = normalizeSubjectName(targetSubject);

            let subjectAtoms = allViewModels
                .map(vm => vm.core)
                .filter(c => normalizeSubjectName(c.metadata.subject) === normalizedTarget);

            // Apply Mode Filters
            if (origin === 'EXPAND') {
                // Filter for UNKNOWN atoms
                const masteryStats = await getStudentMasteryStats(user.id);
                const knownIds = new Set(masteryStats.map(s => s.atomId));
                subjectAtoms = subjectAtoms.filter(a => !knownIds.has(a.atomId));
            } else if (origin === 'CHALLENGE') {
                // Robust Challenge Selection: 85% -> 70% -> Best Available
                const masteryStats = await getStudentMasteryStats(user.id);
                const statsMap = new Map(masteryStats.map(s => [s.atomId, s.masteryPct]));

                // 1. Elite Mastery (>= 85%)
                let pool = subjectAtoms.filter(a => (statsMap.get(a.atomId) || 0) >= 85);

                // 2. Fallback: Strong Mastery (>= 70%)
                if (pool.length === 0) {
                    pool = subjectAtoms.filter(a => (statsMap.get(a.atomId) || 0) >= 70);
                }

                // 3. Fallback: Best Available (Top 12 by mastery desc)
                // Ensures we always produce a quiz if atoms exist in the subject
                if (pool.length === 0) {
                    pool = subjectAtoms
                        .sort((a, b) => (statsMap.get(b.atomId) || 0) - (statsMap.get(a.atomId) || 0))
                        .slice(0, 12);
                }

                // Cap at 12 and randomize for variety within the chosen tier
                if (pool.length > 12) {
                    pool = pool.sort(() => 0.5 - Math.random()).slice(0, 12);
                }

                subjectAtoms = pool;
                logger.quiz(`Challenge atoms resolved: ${subjectAtoms.length}`);
            }

            console.log(`[QUIZ_DEBUG] 📚 SUBJECT SCOPE: Resolved ${subjectAtoms.length} candidates.`);
            candidates = subjectAtoms;

            if (candidates.length === 0) {
                setMessageType('success');
                setSessionMessage(`No ${origin === 'EXPAND' ? 'new' : 'mastered'} atoms found for ${targetSubject}. Try a different mode.`);
                if (dashboardContext) {
                    // Fallback: Just return to compass after message shown (manual close by user)
                    // Or auto-redirect logic could be here
                }
                setIsProcessing(false);
                return;
            }
        }
        else if (scope === 'ALL' || origin === 'ONBOARDING') {
            // ONBOARDING / GLOBAL SCOPE HANDLING
            // Fetch a sampling of atoms from all available subjects
            // For now, we'll try to find any subject data available or pull from a global pool if it existed.
            // Since we don't have a global atom index handy here, we'll map through known subjects.

            // NOTE: Ideally we should fetch atoms for all subjects the student has. 
            // For MVP speed, we'll default to a "General Knowledge" or just grab atoms from the 'first' available subject if 'ALL' is passed.
            // Better strategy: The parent should have passed subjectId='ALL'. 
            // But the Quiz Engine needs *some* atoms.

            // FIX: If Scope is ALL, we must ensure candidates is not undefined.
            // We will try to fetch from *all* subjects in user profile if possible, or trigger a special generation mode.
            // For this specific crash fix, we initialized candidates to [] at start, but the logic above blocks might have skipped it?
            // Actually, candidates is let-declared.

            // Let's grab atoms from *any* available subject in the user's list?
            // Or simpler: Just define a fallback.

            console.log('[QUIZ_INIT] Scope ALL detected. Attempting dynamic aggregation...');

            // 1. Try to fetch REAL data first (Dynamic)
            const allLocalAtoms = await getLocalAtoms(user.id); // Returns AtomViewModel[]
            candidates = allLocalAtoms.map(vm => vm.core);

            // 2. Cold Start: If no atoms exist, DYNAMICALLY generate seeds from User Profile
            if (candidates.length === 0) {
                console.log('[QUIZ_INIT] Cold Start: Generating dynamic seeds from User Subjects...');

                const userSubjects = user.preferences?.subjects?.length > 0
                    ? user.preferences.subjects
                    : ['General Knowledge'];

                candidates = userSubjects.map((subj, idx) => ({
                    atomId: `SEED_${subj.toUpperCase().slice(0, 3)}_${Date.now()}_${idx}`,
                    trustScore: 1,
                    metadata: {
                        conceptTag: `Introduction to ${subj}`,
                        subject: subj,
                        language: user.preferences?.defaultLanguage || 'English',
                        narrativeSequence: 1,
                        sourceDocumentId: 'dynamic_seed',
                        updatedAt: Date.now(),
                        userId: 'system',
                        gradeLevel: 10
                    },
                    coreRepresentation: {
                        definition: `Foundational concepts in ${subj}.`,
                        keyRule: 'Key Principles',
                        formula: '',
                        primaryExample: 'Introductory example.'
                    },
                    extendedRepresentation: {
                        fullExplanation: 'Generated seed for cold-start onboarding.',
                        analogy: '',
                        misconceptions: [],
                        realWorldAnalogy: '',
                        proTips: []
                    },
                    assessmentMetadata: {
                        difficultyCeiling: 1,
                        highestBloomObserved: 1,
                        essentialKeywords: [],
                        cognitiveLoad: 'low',
                        prerequisiteConceptTags: []
                    }
                }));
            }
        }

        try {
            // Map QuizSessionInit to QuizSessionV2 structure
            // Use virtual ID for Subject Scope to prevent collision with specific file sessions
            setLobbyStatus("Initializing QSE Matrix...");
            logger.quiz(`Atoms pool: ${candidates.length}`);

            // 🛡️ CRITICAL GUARD: Validate atom pool before synthesis
            if (candidates.length === 0) {
                throw new Error('No learning content available for this subject. Please ingest materials first.');
            }

            // ✅ ORIGIN-AWARE GUARD: Strict content validation only for specific modes
            // REPAIR mode uses known signals, so we trust the content exists.
            // CHALLENGE mode: We rely on the QSE (Quiz Engine) to filter bad atoms, rather than blocking the whole session here.
            const strictAssessmentModes: string[] = []; // Relaxed for now to prevent "Content Prepared" errors on valid but light atoms
            const requiresFullContent = strictAssessmentModes.includes(origin);

            if (origin === 'REPAIR' && candidates.length === 0) {
                throw new Error("Unable to start repair quiz — no weak atoms found.");
            }

            if (requiresFullContent) {
                // Check if atoms have sufficient content for question generation
                const assessableAtoms = candidates.filter(a =>
                    a.coreRepresentation?.definition && a.coreRepresentation.definition.length > 10
                );

                if (assessableAtoms.length === 0) {
                    throw new Error('Content is being prepared for assessment. Please try again in a moment or study the material first.');
                }

                logger.quiz(`Assessable atoms: ${assessableAtoms.length} / ${candidates.length}`);
            } else {
                // For NEW/PRACTICE/SMART modes, allow quiz to proceed with any content
                logger.quiz(`Exploration/Practice mode - skipping strict content validation`);
            }

            // ✅ POLICY ENFORCEMENT: Filter question types based on mode
            let effectiveAllowedTypes = resolveAllowedQuestionTypes(
                origin as any,
                scope,
                allowedTypes as any[]  // Cast to avoid type error (string[] vs QuestionType[])
            );

            // ✅ DEFENSIVE DOWNGRADE: If requested quizType is strictly forbidden, downgrade to allowed
            // This prevents "No questions available" when UI asks for Mix but Policy says MCQ-only
            // This logic handles session resumption, but for NEW initialization:
            // If the initial request (e.g., from Compass) specified a type that is now forbidden by policy,
            // we should ensure `effectiveAllowedTypes` reflects the policy.
            // The `resolveAllowedQuestionTypes` call above already handles this for new sessions.
            // For existing sessions, the `typesChanged` logic below will update `activeSess.config.allowedTypes`.

            // Log policy violations for telemetry
            if (effectiveAllowedTypes.length !== allowedTypes.length) {
                const filtered = allowedTypes.filter(t => !effectiveAllowedTypes.includes(t as QuestionType));
                console.warn(`[POLICY] Filtered forbidden types in ${origin} mode:`, filtered.join(', '));
            }

            const sessionSourceId = scope === 'SUBJECT' ? `SUBJECT_${normalizeSubjectName(targetSubject)}` : scopeId!;

            const forceNew = hasClearedSessionRef.current;
            let activeSess: QuizSessionV2 = (session && !forceNew) ? session :
                await initializeDurableSession(user.id, sessionSourceId, targetSubject, user, {
                    levelQuestionCount: levelGoalCount,
                    allowedTypes: effectiveAllowedTypes  // ← Use enforced types
                }, forceNew);

            // Reset the clear flag now that we've used it
            hasClearedSessionRef.current = false;

            // ✅ FIX: Strict Question Type Enforcement (Session Update)
            // If resuming an existing session, ensure its config matches the user's CURRENT selection.
            // If types differ, update config and purge forbidden types from pools to force regeneration.
            if (origin === 'PRACTICE') {
                const currentTypes = activeSess.config.allowedTypes || [];
                // Check if sets are different
                const typesChanged = currentTypes.length !== effectiveAllowedTypes.length ||
                    !currentTypes.every(t => effectiveAllowedTypes.includes(t as QuestionType));

                if (typesChanged) {
                    logger.quiz(`Updating session allowed types: ${effectiveAllowedTypes.join(', ')}`);
                    activeSess.config.allowedTypes = effectiveAllowedTypes;

                    // Purge forbidden types from all pools
                    const isAllowed = (q: QuizQuestionV2) => effectiveAllowedTypes.includes(q.questionType as QuestionType);
                    let purgedCount = 0;

                    ([1, 2, 3] as const).forEach(lvl => {
                        const originalLen = activeSess.pools[lvl].length;
                        activeSess.pools[lvl] = activeSess.pools[lvl].filter(isAllowed);
                        purgedCount += (originalLen - activeSess.pools[lvl].length);
                    });

                    if (purgedCount > 0) {
                        logger.quiz(`Purged ${purgedCount} forbidden questions from pool.`);
                        // Reset synthesis lock to allow immediate refill
                        activeSess.synthesizingAtoms = [];
                    }

                    // Save the updated session configuration
                    await saveSessionV2(activeSess);
                }
            }
            // Override with QSIO plan parameters if available
            if (initialRequest?.questionCount) {
                activeSess.config.levelQuestionCount = Math.ceil(initialRequest.questionCount / 3);
            }

            const isChallenge = isChallengeModeRef.current;

            // Initialize IMMUTABLE Session Snapshot for Telemetry
            const context: QuizSessionContext = {
                sessionId: activeSess.sessionId,
                subject: targetSubject,
                mode: origin as string,
                scope: scope,
                scopeId: scopeId || undefined,
                atoms: candidates ? candidates.map(c => c.atomId) : [],
                allowedTypes: allowedTypes,
                levelGoal: levelGoalCount,
                startedAt: Date.now()
            };

            // CONTRACT GUARD: Fail fast if scope mismatch
            if (context.scope === 'FILE' && !context.scopeId) {
                throw new Error("Telemetry Contract Violation: FILE scope requires scopeId.");
            }

            sessionContextRef.current = context;

            if (activeSess.pools[1].length === 0 || activeSess.pools[2].length === 0 || activeSess.pools[3].length === 0) {
                setLobbyStatus("Generating Full Quiz Session...");

                // TOKEN GUARD: Generate new token for this request
                const token = crypto.randomUUID();
                aiRequestTokenRef.current = token;

                // 🚀 V3.3 SINGLE-SHOT GENERATION
                // Generates ALL questions for the session in one go. No rolling refills.
                await generateStaticSession(activeSess, user, (updated) => {
                    if (!isSessionActiveRef.current || aiRequestTokenRef.current !== token) return;
                    activeSess = updated;
                    setSession(updated);
                }, candidates || [], isChallenge, origin as any, scope as any, 'ADAPTIVE');
            } else {
                console.log(`[QUIZ_DEBUG] ✅ Session Reuse: Using existing session ${activeSess.sessionId}`);
                console.log(`[QUIZ_DEBUG]    Pool Status: L1=${activeSess.pools[1].length}, L2=${activeSess.pools[2].length}, L3=${activeSess.pools[3].length}`);
                setSession(activeSess);
            }

            if (!isSessionActiveRef.current) return;

            // ✅ LIS handles quiz telemetry via ingestEvent now
            // Legacy quiz_v2_started telemetry removed (deprecated)

            const next = getNextQuestionSync(activeSess);
            if (next) {
                // ✅ TELEMETRY: Success-Based Quota Increment (Centralized via Matrix)
                ingestEvent({
                    id: crypto.randomUUID(),
                    idempotencyKey: `quiz_gen_${activeSess.sessionId}`,
                    studentId: user!.id,
                    sessionId: activeSess.sessionId,
                    timeContext: {
                        durationSec: 0,
                        mode: isChallenge ? 'challenge' : 'practice',
                        attemptType: 'first'
                    },
                    eventType: 'quiz.generated',
                    schemaVersion: '2.1.1',
                    timestamp: new Date().toISOString(),
                    payload: { sessionId: activeSess.sessionId, subject: activeSess.subject }
                });

                setCurrentQ(next);
                sessionStartTimeRef.current = Date.now();
                questionStartTimeRef.current = Date.now();
                setIsAnswered(false);
                setSelectedIdx(null);
                setTextInput('');
                setMatchState({ left: null, right: null, links: [] });
                setResults([]); // Clear results on new start
                setPhase('ENGINE');
                setSession({ ...activeSess, status: 'ACTIVE' });
                await persistState([], activeSess.currentLevel, activeSess);
            } else {
                // FIX: Graceful handling of empty question pool
                // Show user-friendly error modal instead of silent failure
                logger.error('QUIZ', "No questions available after init sequence.");
                setErrorModal({
                    title: '⚠️ API Quota Exceeded',
                    message: 'We\'ve run out of AI credits for question generation. This usually resets in a few hours. Please try again later.',
                    action: 'Back to Compass',
                    onAction: onBack
                });
                setPhase('PICKER');
            }
        } catch (e: any) {
            logger.error('QUIZ', "Quiz Init Fault", e);

            // Parse error for user-friendly message
            const errorMsg = e?.message || String(e);
            let title = '❌ Quiz Generation Failed';
            let message = 'An unexpected error occurred. Please try again.';
            let action = 'Try Again';

            if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
                title = '⏱️ Daily Limit Reached';
                message = 'You\'ve reached the daily limit for AI-generated quizzes. The quota resets in a few hours. Please try again later or use existing quizzes.';
                action = 'Got It';
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                title = '🌐 Connection Error';
                message = 'Could not connect to the server. Please check your internet connection and try again.';
                action = 'Retry';
            }

            setErrorModal({
                title,
                message,
                action: 'Back to Compass',
                onAction: onBack
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const [isRetryMode, setIsRetryMode] = useState(false);

    const handleAnswer = async (answer: any) => {
        console.log(`[QUIZ_DEBUG] 🗳️ User Answered:`, answer);

        if (isAnswered || !session || !currentQ) return;

        const timeTaken = Date.now() - questionStartTimeRef.current;
        let isCorrect = false;
        if (currentQ.questionType === 'MCQ' || currentQ.questionType === 'TrueFalse') {
            setSelectedIdx(answer);
            isCorrect = answer === currentQ.correctIndex;

            console.group(`[QUIZ_GRADING] ${currentQ.questionType} | ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
            console.log(`Student Selected Index: ${answer} (${currentQ.options[answer] || 'Unknown'})`);
            console.log(`AI Correct Index: ${currentQ.correctIndex} (${currentQ.options[currentQ.correctIndex] || 'N/A'})`);
            console.log(`AI Truth Text: "${currentQ.answer || 'N/A'}"`);
            console.groupEnd();

        } else if (currentQ.questionType === 'FillIn') {
            const studentVal = String(answer).trim().toLowerCase();
            const aiVal = String(currentQ.answer || '').trim().toLowerCase();
            isCorrect = studentVal === aiVal;

            console.group(`[QUIZ_GRADING] FillIn | ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
            console.log(`Student Input: "${answer}"`);
            console.log(`AI Expected: "${currentQ.answer}"`);
            console.groupEnd();

        } else if (currentQ.questionType === 'Match') {
            const pairs = currentQ.pairs || [];
            isCorrect = answer.length === pairs.length && answer.every((link: [string, string]) =>
                pairs.some(p => p[0] === link[0] && p[1] === link[1])
            );

            console.group(`[QUIZ_GRADING] Match | ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
            console.log(`Student Links:`, answer);
            console.log(`AI Expected Pairs:`, pairs);
            console.groupEnd();
        }

        const duration = Date.now() - questionStartTimeRef.current;

        setIsAnswered(true);

        // 🛡️ RETRY MODE GUARD: If retrying (practice), do not pollute history/stats
        if (isRetryMode) {
            console.log(`[QUIZ_RETRY] Practice attempt completed. Correct: ${isCorrect}`);
            return;
        }

        const currentLvl = session.currentLevel;

        let newStreak = isCorrect ? session.metrics.streak + 1 : 0;
        let newWrong = isCorrect ? 0 : session.metrics.consecutiveWrong + 1;

        const updatedHistory = [...session.history, { ...currentQ, userAnswer: answer }];
        const updatedPool = session.pools[currentLvl].filter(q => q.id !== currentQ.id);

        updateAtomProgress(currentQ.atomId, currentLvl, isCorrect, session);

        // FIX: Generate QuestionResult for persistence
        const resultEntry: QuestionResult = {
            response: answer,
            isCorrect: isCorrect,
            responseTimeSec: duration / 1000,
            hintsUsedCount: 0,
            masteryDelta: isCorrect ? 0.1 : -0.05,
            atomId: currentQ.atomId
        };
        const newResults = [...results, resultEntry];
        setResults(newResults);

        const isCapReached = updatedHistory.length >= (session.totalAtoms || 9);
        const newStatus = isCapReached ? 'TERMINAL' : 'ACTIVE';

        const updatedSession: QuizSessionV2 = {
            ...session,
            history: updatedHistory,
            pools: { ...session.pools, [currentLvl]: updatedPool },
            metrics: { streak: newStreak, consecutiveWrong: newWrong },
            status: newStatus
        };

        setSession(updatedSession);
        await saveSessionV2(updatedSession);
        // FIX: Pass newResults instead of updatedHistory (which is QuizQuestionV2[])
        await persistState(newResults, session.currentLevel, updatedSession);

        // AI Refill Logic
        if (newStatus === 'ACTIVE' && isSessionActiveRef.current) {
            const token = crypto.randomUUID();
            aiRequestTokenRef.current = token;

            refillPoolsIfNecessary(updatedSession, user, (u) => {
                if (!isSessionActiveRef.current || aiRequestTokenRef.current !== token) return;
                setSession(u);
            });
        }
    };



    const handleEarlyExit = () => {
        if (!session) { onBack(); return; }

        const ctx = sessionContextRef.current;
        const isChallenge = isChallengeModeRef.current;

        // HARD GATE: Kill guards immediately
        isSessionActiveRef.current = false;
        aiRequestTokenRef.current = null;

        // P2: Emit Abandoned Telemetry using SNAPSHOT CONTEXT
        const granularResults = session.history.map(h => ({
            atomId: h.atomId,
            isCorrect: calculateCorrectness(h),
            level: h.difficulty
        }));

        // ✅ LIS handles quiz telemetry via ingestEvent now
        // Legacy sendTelemetry removed


        localStorage.removeItem(RECOVERY_KEY);
        onBack();
    };

    const finishV2Session = async (finalSess?: QuizSessionV2) => {
        const sess = finalSess || session;
        if (!sess) return;

        const ctx = sessionContextRef.current;
        const isChallenge = isChallengeModeRef.current;

        if (ctx?.isCompleted) return;
        if (ctx) ctx.isCompleted = true;

        // HARD GATE: Lock session immediately
        isSessionActiveRef.current = false;
        aiRequestTokenRef.current = null;
        logger.quiz(`Session TERMINAL. Concluding mission.`);

        // 1. NON-BLOCKING PIPELINE (Fire and Forget)
        const heavyLifting = async () => {
            try {
                if (sess.status !== 'TERMINAL') {
                    const termSession: QuizSessionV2 = { ...sess, status: 'TERMINAL' };
                    await saveSessionV2(termSession);
                }

                // Calculate Granular Results for Precision Mastery (P0)
                const granularResults = sess.history.map(h => ({
                    atomId: h.atomId,
                    isCorrect: calculateCorrectness(h),
                    timeSpent: 30, // Default estimate if not tracked granularly yet in v2 History
                    evidenceType: isChallenge ? 'CHALLENGE' : 'QUIZ',
                    level: isChallenge ? 4 : h.difficulty // Preserve logic
                }));

                const finalScore = granularResults.filter(r => r.isCorrect).length;
                const total = sess.history.length;

                // Determine Challenge Outcome Logic
                let challengeStatus: 'PASS' | 'PARTIAL' | 'FAIL' | null = null;
                if (isChallenge) {
                    const pct = total > 0 ? (finalScore / total) * 100 : 0;
                    challengeStatus = pct >= 80 ? 'PASS' : pct >= 50 ? 'PARTIAL' : 'FAIL';
                    setChallengeOutcome(challengeStatus);
                    logger.quiz(`Challenge Outcome: ${challengeStatus} (${pct.toFixed(1)}%)`);
                }

                // P1: Sync V2 results to Legacy Dashboard immediately
                const legacyUpdates = isChallenge ? granularResults.filter(r => r.isCorrect) : granularResults;
                if (legacyUpdates.length > 0) {
                    await updateMasteryBatch(user.id, legacyUpdates);
                }

                const uniqueAtomIds = Array.from(new Set(sess.history.map(h => h.atomId)));

                // ✅ LIS TELEMETRY HANDOFF
                // Mapping local results to LIS Atom schema
                const elapsedTimeSec = sessionStartTimeRef.current ? Math.round((Date.now() - sessionStartTimeRef.current) / 1000) : 0;
                const lisResults = granularResults.map(r => ({
                    atomId: r.atomId,
                    isCorrect: r.isCorrect,
                    responseTimeSec: r.timeSpent || 0,
                    bloomLevel: r.level || 2,
                    attemptType: 'first' // Quiz is always first attempt in this context
                }));

                await connectTelemetry(sess, finalScore, total, user.id, lisResults, elapsedTimeSec);
                logger.quiz("Telemetry dispatched to Brain.");

                localStorage.removeItem(RECOVERY_KEY);
                logger.quiz("Background pipeline completed.");

            } catch (e) {
                logger.error('QUIZ', "CRITICAL: Quiz Session Initialization Failed", e);
            }
        };

        // Fire Pipeline
        heavyLifting();

        // 2. IMMEDIATE UI TRANSITION
        setPhase('SAVING');
        setTimeout(() => {
            setPhase('SUMMARY');
        }, 800);
    };

    const handleNext = () => {
        if (!session) return;
        const currentLvl = session.currentLevel;
        const currentPool = session.pools[currentLvl];

        if (currentPool.length === 0) {
            if (currentLvl < 3) {
                const nextLvl = (currentLvl + 1) as 1 | 2 | 3;
                const nextSess = { ...session, currentLevel: nextLvl };
                console.log(`[QUIZ_DEBUG] 🔼 LEVEL UP: ${currentLvl} -> ${nextLvl}`);
                setSession(nextSess);
                saveSessionV2(nextSess);
                setPhase('LEVEL_UP');
                return;
            } else {
                // ✅ ENGINE GUARD: Prevent Early Termination
                // If Level 3 is exhausted but we haven't reached target count, relax difficulty.
                const totalServed = session.history.length;
                const targetCount = session.totalAtoms || 9;

                if (totalServed < targetCount) {
                    // Ladder Continuity: Fallback to Level 2 or 1 if available
                    let fallbackLevel: 1 | 2 | 3 | null = null;
                    if (session.pools[2].length > 0) fallbackLevel = 2;
                    else if (session.pools[1].length > 0) fallbackLevel = 1;

                    if (fallbackLevel) {
                        console.log(`[QUIZ_GUARD] Relaxing stiffness: L3 exhausted, falling back to L${fallbackLevel}`);
                        const nextSess = { ...session, currentLevel: fallbackLevel };
                        setSession(nextSess);
                        saveSessionV2(nextSess);
                        setPhase('LEVEL_UP'); // Trigger transition to new level
                        return;
                    }
                }

                finishV2Session();
                return;
            }
        }

        if (session.status === 'TERMINAL') {
            finishV2Session();
            return;
        }

        const next = getNextQuestionSync(session);
        if (!next) {
            // 🛑 V3.3 SINGLE-SHOT TERMINATION
            // If we run out of questions, we finish. No more rolling refills.
            console.warn("[QUIZ_FLOW] Exhausted questions in safe mode. Terminating.");
            finishV2Session();
            return;
        }

        setCurrentQ(next);

        setCurrentQ(next);

        console.log(`[QUIZ_DEBUG] ➤ NEXT QUESTION SERVED: ${next.id} [${next.questionType}]`);
        console.log(`[QUIZ_DEBUG]    Difficulty: ${next.difficulty} | Concept: ${(next as any).metadata?.concept || 'N/A'}`);
        console.log(`[QUIZ_DEBUG]    Pools Remaining: L1=${session.pools[1].length}, L2=${session.pools[2].length}, L3=${session.pools[3].length}`);
        console.log(`[QUIZ_DEBUG]    Difficulty: ${next.difficulty} | Concept: ${(next as any).metadata?.concept || 'N/A'}`);

        questionStartTimeRef.current = Date.now();
        setIsAnswered(false);
        setIsRetryMode(false); // Reset retry mode
        setSelectedIdx(null);
        setTextInput('');
        setMatchState({ left: null, right: null, links: [] });
    };

    const handleRetrySession = async () => {
        if (!session) return;

        // Clear results state to ensure new session starts fresh
        setResults([]);
        setShowReview(false);
        setChallengeOutcome(null); // Reset Challenge Outcome

        // Retry Mode: Reset session with same questions but clear history
        setLoadingHistory([]);
        setIsProcessing(true);
        setLobbyStatus("Shuffling Knowledge Matrix...");

        isSessionActiveRef.current = true;
        aiRequestTokenRef.current = null;

        // FIX: Reset session context completion flag to allow retried session to finish
        if (sessionContextRef.current) {
            sessionContextRef.current.isCompleted = false;
        }

        const allQuestions = [...session.history];
        const resetPools = { 1: [] as QuizQuestionV2[], 2: [] as QuizQuestionV2[], 3: [] as QuizQuestionV2[] };

        allQuestions.forEach(q => {
            const difficulty = q.difficulty as 1 | 2 | 3;
            // Strip user answer from previous attempt
            const shuffled = { ...q, userAnswer: null };
            resetPools[difficulty].push(shuffled);
        });

        // RE-SHUFFLE THE POOLS
        Object.keys(resetPools).forEach(key => {
            const k = parseInt(key) as 1 | 2 | 3;
            resetPools[k] = resetPools[k].sort(() => Math.random() - 0.5);
        });

        // RETRY = NEW SESSION (Surgical Prompt Requirement)
        const oldSessionId = session.sessionId;
        const newSessionId = crypto.randomUUID();

        // Safe metadata handling
        const existingMetadata = (session as any).metadata || {};
        const retryMetadata = {
            ...existingMetadata,
            retryOfSessionId: oldSessionId,
            isRetry: true,
            attemptNumber: (existingMetadata.attemptNumber || 1) + 1
        };

        const updatedSession: QuizSessionV2 = {
            ...session,
            sessionId: newSessionId, // 🆔 NEW IDENTITY
            // @ts-ignore - Metadata extension
            metadata: retryMetadata,
            pools: resetPools,
            history: [],
            currentLevel: 1, // Reset to Level 1
            metrics: { streak: 0, consecutiveWrong: 0 },
            status: 'ACTIVE',
            updatedAt: Date.now(), // New timestamp
            expiresAt: Date.now() + (2 * 60 * 60 * 1000) // Extend life
        };

        // 🧠 SURGICAL CONTEXT UPDATE
        // Must update immediate context reference so telemetry uses the NEW ID for this session
        if (sessionContextRef.current) {
            sessionContextRef.current.sessionId = newSessionId;
            sessionContextRef.current.isCompleted = false; // Reset completion guard
            sessionContextRef.current.startedAt = Date.now();
        }

        // Persist as NEW session (saveSessionV2 uses session.sessionId as key)
        await saveSessionV2(updatedSession);

        // CRITICAL: Ensure bunker snapshot is also wiped/reset for the NEW ID
        await persistState([], 1, updatedSession);

        // Update Hook State
        setSession(updatedSession);

        const next = getNextQuestionSync(updatedSession);
        if (next) {
            // ✅ TELEMETRY: Success-Based Quota Increment (Centralized via Matrix)
            ingestEvent({
                id: crypto.randomUUID(),
                idempotencyKey: `quiz_retry_gen_${updatedSession.sessionId}_${Date.now()}`,
                studentId: user!.id,
                sessionId: updatedSession.sessionId,
                timeContext: {
                    durationSec: 0,
                    mode: isChallengeModeRef.current ? 'challenge' : 'practice',
                    attemptType: 'retry'
                },
                eventType: 'quiz.generated',
                schemaVersion: '2.1.1',
                timestamp: new Date().toISOString(),
                payload: { sessionId: updatedSession.sessionId, subject: updatedSession.subject }
            });

            setCurrentQ(next);
            questionStartTimeRef.current = Date.now();
            sessionStartTimeRef.current = Date.now(); // Reset session timer too
            setIsAnswered(false);
            setSelectedIdx(null);
            setTextInput('');
            setMatchState({ left: null, right: null, links: [] });
            setPhase('ENGINE');
        } else {
            setPhase('PICKER');
        }
        setIsProcessing(false);
    };

    const handleChallengeExit = async () => {
        if (!session) return;

        // 1. Clear quiz-local state (Bunker) to prevent resurrection
        localStorage.removeItem(RECOVERY_KEY);
        // Bunker snapshot is already cleared via finishV2Session, ensuring clean exit.

        const subject = session.subject || selectedSubject;

        // 2. Dispatch Orchestrator Events
        if (dashboardContext) {
            // Exit Quiz Feature
            dashboardContext.dispatch({ type: 'CLOSE_FEATURE' });

            // Open Compass Feature
            setTimeout(() => {
                dashboardContext.dispatch({
                    type: 'OPEN_FEATURE',
                    featureId: 'subject_compass',
                    props: { subject }
                });
            }, 50);
        } else {
            // Legacy fallback
            onComplete();
        }
    };

    const getOptionLabel = (index: number) => {
        if (isArabic) {
            const arabicLabels = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
            return arabicLabels[index] || String.fromCharCode(65 + index);
        }
        return String.fromCharCode(65 + index);
    };

    const renderPolymorphicInput = () => {
        if (!currentQ) return null;

        // Check if subject is Arabic to apply RTL
        const isArabicSubject = session?.subject?.toLowerCase().includes('arabic') ||
            session?.subject?.toLowerCase().includes('عربي');
        const questionDir = isArabicSubject ? 'rtl' : 'ltr';
        const questionAlign = isArabicSubject ? 'text-right' : 'text-left';

        if (currentQ.questionType === 'Match') {
            const lefts = Array.from(new Set(currentQ.pairs?.map(p => p[0])));
            const rights = Array.from(new Set(currentQ.pairs?.map(p => p[1]))).sort(() => Math.random() - 0.5);

            // Visual Theme for Pairs (distinct visually for "connection")
            /* LINK_THEMES is now global */

            return (
                <div className="space-y-6 sm:space-y-8" dir={questionDir}>
                    {/* RESET BUTTON (Only if links exist and not answered) */}
                    {/* RESET / RETRY BUTTON */}
                    {matchState.links.length > 0 && (
                        <div className="flex justify-end animate-fade-in">
                            {!isAnswered ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setMatchState({ left: null, right: null, links: [] })}
                                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider flex items-center gap-1 transition-colors border-none bg-transparent hover:bg-red-50"
                                >
                                    <span>↺</span> Reset all connections
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setMatchState({ left: null, right: null, links: [] });
                                        setIsAnswered(false);
                                        setIsRetryMode(true);
                                    }}
                                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 uppercase tracking-wider flex items-center gap-1 transition-colors border-none bg-transparent hover:bg-indigo-50"
                                >
                                    <span>↺</span> Retry Matching (Practice)
                                </Button>
                            )}
                        </div>
                    )}

                    {/* RESPONSIVE: Single column on mobile, side-by-side on desktop */}
                    <div ref={matchContainerRef} className="flex flex-col lg:grid lg:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 md:gap-8 items-start relative">
                        {/* CONNECTION LINES LAYER */}
                        <MatchConnectionLines
                            matchState={matchState}
                            leftRefs={leftRefs}
                            rightRefs={rightRefs}
                            containerRef={matchContainerRef as React.RefObject<HTMLDivElement>}
                            isAnswered={isAnswered}
                            currentQ={currentQ}
                        />

                        {/* LEFT COLUMN (Sources) */}
                        <div className="space-y-4 z-10">
                            {lefts.map((l, i) => {
                                const linkIndex = matchState.links.findIndex(link => link[0] === l);
                                const isLinked = linkIndex !== -1;
                                const isSelected = matchState.left === l;
                                const theme = isLinked ? LINK_THEMES[linkIndex % LINK_THEMES.length] : null;

                                return (
                                    <button
                                        key={l as string}
                                        ref={el => { if (el) leftRefs.current.set(l as string, el); }}
                                        disabled={isAnswered || isLinked}
                                        onClick={() => setMatchState(prev => ({ ...prev, left: l as string }))}
                                        className={`w-full relative group transition-all duration-300 ${isLinked
                                            ? `scale-95 ${theme?.bg} ${theme?.border} border-2 shadow-sm`
                                            : isSelected
                                                ? 'scale-105 border-indigo-600 bg-indigo-50 shadow-lg border-2 z-20'
                                                : 'border-slate-200 bg-white hover:border-indigo-300 border-2 shadow-sm'
                                            } p-4 rounded-2xl flex items-center justify-between`}
                                    >
                                        <span className={`text-[11px] font-black uppercase text-start ${isLinked ? theme?.text : isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>{l as string}</span>

                                        {/* Connector Node */}
                                        <div className={`w-3 h-3 rounded-full transition-all border-2 ${isLinked
                                            ? `${theme?.icon} border-white scale-125`
                                            : isSelected
                                                ? 'bg-indigo-600 border-white ring-2 ring-indigo-200 scale-125'
                                                : 'bg-slate-100 border-slate-300'}`}
                                        />
                                    </button>
                                );
                            })}
                        </div>

                        {/* CENTER (Visual Gap) */}
                        <div className="h-full w-px bg-slate-100 absolute left-1/2 -translate-x-1/2 top-0 bottom-0 -z-0 lg:hidden"></div>

                        {/* RIGHT COLUMN (Targets) */}
                        <div className="space-y-4 z-10">
                            {rights.map(r => {
                                const linkIndex = matchState.links.findIndex(link => link[1] === r);
                                const isLinked = linkIndex !== -1;
                                const theme = isLinked ? LINK_THEMES[linkIndex % LINK_THEMES.length] : null;
                                const canConnect = matchState.left && !isLinked;

                                return (
                                    <button
                                        key={r as string}
                                        ref={el => { if (el) rightRefs.current.set(r as string, el); }}
                                        // FIX: Removed "|| isLinked" to allow Many-to-One connections (e.g. Mic & Phone -> Mono)
                                        disabled={isAnswered || !matchState.left}
                                        onClick={() => {
                                            if (matchState.left) {
                                                // Prevent duplicate link for same pair
                                                if (matchState.links.some(l => l[0] === matchState.left && l[1] === r)) return;

                                                const newLinks: [string, string][] = [...matchState.links, [matchState.left as string, r as string]];
                                                setMatchState({ left: null, right: null, links: newLinks });
                                                if (newLinks.length === lefts.length) handleAnswer(newLinks);
                                            }
                                        }}
                                        className={`w-full relative transition-all duration-300 ${isLinked
                                            ? `scale-95 ${theme?.bg} ${theme?.border} border-2 shadow-sm`
                                            : canConnect
                                                ? 'border-indigo-200 bg-white hover:bg-indigo-50 hover:border-indigo-500 hover:shadow-md cursor-pointer border-2'
                                                : 'border-slate-100 bg-slate-50 opacity-60 border-2'
                                            } p-4 rounded-2xl flex items-center gap-3`}
                                    >
                                        {/* Connector Node (Left side) */}
                                        <div className={`w-3 h-3 rounded-full transition-all border-2 shrink-0 ${isLinked
                                            ? `${theme?.icon} border-white scale-125`
                                            : canConnect
                                                ? 'bg-white border-indigo-300 group-hover:bg-indigo-500'
                                                : 'bg-slate-200 border-slate-300'}`}
                                        />

                                        <span className={`text-xs font-bold text-start leading-snug ${isLinked ? theme?.text : 'text-slate-600'}`}>{r as string}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Matched Pairs List (Bottom Confirmation) */}
                    <div className="flex flex-wrap gap-2 justify-center">
                        {matchState.links.map((link, i) => {
                            const theme = LINK_THEMES[i % LINK_THEMES.length];
                            const correctPair = currentQ.pairs?.find(p => p[0] === link[0]);
                            const isCorrect = correctPair && correctPair[1] === link[1];

                            return (
                                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${theme.bg} ${theme.border} ${theme.text} text-[10px] font-black uppercase shadow-sm transition-all animate-pop`}>
                                    <div className={`w-2 h-2 rounded-full ${theme.icon}`}></div>
                                    <span className="max-w-[150px] truncate">{link[0]}</span>
                                    <span className="opacity-50">↔</span>
                                    <span className="max-w-[150px] truncate">{link[1]}</span>
                                    {isAnswered && (
                                        <span className={`ml-2 text-sm ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                                            {isCorrect ? '✓' : '✕'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (currentQ.questionType === 'FillIn') {
            const hasInlineBlank = currentQ.stem.includes('__') || (currentQ.answer && currentQ.stem.toLowerCase().includes(currentQ.answer.toLowerCase()));

            return (
                <div className="space-y-4" dir={questionDir}>
                    {/* Fallback Input: Only show if NO inline blank (standard mode) */}
                    {!hasInlineBlank && (
                        <input
                            readOnly
                            className={`w-full p-6 rounded-2xl border-2 border-slate-100 bg-white dark:bg-slate-800 text-xl font-bold outline-none focus:border-indigo-500 shadow-inner cursor-pointer ${questionAlign}`}
                            placeholder={isArabic ? "اختر الإجابة..." : "Select Answer..."}
                            value={textInput}
                            onClick={() => !isAnswered && setTextInput('')}
                            disabled={isAnswered}
                        />
                    )}

                    {!isAnswered && <Button onClick={() => handleAnswer(textInput)} className="w-full min-h-[48px] py-4 text-xs font-black uppercase tracking-widest">{isArabic ? "تحقق من الإجابة" : "Check Answer"}</Button>}

                    {isAnswered && <div className={`p-4 rounded-xl border-2 ${textInput.toLowerCase().trim() === currentQ.answer?.toLowerCase().trim() ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><p className="text-[10px] font-black uppercase mb-1">{isArabic ? "الإجابة المتوقعة" : "Expected Signature"}</p><p className="text-lg font-bold">{currentQ.answer}</p></div>}
                </div>
            );
        }
        const options = (currentQ.questionType === 'TrueFalse' && (!currentQ.options || currentQ.options.length === 0))
            ? (isArabic ? ['صواب', 'خطأ'] : ['True', 'False'])
            : (currentQ.options || []);

        return (
            <div className="space-y-2" dir={questionDir}>
                {options.map((opt, idx) => {
                    const isCorrect = idx === currentQ.correctIndex;
                    const isSelected = selectedIdx === idx;
                    let style = "border-slate-100 bg-white dark:bg-slate-800 shadow-sm";
                    if (isAnswered) {
                        if (isCorrect) style = "border-green-500 bg-green-50 text-green-700 shadow-none";
                        else if (isSelected) style = "border-red-500 bg-red-50 text-red-700 shadow-none";
                        else style = "opacity-40 grayscale-[0.5]";
                    }
                    return (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            disabled={isAnswered}
                            className={`w-full min-h-[48px] p-4 sm:p-3 text-start border-2 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center gap-3 ${style}`}
                        >
                            <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-black ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-400'
                                }`}>
                                {isAnswered && isCorrect ? '✓' : isAnswered && isSelected ? '✕' : getOptionLabel(idx)}
                            </div>
                            <span className={`flex-grow ${questionAlign}`}>{opt}</span>
                        </button>
                    );
                })}     </div >
        );
    };

    const sessionAccuracy = useMemo(() => {
        // Correctly calculates based on CURRENT session history only
        if (!session || session.history.length === 0) return 0;
        const correctCount = session.history.filter(calculateCorrectness).length;
        return Math.round((correctCount / session.history.length) * 100);
    }, [session]);

    // ✅ FIX: Moved bankTokens calculation to top level to avoid Hook Order Violation
    // Previously this was inside a conditional block within the render loop
    const bankTokens = useMemo(() => {
        if (!currentQ || currentQ.questionType !== 'FillIn') return [];
        if (currentQ.options && currentQ.options.length > 0) return currentQ.options;
        // Fallback: Scramble answer characters if no options provided
        return currentQ.answer ? currentQ.answer.split('').filter(c => c.trim() !== '').sort(() => Math.random() - 0.5) : [];
    }, [currentQ?.id, currentQ?.questionType, currentQ?.options, currentQ?.answer]);

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col min-h-[calc(100vh-4rem)]">
            {phase === 'PICKER' && (
                <GeneratorHeader
                    title="Quiz Generator"
                    onBack={onBack}
                    onExit={onBack}
                />
            )}

            <div className={`px-4 pb-20 animate-fade-in flex flex-col min-h-full ${isArabic ? 'font-arabic' : 'font-sans'}`} dir={isArabic ? 'rtl' : 'ltr'}>
                {sessionMessage && (
                    <div className={`mb-6 p-4 border rounded-2xl text-[11px] font-black uppercase tracking-widest animate-pop shadow-sm flex items-center gap-3 ${messageType === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                        <span className="text-lg">{messageType === 'success' ? '✅' : '⚠️'}</span>
                        {sessionMessage}
                        <button onClick={() => { setSessionMessage(null); if (messageType === 'success') onBack(); }} className="ml-auto opacity-40 hover:opacity-100">✕</button>
                    </div>
                )}

                {/* ERROR MODAL - User-Friendly Error Display */}
                {errorModal && (
                    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 max-w-md w-full shadow-2xl border-4 border-red-400 animate-pop">
                            <div className="text-center space-y-4">
                                <div className="text-6xl mb-2">{errorModal.title.split(' ')[0]}</div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">{errorModal.title.slice(errorModal.title.indexOf(' ') + 1)}</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {errorModal.message}
                                </p>
                                <button
                                    onClick={() => {
                                        setErrorModal(null);
                                        if (errorModal.onAction) {
                                            errorModal.onAction();
                                        } else {
                                            setPhase('PICKER');
                                        }
                                    }}
                                    className="w-full py-4 mt-4 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-transform hover:bg-red-700"
                                >
                                    {errorModal.action || 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ERROR / LOBBY FALLBACK TO PREVENT WHITE SCREEN */}
                {
                    (phase === 'LOBBY' || (!currentQ && phase === 'ENGINE')) && (
                        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 animate-pulse">
                            <div className="text-4xl">🔮</div>
                            <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest">{lobbyStatus || "Stabilizing Neural Link..."}</h3>
                            <Button variant="outline" className="text-xs text-red-400 border-none hover:bg-red-50" onClick={() => { setPhase('PICKER'); localStorage.removeItem(RECOVERY_KEY); }}>Reset Connection</Button>
                        </div>
                    )
                }

                {
                    phase === 'PICKER' && (
                        <div className="space-y-6 max-w-xl mx-auto w-full">

                            {/* RESUME QUIZ BANNER */}
                            {resumableSession && (() => {
                                // Helper to format time ago
                                const getTimeAgo = (timestamp: number) => {
                                    const minutes = Math.floor((Date.now() - timestamp) / 60000);
                                    if (minutes < 1) return 'just now';
                                    if (minutes === 1) return '1 minute ago';
                                    if (minutes < 60) return `${minutes} minutes ago`;
                                    const hours = Math.floor(minutes / 60);
                                    if (hours === 1) return '1 hour ago';
                                    return `${hours} hours ago`;
                                };

                                return (
                                    <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-2 border-indigo-200 dark:border-indigo-700 rounded-2xl animate-pop">
                                        <div className="flex items-start gap-4">
                                            <div className="text-3xl">📚</div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-black text-indigo-900 dark:text-indigo-100 mb-1">Quiz In Progress</h3>
                                                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-1">
                                                    <span className="font-black">{resumableSession.subject}</span> • Started {getTimeAgo(resumableSession.createdAt)}
                                                </p>
                                                <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                                                    <span className="font-black">{resumableSession.questionsLeft} questions</span> remaining
                                                </p>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <button
                                                        onClick={handleResumeQuiz}
                                                        className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                                                    >
                                                        Resume Quiz
                                                    </button>
                                                    <button
                                                        onClick={handleStartFresh}
                                                        className="w-full sm:w-auto px-6 py-3.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-2 border-slate-200 dark:border-slate-700 hover:border-red-300 hover:text-red-600 active:scale-95 transition-all"
                                                    >
                                                        Start Fresh
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <Card className="p-4 space-y-3">
                                {/* Subject Selector */}
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                                <span className="text-indigo-400">01.</span> {t.quiz.setup?.domain || "DOMAIN SCOPE"}
                                            </span>
                                        </div>
                                        <select
                                            className="w-full p-2.5 border-2 rounded-xl font-bold bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 text-sm"
                                            value={selectedSubject}
                                            onChange={(e) => { setSelectedSubject(e.target.value); setSelectedDocId(null); }}
                                        >
                                            {user.preferences.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <section className="space-y-1.5">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest"><span className="text-indigo-400">02.</span> {t.quiz.setup?.vault || "KNOWLEDGE VAULT"}</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                value={docSearchTerm}
                                                onChange={e => setDocSearchTerm(e.target.value)}
                                                className="text-[10px] p-1.5 pl-6 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-indigo-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 w-62 shadow-sm transition-all focus:w-40 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                                            />
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">🔍</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1 max-h-[120px] overflow-y-auto no-scrollbar border border-slate-100 dark:border-slate-700 rounded-xl p-1.5 bg-slate-50/30 dark:bg-slate-900/50">
                                        {trainedDocs.length > 0 ? trainedDocs.map(s => (
                                            <div key={s.id} onClick={() => s.status === 'Completed' && toggleDoc(s.fileHash)} className={`p-2 border rounded-lg transition-all cursor-pointer flex items-center justify-between ${selectedDocId === s.fileHash ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/50 dark:border-indigo-500 shadow-sm' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'}`}>
                                                <p className="font-bold text-xs break-words leading-tight pr-2">{s.fileName}</p>
                                                {selectedDocId === s.fileHash && <span className="text-indigo-600 font-bold text-[8px] uppercase">✓</span>}
                                            </div>
                                        )) : (
                                            <div className="p-2 text-center text-[9px] text-slate-400 font-bold uppercase">No material</div>
                                        )}
                                    </div>
                                </section>
                                <section className="space-y-1.5">
                                    <div className="flex justify-between items-center mb-2">
                                        {/* Hidden label */}

                                        {/* <span className="text-[10px] font-black text-indigo-600">{levelGoalCount} Q's</span> */}
                                    </div>
                                    {/* Hidden input */}

                                    {/* <div className="flex justify-between text-[8px] font-black text-slate-300">
                                        <span>3</span>
                                        <span>6</span>
                                        <span>9</span>
                                    </div> */}
                                </section>

                                <section className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"><span className="text-indigo-400">03.</span> {t.quiz.setup?.questionTypes || "QUESTION TYPES"}</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {QUESTION_TYPES.map(type => {
                                            const isSelected = allowedTypes.includes(type.id);
                                            return (
                                                <button
                                                    key={type.id}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            // Prevent deselecting the last one
                                                            if (allowedTypes.length > 1) setAllowedTypes(prev => prev.filter(t => t !== type.id));
                                                        } else {
                                                            setAllowedTypes(prev => [...prev, type.id]);
                                                        }
                                                    }}
                                                    className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${isSelected
                                                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900 shadow-sm'
                                                        : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-600'
                                                        }`}
                                                >
                                                    <span className="text-base">{type.icon}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-wider">{type.label}</span>
                                                    {isSelected && <div className="ml-auto w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                {resumableSession && (
                                    <p className="text-[9px] text-center text-amber-500 font-bold mt-2 animate-pulse">
                                        ⚠️ Starting a new quiz will discard your saved progress.
                                    </p>
                                )}

                                <QuotaGuard
                                    capability="quizzes"
                                    disabled={!selectedDocId || isProcessing}
                                    setView={setView}
                                >
                                    <Button
                                        onClick={() => {
                                            // SOFT GUARD: If active session exists, treat this as a "Discard & New" action
                                            if (resumableSession && !hasClearedSessionRef.current) {
                                                logger.quiz('Active session overwritten by new generation', { oldSessionId: resumableSession.snapshot?.data?.session?.sessionId });
                                                // Telemetry: session_abandoned
                                                // logSignal && logSignal('session_abandoned', { context: 'overwrite_new_gen' });
                                                localStorage.removeItem(RECOVERY_KEY);
                                                hasClearedSessionRef.current = true;
                                            }

                                            handleStart({
                                                subject: selectedSubject,
                                                contentId: selectedDocId || undefined,
                                                metadata: { scope: selectedDocId ? 'FILE' : 'SUBJECT', scopeId: selectedDocId || selectedSubject, origin: 'PRACTICE' }
                                            } as any);
                                        }}
                                        isLoading={isProcessing}
                                        className="w-full py-3 rounded-xl shadow-lg text-sm"
                                    >
                                        {!selectedDocId ? "Select Document to Start" : (t.quiz.setup?.generate || "Generate Quiz")} 🚀
                                    </Button>
                                </QuotaGuard>
                            </Card>
                        </div>
                    )
                }

                {/* ... ENGINE / SUMMARY RENDER ... */}
                {
                    phase === 'ENGINE' && currentQ && session && (
                        <div className="space-y-3 animate-fade-in relative max-w-4xl mx-auto">
                            {/* UNIFIED HEADER: Tree + HUD + Quit */}
                            <div className="bg-white/95 backdrop-blur-sm border-b border-slate-100 -mx-4 px-2 sm:px-4 py-2 sticky top-0 z-50 shadow-sm flex items-center justify-between gap-2">

                                {/* Left: Cognitive Ladder */}
                                <div className="flex-shrink-0">
                                    <CognitiveLadder session={session} />
                                </div>

                                {/* Center: HUD Stats */}
                                <div className="flex items-center gap-3 sm:gap-4 md:gap-6 justify-center flex-1">
                                    <div className="text-center">
                                        <div className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{t.quiz.hud?.progress || "Progress"}</div>
                                        <div className="text-xs sm:text-sm font-black text-indigo-600">
                                            {session.history.length}<span className="text-slate-300">/</span>{session.totalAtoms || (session.config.levelQuestionCount * 3)}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{t.quiz.hud?.depth || "Depth"}</div>
                                        <div className="text-xs sm:text-sm font-black text-emerald-600">
                                            {Math.round((session.history.filter(r => calculateCorrectness(r)).length / Math.max(1, session.history.length)) * 100)}%
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{t.quiz.hud?.pool || "Pool"}</div>
                                        <div className="text-xs sm:text-sm font-black text-amber-600">
                                            {session.pools[1].length + session.pools[2].length + session.pools[3].length + (session.pools[4]?.length || 0)}
                                            <span className="text-[8px] sm:text-[9px] text-slate-400 ml-0.5">{t.legacy?.left || "left"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Quit Button */}
                                <button
                                    onClick={handleEarlyExit}
                                    className="flex-shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-400 rounded-lg transition-all group active:scale-95"
                                >
                                    <svg className="w-3 h-3 text-red-500 group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-red-600">{t.quiz.quit || "Quit"}</span>
                                </button>
                            </div>

                            <Card
                                className="p-3 md:p-4 border-b-4 border-indigo-600 shadow-lg relative overflow-hidden"
                                dir={session.subject?.toLowerCase().includes('arabic') || session.subject?.toLowerCase().includes('عربي') ? 'rtl' : 'ltr'}
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-5 text-6xl">🧠</div>
                                <h3 className={`text-xl font-bold leading-snug ${session.subject?.toLowerCase().includes('arabic') || session.subject?.toLowerCase().includes('عربي') ? 'text-right' : 'text-left'}`}>
                                    {(() => {
                                        if (currentQ.questionType === 'FillIn') {
                                            // 1. Determine Words/Chars to show
                                            // Bank Tokens are now calculated at top level safely

                                            let stemToUse = currentQ.stem;
                                            const hasExplicitBlank = stemToUse.includes('__');

                                            // SMART DETECT: If no marker but answer exists in stem, replace it
                                            if (!hasExplicitBlank && currentQ.answer && stemToUse.toLowerCase().includes(currentQ.answer.toLowerCase())) {
                                                const regex = new RegExp(currentQ.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                                                stemToUse = stemToUse.replace(regex, '___');
                                            }

                                            const hasInlineBlank = stemToUse.includes('__');
                                            const parts = hasInlineBlank ? stemToUse.split(/_+/) : [stemToUse];

                                            return (
                                                <div className="flex flex-col gap-6">
                                                    {/* Question Text with Inline Input */}
                                                    <div className="leading-loose">
                                                        {hasInlineBlank ? parts.map((part, i) => (
                                                            <React.Fragment key={i}>
                                                                {part}
                                                                {i < parts.length - 1 && (
                                                                    <div className="inline-block relative">
                                                                        <span
                                                                            className={`mx-2 inline-flex items-center justify-center transition-all px-4 py-1 font-black text-center min-w-[120px] cursor-pointer rounded-xl border-b-4 ${isAnswered
                                                                                ? (textInput.toLowerCase().trim() === currentQ.answer?.toLowerCase().trim() ? 'bg-green-600 text-white border-green-700' : 'bg-red-600 text-white border-red-700 line-through')
                                                                                : (textInput ? 'bg-blue-600 text-white border-blue-700 shadow-[0_4px_0_0_rgba(29,78,216,1)] transform -translate-y-0.5' : 'border-slate-300 text-slate-400 bg-slate-50/50 hover:border-blue-400')
                                                                                }`}
                                                                            style={{ minHeight: '1.6em', minWidth: textInput ? `${Math.max(120, textInput.length * 15)}px` : '120px' }}
                                                                            onClick={() => !isAnswered && setTextInput('')}
                                                                        >
                                                                            {textInput || (
                                                                                <span className="animate-pulse opacity-40 font-black tracking-widest">
                                                                                    .....
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        )) : (
                                                            <div className="text-center">
                                                                {currentQ.stem}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Neural Word Bank */}
                                                    {!isAnswered && (
                                                        <div className="animate-slide-up">
                                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3 text-center">
                                                                {t.quiz.hud?.selectToConstruct || "Select Option or Type Answer"}
                                                            </p>
                                                            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                                                                {/* Use Options if available, else bankTokens (fallback char scramble) */}
                                                                {(currentQ.options && currentQ.options.length > 0 ? currentQ.options : bankTokens).map((token, idx) => {
                                                                    const isSelected = textInput === token;
                                                                    return (
                                                                        <button
                                                                            key={idx}
                                                                            // If options exist, replace text (Word Bank behavior). If chars, append (Spelling behavior).
                                                                            onClick={() => setTextInput(prev => (currentQ.options?.length ? token : prev + token))}
                                                                            className={`px-4 py-2 border-2 rounded-xl font-bold transition-all ${isSelected
                                                                                ? 'bg-blue-600 text-white border-blue-700 translate-y-1 shadow-none'
                                                                                : 'bg-white border-slate-200 shadow-[0_4px_0_0_rgba(226,232,240,1)] text-slate-600 hover:border-blue-400 active:translate-y-1 active:shadow-none'
                                                                                }`}
                                                                        >
                                                                            {token}
                                                                        </button>
                                                                    );
                                                                })}
                                                                {/* Backspace Logic - Hide if using Word Bank mode */}
                                                                {(!currentQ.options || currentQ.options.length === 0) && (
                                                                    <button
                                                                        onClick={() => setTextInput(prev => prev.slice(0, -1))}
                                                                        className="px-4 py-2 bg-red-50 border-2 border-red-100 shadow-[0_4px_0_0_rgba(254,226,226,1)] rounded-xl text-red-400 hover:bg-red-100 hover:text-red-500 active:translate-y-1 active:shadow-none transition-all"
                                                                    >
                                                                        ⌫
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return currentQ.stem;
                                    })()}
                                </h3>
                            </Card>
                            <div className="max-w-4xl mx-auto">{renderPolymorphicInput()}</div>
                            {isAnswered && (
                                <div className="animate-slide-up space-y-4 max-w-4xl mx-auto">
                                    <Card className="bg-indigo-50 border-indigo-100 p-4 italic text-sm text-slate-600 leading-relaxed shadow-inner">
                                        <span className="text-[8px] font-black uppercase text-indigo-400 mb-1 block">Neural Logic</span>
                                        {currentQ.explanation}
                                    </Card>
                                    <Button onClick={handleNext} className="w-full py-4 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs">
                                        {isArabic ? 'التالي →' : 'Acknowledge →'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )
                }

                {
                    phase === 'LEVEL_UP' && (
                        <div className="text-center py-20 animate-pop flex flex-col items-center max-w-xl mx-auto">
                            <div className="w-32 h-32 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-6xl mb-8 shadow-[0_0_50px_rgba(79,70,229,0.4)] animate-float">🆙</div>
                            <h2 className="text-4xl font-black mb-4 italic tracking-tighter uppercase">Cognitive Shift</h2>
                            <p className="text-slate-500 mb-12 italic text-sm max-w-xs mx-auto leading-relaxed">Level foundations verified. Transitioning to Level {session?.currentLevel}.</p>
                            <Button onClick={() => { const n = getNextQuestionSync(session!); if (n) { setCurrentQ(n); setIsAnswered(false); setSelectedIdx(null); setTextInput(''); setMatchState({ left: null, right: null, links: [] }); setPhase('ENGINE'); } else handleNext(); }} className="w-full py-6 rounded-3xl text-lg font-black uppercase tracking-widest">Next Level →</Button>
                        </div>
                    )
                }

                {
                    phase === 'SUMMARY' && session && (
                        <div className="text-center py-20 animate-fade-in flex flex-col items-center max-w-xl mx-auto">
                            {challengeOutcome === 'PASS' ? (
                                <div className="mb-8 p-8 bg-gradient-to-br from-indigo-900 to-purple-900 rounded-[3rem] shadow-2xl border-4 border-amber-400 relative overflow-hidden animate-pop">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                    <div className="relative z-10">
                                        <div className="text-8xl mb-4 animate-bounce">🏆</div>
                                        <h2 className="text-4xl font-black text-white mb-2 tracking-tight">CHALLENGE CRUSHED</h2>
                                        <div className="space-y-2 mb-6">
                                            <p className="text-emerald-400 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                                                <span>🔓</span> Advanced Level Unlocked
                                            </p>
                                            <p className="text-indigo-200 font-medium italic">
                                                "You reasoned like an expert."
                                            </p>
                                        </div>
                                        <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                                            <p className="text-white text-3xl font-black">{sessionAccuracy}%</p>
                                            <p className="text-[10px] text-indigo-300 uppercase tracking-widest">Mastery Precision</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <span className="text-6xl mb-8 animate-bounce">🏅</span>
                                    <h2 className="text-4xl font-black mb-4 italic tracking-tighter">Simulation Sealed</h2>
                                </>
                            )}

                            <IntelligenceHUD session={session} isAnswered={true} />

                            <div className="w-full max-w-sm space-y-3 mb-8">
                                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center">
                                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Session Accuracy</p>
                                    <p className="text-2xl font-black text-indigo-600">{sessionAccuracy}%</p>
                                </div>

                                {showReview ? (
                                    <div className="animate-slide-up space-y-4 mb-4">
                                        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Question Review</h3>
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-3 p-1">
                                            {session.history.map((q, idx) => {
                                                const isCorrect = calculateCorrectness(q);
                                                return (
                                                    <div key={idx} className={`p-4 rounded-xl border-2 text-start ${isCorrect ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                Q{idx + 1} • {isCorrect ? 'Correct' : 'Incorrect'}
                                                            </span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase">L{q.difficulty}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2">{q.stem}</p>
                                                        {!isCorrect && (
                                                            <p className="text-[9px] text-slate-500 mt-2 italic">Correct Answer: {q.questionType === 'MCQ' || q.questionType === 'TrueFalse' ? q.options?.[q.correctIndex || 0] : q.answer}</p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button onClick={() => setShowReview(false)} className="text-xs font-bold text-indigo-600 hover:underline">Hide Review</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowReview(true)} className="text-xs font-bold text-slate-400 hover:text-indigo-600 mb-4 transition-colors">🔍 Review Answers</button>
                                )}

                                <div className="w-full space-y-4">
                                    <Button
                                        onClick={() => sessionAccuracy >= 80 ? handleChallengeExit() : handleRetrySession()}
                                        className={`w-full group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] ${sessionAccuracy >= 80
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30'
                                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/30'
                                            } shadow-xl border-t border-white/20`}
                                    >
                                        <div className="relative z-10 flex flex-col items-center gap-2">
                                            <div className="flex items-center gap-2 text-white">
                                                <span className="text-2xl group-hover:rotate-12 transition-transform duration-500">
                                                    {sessionAccuracy >= 80 ? '🚀' : '🔄'}
                                                </span>
                                                <span className="text-sm font-black uppercase tracking-[0.25em]">
                                                    {sessionAccuracy >= 80 ? 'Challenge Me' : 'Retry Matrix'}
                                                </span>
                                            </div>
                                            {sessionAccuracy < 80 && (
                                                <div className="flex flex-col items-center space-y-0.5 opacity-90">
                                                    <div className="h-px w-12 bg-white/30 mb-1" />
                                                    <span className="text-[9px] font-medium text-indigo-50 tracking-wide uppercase">
                                                        Same Questions • Different Order
                                                    </span>
                                                    <span className="text-[8px] text-indigo-200">
                                                        Verify your mastery
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {/* Glass Shine Effect */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                                    </Button>

                                    <Button
                                        onClick={() => { isSessionActiveRef.current = false; onComplete(); }}
                                        variant="outline"
                                        className="w-full !bg-white dark:!bg-slate-800 !border-3 !border-indigo-100 dark:!border-slate-700 !text-slate-600 dark:!text-slate-300 hover:!border-indigo-300 hover:!text-indigo-600 hover:!bg-indigo-50/50 py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 group shadow-sm"
                                    >
                                        <span className="group-hover:-translate-x-1 transition-transform">←</span>
                                        Back to Compass
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    phase === 'SAVING' && (
                        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 animate-fade-in">
                            <div className="text-6xl animate-bounce">💾</div>
                            <h3 className="text-xl font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Saving Progress...</h3>
                            <p className="text-sm text-slate-400">Updating your mastery profile</p>
                        </div>
                    )
                }

                {isProcessing && phase !== 'SAVING' && <QuizGenerationLoader status={lobbyStatus} history={loadingHistory} />}
            </div>
        </div>
    );
};

export default AdaptiveQuizModuleV2;
