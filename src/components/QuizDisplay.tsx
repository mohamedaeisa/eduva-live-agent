
import React, { useState, useEffect, useRef } from 'react';
import { QuizData, QuizResult, Language, QuizQuestion, UserProfile, QuizType, Difficulty, GenerationRequest, EducationSystem, DetailLevel } from '../types';
import { analyzeWeakness } from '../services/geminiService';
import { saveQuizResult } from '../services/storageService';
import { logEvent } from '../services/analyticsService';
import { logRawActivity, getActiveStudentNudges, resolveNudge } from '../services/parentService';
import { sendTelemetry } from '../services/telemetryBrainService';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import katex from 'katex';

declare global {
  interface Window {
    confetti: any;
  }
}

interface QuizDisplayProps {
  data: QuizData;
  onBack: () => void;
  language: Language;
  appLanguage: Language;
  userId: string;
  onComplete?: (score: number, total: number) => void;
  onRegenerateRequested?: (req: GenerationRequest) => void;
  challengeContext?: any;
  originalRequest?: GenerationRequest | null;
}

const QuizDisplay: React.FC<QuizDisplayProps> = ({ 
  data, 
  onBack, 
  language, 
  appLanguage, 
  userId, 
  onComplete, 
  onRegenerateRequested,
  challengeContext,
  originalRequest
}) => {
  const t = TRANSLATIONS[appLanguage];
  
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>(data?.questions || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [userMistakes, setUserMistakes] = useState<{question: string, userAnswer: string, correct: string, topic: string}[]>([]);
  const [adaptiveFeedback, setAdaptiveFeedback] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [regenStatus, setRegenStatus] = useState<string | null>(null);
  
  // TELEMETRY STATE
  const [retries, setRetries] = useState(0);
  const questionStartTimeRef = useRef<number>(Date.now());
  const quizStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    setActiveQuestions(data?.questions || []);
    setCurrentIdx(0);
    setScore(0);
    setUserMistakes([]);
    setIsAnswered(false);
    setQuizCompleted(false);
    setAdaptiveFeedback(null);
    setShowReport(false);
    setIsAnalyzing(false);
    setRegenStatus(null);
    questionStartTimeRef.current = Date.now();
    quizStartTimeRef.current = Date.now();
  }, [data]);

  const currentQuestion = activeQuestions[currentIdx];

  const handleQuickShuffle = () => {
    const shuffleArray = <T,>(arr: T[]): T[] => {
      const newArr = [...arr];
      for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
      }
      return newArr;
    };

    const shuffled = shuffleArray(data?.questions || []).map((q: QuizQuestion) => ({
      ...q,
      options: q.options ? shuffleArray(q.options) : undefined
    }));
    
    setActiveQuestions(shuffled);
    setQuizCompleted(false);
    setCurrentIdx(0);
    setScore(0);
    setUserMistakes([]);
    setIsAnswered(false);
    setSelectedOption(null);
    setTextAnswer('');
    setAdaptiveFeedback(null);
    setShowReport(false);
    setIsAnalyzing(false);
    setRegenStatus(null);
    questionStartTimeRef.current = Date.now();
    quizStartTimeRef.current = Date.now();
    logEvent('Quick Re-Try Triggered', `Topic: ${data?.topic}`);
  };

  const handleNewBankRequest = () => {
    if (!onRegenerateRequested) return;
    setRegenStatus("Scanning material for new insights...");
    
    const baseRequest: GenerationRequest = originalRequest || {
        mode: 'quiz',
        topic: data?.topic || 'General',
        subject: 'General', 
        year: 'Grade 10',
        curriculum: EducationSystem.NEIS,
        language: appLanguage,
        questionCount: 10,
        quizType: QuizType.MIX,
        difficulty: Difficulty.MEDIUM,
        detailLevel: DetailLevel.DETAILED
    };

    onRegenerateRequested({
      ...baseRequest,
      mode: 'quiz',
      studyMaterialUrl: data?.contentId,
      fileName: baseRequest.fileName ? `NEW_BANK:${baseRequest.fileName}` : `NEW_BANK:${data?.topic}`
    });
  };

  const handleGapCloser = () => {
    if (userMistakes.length === 0 || !onRegenerateRequested) return;
    setRegenStatus("Targeting your learning gaps...");
    
    onRegenerateRequested({
      mode: 'quiz',
      topic: `${data?.topic} (Gap Closer)`,
      subject: originalRequest?.subject || 'General',
      year: originalRequest?.year || 'Grade 10',
      curriculum: originalRequest?.curriculum || EducationSystem.NEIS,
      language: appLanguage,
      questionCount: Math.max(5, userMistakes.length * 2),
      quizType: QuizType.MIX,
      difficulty: Difficulty.HARD,
      detailLevel: DetailLevel.DETAILED,
      studyMaterialUrl: data?.contentId,
      strictFormat: true,
      fileName: `GAP_CLOSER:${data?.topic}`
    });
  };

  const isCorrectOption = (opt: string | null | undefined, correct: string | null | undefined) => {
    if (opt === null || opt === undefined || correct === null || correct === undefined) return false;
    const clean = (s: string) => s.toString().trim().toLowerCase();
    return clean(opt) === clean(correct);
  };

  const isOptionType = (type: string) => {
    const t = type?.toUpperCase() || '';
    return t === 'MCQ' || t === 'TRUE_FALSE' || t.includes('CHOICE') || t.includes('TRUE') || t.includes('BLANK') || t.includes('MULTIPLE');
  };

  const handleAnswer = async () => {
    if (!currentQuestion) return;
    const isOptions = isOptionType(currentQuestion.type);
    const answerToCheck = isOptions ? selectedOption : textAnswer;

    if (answerToCheck === null || answerToCheck === undefined || answerToCheck === '') return;

    const isCorrect = isCorrectOption(answerToCheck, currentQuestion.correctAnswer);
    const duration = Date.now() - questionStartTimeRef.current;
    
    // CRITICAL FIX: Use atomId if available for accurate coverage tracking
    const atomIdentifier = currentQuestion.atomId || String(currentQuestion.id);

    await logRawActivity({
        atomId: atomIdentifier,
        studentId: userId,
        subject: originalRequest?.subject || 'General',
        conceptTag: currentQuestion.topic || 'General',
        actionName: 'Quiz',
        timestamp: Date.now(),
        durationMs: duration,
        retries: retries,
        wasSkipped: false,
        isCorrect: isCorrect,
        contentId: originalRequest?.studyMaterialUrl || data?.contentId,
        fileName: originalRequest?.fileName || data?.topic
    }, false);

    if (isCorrect) {
      setScore(s => s + 1);
    } else {
      setUserMistakes(prev => [...prev, {
        question: currentQuestion.question,
        userAnswer: answerToCheck,
        correct: currentQuestion.correctAnswer,
        topic: currentQuestion.topic
      }]);
      setRetries(r => r + 1);
    }
    
    setIsAnswered(true);
  };

  const handleNext = async () => {
    if (currentIdx < (activeQuestions || []).length - 1) {
      setCurrentIdx(curr => curr + 1);
      setSelectedOption(null);
      setTextAnswer('');
      setIsAnswered(false);
      setRetries(0);
      questionStartTimeRef.current = Date.now();
    } else {
      finishQuiz();
    }
  };

  const handleSkip = async () => {
    const duration = Date.now() - questionStartTimeRef.current;
    // CRITICAL FIX: Use atomId if available
    const atomIdentifier = currentQuestion.atomId || String(currentQuestion.id);

    await logRawActivity({
        atomId: atomIdentifier,
        studentId: userId,
        subject: originalRequest?.subject || 'General',
        conceptTag: currentQuestion.topic || 'General',
        actionName: 'Quiz',
        timestamp: Date.now(),
        durationMs: duration,
        retries: retries,
        wasSkipped: true,
        isCorrect: false,
        contentId: originalRequest?.studyMaterialUrl || data?.contentId,
        fileName: originalRequest?.fileName || data?.topic
    }, false);
    handleNext();
  };

  const handlePrevious = () => {
    if (currentIdx > 0) {
      setCurrentIdx(curr => curr - 1);
      setSelectedOption(null);
      setTextAnswer('');
      setIsAnswered(false);
      setRetries(0);
      questionStartTimeRef.current = Date.now();
    }
  };

  const finishQuiz = async () => {
    setQuizCompleted(true);
    const total = (activeQuestions || []).length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const quizDuration = Date.now() - quizStartTimeRef.current;

    if (percentage >= 80 && window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    
    saveQuizResult({
      id: Date.now().toString(),
      topic: data?.topic || 'Unknown',
      score: score,
      total: total,
      percentage: percentage,
      date: Date.now()
    }, userId);

    // --- BRAIN LAYER HOOK: Corrected to include Subject Metadata & AtomIDs ---
    sendTelemetry({
      userId: userId,
      studentId: userId,
      module: 'Quiz',
      eventType: 'quiz_completed',
      payload: {
        quizId: data?.contentId || 'local_session',
        atoms: activeQuestions.map(q => q.atomId || String(q.id)), // CRITICAL FIX
        score: score,
        total: total,
        timeSpent: Math.floor(quizDuration / 1000),
        difficulty: activeQuestions[0]?.difficulty || 'Medium',
        metadata: {
            subject: originalRequest?.subject || 'General'
        }
      },
      timestamp: new Date().toISOString()
    });

    // Logging raw activity for aggregate/health engine (already handled per question, but final sync useful)
    // Removed redundant logRawActivity call here as sendTelemetry triggers aggregation.

    if (originalRequest?.subject) {
        const activeNudges = await getActiveStudentNudges(userId, originalRequest.subject);
        for (const nudge of activeNudges) {
            await resolveNudge(nudge.id, score, total);
        }
    }

    if (onComplete) onComplete(score, total);
  };

  const handleAnalyzePerformance = async () => {
    if (isAnalyzing || showReport) return;
    setIsAnalyzing(true);
    setShowReport(true);
    try {
      if (userMistakes.length > 0 && data?.topic) {
        const feedback = await analyzeWeakness(data.topic, userMistakes, appLanguage);
        setAdaptiveFeedback(feedback);
      } else {
        setAdaptiveFeedback("Perfect score! You've mastered this source material.");
      }
    } catch (e) {
      setAdaptiveFeedback("Could not generate report at this time.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const parseRichText = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, lIdx) => <div key={lIdx} className="mb-1.5">{parseInlines(line)}</div>);
  };

  const parseInlines = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\$[^$]+\$)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-extrabold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic opacity-80">{part.slice(1, -1)}</em>;
      if (part.startsWith('$') && part.endsWith('$')) {
        try {
          const html = katex.renderToString(part.slice(1, -1), { throwOnError: false });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} className="mx-0.5 font-serif text-[1.1em] text-indigo-600 dark:text-indigo-400" />;
        } catch { return <span key={i} className="font-serif italic text-indigo-500">{part}</span>; }
      }
      return part;
    });
  };

  const renderQuestionText = (text: string, type: string) => {
    const isFillBlank = type === QuizType.FILL_IN_BLANK || type.includes('BLANK');
    if (isFillBlank) {
      const parts = text.split(/_{3,}|\[blank\]/gi);
      if (parts.length > 1) {
        return parts.map((part, i) => (
          <React.Fragment key={i}>
            {parseInlines(part)}
            {i < parts.length - 1 && (
              <span className="inline-block px-3 border-b-4 border-dotted border-brand-500 mx-2 min-w-[80px] text-center text-brand-600 font-black bg-brand-50/30 rounded-t-lg">
                {selectedOption || "....."}
              </span>
            )}
          </React.Fragment>
        ));
      }
    }
    return parseRichText(text);
  };

  if (!data) return <div className="flex flex-col items-center justify-center p-20 text-slate-400 italic">Preparing your questions...</div>;

  if (quizCompleted) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in pb-20 pt-6 px-4 flex flex-col gap-8">
        <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white text-center">Mastery Summary</h2>
        
        {regenStatus && (
           <div className="bg-indigo-600 text-white px-6 py-4 rounded-2xl text-sm font-bold animate-pulse flex justify-between items-center shadow-xl">
               <div className="flex items-center gap-3">
                   <span className="text-xl">⏳</span>
                   <span>{regenStatus}</span>
               </div>
           </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <Card className="lg:w-1/3 flex flex-col items-center justify-center p-6 md:p-8 border-2 border-indigo-100 dark:border-indigo-900/30 shadow-lg">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Accuracy</div>
            <div className="text-6xl font-black text-brand-600 mb-2">{score}/{activeQuestions.length}</div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-brand-500 transition-all duration-1000" style={{ width: `${(score / activeQuestions.length) * 100}%` }}></div>
            </div>
          </Card>
          
          <div className="lg:w-2/3">
            {!showReport ? (
              <button onClick={handleAnalyzePerformance} className="w-full h-full min-h-[140px] p-6 rounded-[2rem] bg-indigo-600 text-white shadow-2xl flex flex-col md:flex-row items-center justify-center gap-4 hover:bg-indigo-700 transition-all hover:scale-[1.01] active:scale-95 group border-4 border-indigo-400/20">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner group-hover:rotate-12 transition-transform">🧠</div>
                <div className="text-center md:text-left">
                  <h3 className="text-lg font-black uppercase tracking-widest mb-1">Analyze performance</h3>
                  <p className="text-indigo-100 text-xs font-bold opacity-80">Get feedback & study plan</p>
                </div>
              </button>
            ) : (
              <Card className="h-full min-h-[140px] border-l-8 border-purple-500 bg-purple-50/30 dark:bg-purple-900/10 flex flex-col justify-center shadow-md p-6 md:p-8 animate-slide-up">
                <h3 className="text-purple-700 dark:text-purple-400 font-black text-[10px] uppercase tracking-widest mb-3 flex items-center gap-2"><span>🧠</span> Smart Tutor Review</h3>
                <div className="text-slate-700 dark:text-slate-200 text-sm md:text-base font-medium leading-relaxed italic">
                  {isAnalyzing ? <div className="flex items-center gap-3 animate-pulse"><div className="w-2 h-2 bg-purple-400 rounded-full"></div><span>Coach is studying patterns...</span></div> : adaptiveFeedback ? parseRichText(adaptiveFeedback) : "Processing report..."}
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 ml-1">
                <span className="w-4 h-px bg-slate-200 dark:bg-slate-700"></span>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Try Again or Focus?</h3>
                <span className="flex-grow h-px bg-slate-200 dark:bg-slate-700"></span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onClick={handleQuickShuffle} className="group bg-white dark:bg-slate-800 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 hover:border-brand-400 transition-all text-left shadow-sm hover:shadow-xl hover:scale-[1.02]">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-12 h-12 bg-brand-50 dark:bg-brand-900/30 text-brand-600 rounded-2xl flex items-center justify-center text-2xl group-hover:rotate-12 transition-transform">⚡</div>
                        <span className="text-[7px] font-black bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-400 uppercase">AI: Zero</span>
                    </div>
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-1">Quick Re-Try</h4>
                    <p className="text-xs text-slate-500 leading-snug opacity-70">Same bank, shuffled order.</p>
                </button>

                <button onClick={handleNewBankRequest} className="group bg-white dark:bg-slate-800 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 hover:border-emerald-400 transition-all text-left shadow-sm hover:shadow-xl hover:scale-[1.02]">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl group-hover:animate-bounce">📚</div>
                        <span className="text-[7px] font-black bg-emerald-100 dark:bg-emerald-800/30 px-2 py-0.5 rounded text-emerald-600 uppercase">AI: Mid</span>
                    </div>
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-1">New Questions</h4>
                    <p className="text-xs text-slate-500 leading-snug opacity-70">Scan for fresh angles.</p>
                </button>

                <button onClick={handleGapCloser} disabled={userMistakes.length === 0} className="group bg-white dark:bg-slate-800 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 hover:border-orange-400 transition-all text-left shadow-sm hover:shadow-xl hover:scale-[1.02] disabled:opacity-30 disabled:grayscale cursor-pointer disabled:cursor-not-allowed">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 text-orange-600 rounded-2xl flex items-center justify-center text-2xl">🎯</div>
                        <span className="text-[7px] font-black bg-orange-100 dark:bg-orange-800/30 px-2 py-0.5 rounded text-orange-600 uppercase">AI: High</span>
                    </div>
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-1">Fix Mistakes</h4>
                    <p className="text-xs text-slate-500 leading-snug opacity-70">Focus on missed concepts.</p>
                </button>
            </div>
        </div>

        <Button onClick={onBack} className="w-full py-5 rounded-2xl text-lg font-black bg-slate-900 text-white hover:bg-black shadow-2xl transition-all active:scale-95">Return to Study Hub</Button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="max-w-3xl auto animate-slide-up pb-44 pt-6 px-4">
      <div className="flex justify-between items-end mb-8">
         <button onClick={onBack} className="text-slate-400 font-black text-sm uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-2 pb-1"><span className="text-lg leading-none">×</span> Quit</button>
         <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-2 mb-2"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Progress</span><span className="text-base font-black text-slate-900 dark:text-white">{currentIdx + 1}<span className="text-slate-400 font-bold">/{(activeQuestions || []).length}</span></span></div>
            <div className="w-32 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50"><div className="h-full bg-brand-500 transition-all duration-500 rounded-full" style={{ width: `${((currentIdx + 1) / (activeQuestions || []).length) * 100}%` }}></div></div>
         </div>
      </div>
      <Card className="p-8 md:p-12 mb-10 border-b-8 border-brand-500 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] dark:shadow-none relative overflow-hidden group">
         <div className="flex flex-wrap gap-2 mb-8 relative z-10">
             <span className="px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest border border-slate-200 dark:border-slate-700 shadow-sm">{currentQuestion.difficulty}</span>
             <span className="px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-[10px] font-black uppercase text-indigo-600 tracking-widest border border-indigo-100 dark:border-indigo-800 shadow-sm">{currentQuestion.cognitiveLevel || 'Analyze'}</span>
             <span className="px-4 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-[10px] font-black uppercase text-amber-600 tracking-widest border border-amber-100 border-amber-800 shadow-sm">{currentQuestion.topic}</span>
         </div>
         <div className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white leading-[1.4] relative z-10 break-words">{renderQuestionText(currentQuestion.question, currentQuestion.type)}</div>
      </Card>
      <div className="grid grid-cols-1 gap-4">
          {isOptionType(currentQuestion.type) ? (
              (currentQuestion.options || []).map((opt, idx) => {
                  const isCorrect = isCorrectOption(opt, currentQuestion.correctAnswer);
                  const isSelected = selectedOption === opt;
                  let btnClass = "w-full p-5 rounded-2xl border-2 text-left font-bold transition-all flex items-center gap-5 shadow-sm hover:shadow-md active:scale-[0.99] ";
                  let bubbleClass = "w-10 h-10 rounded-xl flex items-center justify-center border-2 font-black transition-all ";
                  if (isAnswered) {
                      if (isCorrect) { btnClass += "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"; bubbleClass += "bg-green-500 border-green-500 text-white"; }
                      else if (isSelected) { btnClass += "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"; bubbleClass += "bg-red-500 border-red-500 text-white"; }
                      else { btnClass += "border-slate-100 dark:border-slate-800 opacity-40 grayscale-[0.5]"; bubbleClass += "border-slate-200 dark:border-slate-700 text-slate-400"; }
                  } else {
                      if (isSelected) { btnClass += "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-4 ring-brand-500/10"; bubbleClass += "bg-brand-500 border-brand-500 text-white"; }
                      else { btnClass += "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-300 text-slate-700 dark:text-slate-300"; bubbleClass += "border-slate-100 dark:border-slate-700 text-slate-400 group-hover:border-brand-200"; }
                  }
                  return (
                      <button key={idx} disabled={isAnswered} onClick={() => setSelectedOption(opt)} className={btnClass}>
                          <div className={bubbleClass}>{isAnswered && isCorrect ? '✓' : isAnswered && isSelected ? '✕' : String.fromCharCode(65 + idx)}</div>
                          <span className="flex-grow text-lg leading-snug">{parseInlines(opt)}</span>
                      </button>
                  );
              })
          ) : (
              <div className="space-y-6">
                  <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} disabled={isAnswered} className="w-full p-7 rounded-3xl border-2 border-slate-200 dark:bg-slate-900 dark:border-slate-700 focus:border-brand-500 dark:focus:border-brand-400 outline-none text-xl font-bold shadow-inner transition-all" placeholder="Type your answer here..." autoFocus />
                  {isAnswered && <div className={`p-6 rounded-2xl border-2 animate-slide-up ${isCorrectOption(textAnswer, currentQuestion.correctAnswer) ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-300'}`}><p className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-2">Expected Answer</p><p className="text-lg font-black">{currentQuestion.correctAnswer}</p></div>}
              </div>
          )}
      </div>
      <div className="fixed bottom-20 md:bottom-0 left-0 right-0 z-[170] bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-5 pb-safe shadow-[0_-15px_40px_rgba(0,0,0,0.12)]">
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {isAnswered && <div className="p-5 bg-indigo-50/80 dark:bg-indigo-900/20 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800/50 max-h-48 overflow-y-auto custom-scrollbar animate-fade-in shadow-inner"><div className="flex gap-4"><div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-800 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm">💡</div><div className="flex-grow"><span className="block text-[10px] font-black uppercase text-indigo-400 tracking-widest">Knowledge Booster</span><div className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic pr-4">{parseRichText(currentQuestion.explanation)}</div></div></div></div>}
              <div className="flex items-center gap-4 justify-center">
                  {!isAnswered ? (
                      <Button onClick={handleAnswer} disabled={!isOptionType(currentQuestion.type) ? !textAnswer.trim() : !selectedOption} className="h-16 px-12 rounded-2xl shadow-xl shadow-brand-500/20 text-lg font-black tracking-wide uppercase transition-all hover:scale-[1.02] active:scale-95">Check Answer</Button>
                  ) : (
                      <Button onClick={handleNext} className="h-16 px-12 rounded-2xl shadow-xl shadow-indigo-500/20 text-lg font-black tracking-wide uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 border-none transition-all hover:scale-[1.02] active:scale-95">{currentIdx === (activeQuestions || []).length - 1 ? "See Results" : "Next Question →"}</Button>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};

export default QuizDisplay;
