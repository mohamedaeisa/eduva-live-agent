
import React, { useState } from 'react';
import { StudyNoteData, Language, UserProfile } from '../types';
import { sendTelemetry } from '../services/telemetryBrainService';
import { logger } from '../utils/logger';
import Button from './ui/Button';
import Card from './ui/Card';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { decodeHTMLEntities } from '../utils/stringUtils';

interface NoteDisplayProps {
    data: StudyNoteData;
    onBack: () => void;
    appLanguage: Language;
    user: UserProfile;
}

const MiniQuestionReveal: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
    const [revealed, setRevealed] = useState(false);
    return (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <span>❓</span> {question}
            </p>
            {revealed ? (
                <div className="animate-fade-in text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                    {answer}
                </div>
            ) : (
                <button
                    onClick={() => setRevealed(true)}
                    className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 tracking-widest transition-colors flex items-center gap-1"
                >
                    Tap to Reveal Answer →
                </button>
            )}
        </div>
    );
};

const NoteDisplay: React.FC<NoteDisplayProps> = ({ data, onBack, appLanguage, user }) => {
    // Logic Fix: This component is now exclusively for Master Guide (Full Notes).
    // Cheat Sheets are handled by CheatSheetDisplay.tsx

    // Auto-detect direction based on content (fallback) or use app context if strict
    // User requested "Language decides container direction", detecting from content is safer for the specific artifact
    // but we will implement the container pattern strictly.
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const hasArabicContent = arabicRegex.test(data.title || '') ||
        arabicRegex.test(data.summary || '') ||
        (data.sections || []).some(s => arabicRegex.test(s.heading || '') || arabicRegex.test(s.rememberThis || ''));

    // DEBUG:
    if (hasArabicContent) console.log("[NoteDisplay] Arabic Detected via Content Scan");

    const dir = (appLanguage === Language.ARABIC || hasArabicContent) ? 'rtl' : 'ltr';

    React.useEffect(() => {
        logger.notes(`Rendering Master Guide.`);

        // --- BRAIN LAYER HOOK ---
        sendTelemetry({
            userId: user.id,
            studentId: user.id,
            module: 'Notes',
            eventType: 'notes_accessed',
            payload: {
                noteId: data.contentId,
                noteTitle: data.title,
                atoms: data.atomIds || [],
                metadata: { mode: 'MasterGuide' }
            },
            timestamp: new Date().toISOString()
        });
    }, [data.contentId, data.atomIds, user.id]);



    const parseContent = (inputText: string) => {
        const text = decodeHTMLEntities(inputText);
        // Robust Tokenizer: Math ($$), Math ($), Code (`), Bold (**)
        const regex = /(\$\$[^$]+\$\$|\$[^$]+\$|`[^`]+`|\*\*.*?\*\*)/g;
        const parts: { type: 'text' | 'math' | 'code' | 'bold', value: string }[] = [];
        let lastIndex = 0;

        // Use replace as a tokenizer loop
        text.replace(regex, (match, _, index) => {
            if (index > lastIndex) {
                parts.push({ type: 'text', value: text.slice(lastIndex, index) });
            }

            if (match.startsWith('$$')) {
                parts.push({ type: 'math', value: match, display: true } as any);
            } else if (match.startsWith('$')) {
                parts.push({ type: 'math', value: match, display: false } as any);
            } else if (match.startsWith('`')) {
                parts.push({ type: 'code', value: match });
            } else if (match.startsWith('**')) {
                parts.push({ type: 'bold', value: match });
            }

            lastIndex = index + match.length;
            return match;
        });

        if (lastIndex < text.length) {
            parts.push({ type: 'text', value: text.slice(lastIndex) });
        }

        return parts.map((part, i) => {
            switch (part.type) {
                case 'math':
                    try {
                        const isDisplay = (part as any).display;
                        const rawContent = isDisplay ? part.value.slice(2, -2) : part.value.slice(1, -1);

                        // Check if contains Arabic
                        const arabicPattern = /[\u0600-\u06FF]/;
                        if (!arabicPattern.test(rawContent)) {
                            // Pure Math (Standard)
                            const html = katex.renderToString(rawContent, {
                                throwOnError: false,
                                strict: false,
                                displayMode: isDisplay,
                                output: 'html'
                            });
                            return (
                                <span
                                    key={i}
                                    dangerouslySetInnerHTML={{ __html: html }}
                                    className={`${isDisplay ? 'block text-center my-2' : 'inline-block mx-1 align-middle'} font-serif text-lg`}
                                    dir="ltr"
                                />
                            );
                        }

                        // Mixed Content: Extract Arabic out of KaTeX
                        // Split by Arabic segments (capturing them)
                        const parts = rawContent.split(/([\u0600-\u06FF][\u0600-\u06FF\s]*)/g);

                        return (
                            <span key={i} className={`${isDisplay ? 'block text-center my-2' : 'inline-block mx-1'}`}>
                                {parts.map((subPart, j) => {
                                    if (!subPart) return null;

                                    if (arabicPattern.test(subPart)) {
                                        // Render as Text
                                        return <span key={j} className="font-sans mx-1" dir="rtl">{subPart}</span>;
                                    } else {
                                        // Render as Math (if valid)
                                        const trimmed = subPart.trim();
                                        if (trimmed.length === 0) return <span key={j}>{subPart}</span>;

                                        try {
                                            const html = katex.renderToString(subPart, {
                                                throwOnError: false,
                                                strict: false,
                                                output: 'html'
                                            });
                                            return <span key={j} dangerouslySetInnerHTML={{ __html: html }} className="inline-block font-serif text-lg" dir="ltr" />;
                                        } catch (e) {
                                            return <span key={j}>{subPart}</span>;
                                        }
                                    }
                                })}
                            </span>
                        );

                    } catch (e) {
                        return <span key={i} className="italic text-indigo-600 font-bold px-1">{part.value}</span>;
                    }
                case 'code':
                    return <code key={i} className="bg-slate-100 dark:bg-slate-700 px-1 py-0 rounded font-mono text-[0.9em] text-pink-600 dark:text-pink-400 mx-1">{part.value.slice(1, -1)}</code>;
                case 'bold':
                    return <strong key={i} className="text-indigo-900 dark:text-white font-extrabold">{part.value.slice(2, -2)}</strong>;
                case 'text':
                default:
                    return <span key={i}>{part.value}</span>;
            }
        });
    };

    return (
        <div className={`max-w-6xl mx-auto p-4 md:p-8 animate-fade-in pb-32 font-sans note-container ${dir === 'rtl' ? 'font-arabic' : ''}`} dir={dir}>
            <style>{`
                .note-container[dir="rtl"] { direction: rtl; text-align: right; }
                .note-container[dir="ltr"] { direction: ltr; text-align: left; }
                /* Strict LTR for Math inside RTL context */
                .note-container[dir="rtl"] .katex { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }
                /* Ensure lists flow correctly */
                .note-container[dir="rtl"] ul, .note-container[dir="rtl"] ol { padding-right: 1.5rem; padding-left: 0; }
            `}</style>
            {/* Premium Header */}

            <div className="mb-12">
                <Button variant="outline" onClick={onBack} className="mb-6 rounded-xl border-slate-200 shadow-sm bg-white hover:bg-slate-50 text-slate-600">← Back to Hub</Button>

                <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden border-4 border-white/10">
                    {/* Background Decor */}
                    <div className="absolute top-0 right-0 p-12 opacity-10 text-9xl pointer-events-none select-none rotate-12">📝</div>
                    <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-black uppercase tracking-widest mb-6 shadow-inner">
                            <span className="text-base">✨</span> Master Synthesis
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-6 drop-shadow-sm">{data.title}</h1>
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10 max-w-4xl">
                            <p className="text-indigo-50 text-lg font-medium leading-relaxed italic opacity-90">
                                "{data.summary}"
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sections List */}
            <div className="space-y-16">
                {data.sections.map((section, idx) => {

                    const difficultyColor = section.difficultyBadge === 'Recall' ? 'bg-emerald-500' : section.difficultyBadge === 'Apply' ? 'bg-amber-500' : 'bg-red-500';

                    // Filter invalid content (N/A, empty)
                    const validKeyPoints = (section.keyPoints || []).filter(
                        p => p && p.trim().length > 0 && p.toUpperCase() !== 'N/A' && p.toUpperCase() !== 'NONE'
                    );

                    const validDefinitions = (section.definitions || []).filter(
                        d => d.term && d.term.trim().length > 0 && d.term.toUpperCase() !== 'N/A' &&
                            d.definition && d.definition.trim().length > 0 && d.definition.toUpperCase() !== 'N/A'
                    );

                    const validMnemonic = section.mnemonic && section.mnemonic.trim().length > 0 && section.mnemonic.toUpperCase() !== 'N/A' && section.mnemonic.toUpperCase() !== 'NONE' ? section.mnemonic : null;

                    // Style Flip for RTL
                    const isRtl = dir === 'rtl';
                    const borderSide = isRtl ? 'border-r-8' : 'border-l-8';
                    const borderSideSmall = isRtl ? 'border-r-2' : 'border-l-2';
                    const pl = isRtl ? 'pr-3' : 'pl-3'; // Swap padding for glossary

                    return (
                        <div key={idx} className="animate-slide-up group" style={{ animationDelay: `${idx * 100}ms` }}>

                            {/* Section Title Row */}
                            <div className="flex items-center gap-5 mb-8">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-50 dark:ring-indigo-900/20 shrink-0">
                                    {idx + 1}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{section.heading}</h2>
                                    {section.difficultyBadge && (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white ${difficultyColor} shadow-sm w-fit`}>
                                            {section.difficultyBadge}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                                {/* LEFT: Core Content */}
                                <div className="lg:col-span-7 space-y-8">
                                    {/* Main Knowledge Card */}
                                    {validKeyPoints.length > 0 && (
                                        <Card className={`p-8 md:p-10 ${borderSide} border-indigo-500 bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow rounded-[2rem]`}>
                                            {/* 1. REMEMBER THIS BLOCK */}
                                            {section.rememberThis && (
                                                <div className="mb-8 bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">🧠</span>
                                                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Remember This</span>
                                                    </div>
                                                    <p className="text-lg font-black text-slate-800 dark:text-indigo-100 leading-snug">
                                                        {section.rememberThis}
                                                    </p>
                                                </div>
                                            )}

                                            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-6 flex items-center gap-2">
                                                <span className="text-indigo-500 text-xl">💡</span> Core Knowledge
                                            </h3>
                                            <ul className="space-y-5">
                                                {validKeyPoints.map((point, pIdx) => (
                                                    <li key={pIdx} className="flex gap-4 text-slate-700 dark:text-slate-200 leading-relaxed text-lg group/li">
                                                        <span className="mt-2.5 w-2 h-2 rounded-full bg-indigo-400 shrink-0 group-hover/li:bg-indigo-600 transition-colors"></span>
                                                        <span>{parseContent(point)}</span>
                                                    </li>
                                                ))}
                                            </ul>

                                            {/* 7. VISUAL FLOW */}
                                            {section.visualFlow && section.visualFlow.length > 1 && (
                                                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Process Flow</p>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {section.visualFlow.map((step, sIdx) => (
                                                            <React.Fragment key={sIdx}>
                                                                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-600">
                                                                    {step}
                                                                </div>
                                                                {sIdx < (section.visualFlow?.length || 0) - 1 && (
                                                                    <span className="text-slate-400">→</span>
                                                                )}
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
                                    )}
                                </div>

                                {/* RIGHT: Intel & Tips */}
                                <div className="lg:col-span-5 space-y-6">

                                    {/* 2. EXAM HINT */}
                                    {section.examHint && (
                                        <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-[2rem] border-2 border-amber-100 dark:border-amber-900/30 relative overflow-hidden shadow-sm">
                                            <div className="flex items-start gap-4">
                                                <div className="text-2xl">📝</div>
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-[0.2em] mb-2">Exam Hint</h4>
                                                    <p className="text-sm font-bold text-amber-900 dark:text-amber-100 leading-relaxed italic">
                                                        "{section.examHint}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. MINI QUESTION */}
                                    {section.miniQuestion && (
                                        <MiniQuestionReveal question={section.miniQuestion.question} answer={section.miniQuestion.answer} />
                                    )}

                                    {/* 4. ACTIONABLE TRAPS */}
                                    {section.actionableTraps && section.actionableTraps.length > 0 && (
                                        <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-[2rem] border-2 border-red-100 dark:border-red-900/30 relative shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase text-red-600 tracking-[0.2em] mb-4 flex items-center gap-2">
                                                <span className="text-lg">⚠️</span> Critical Traps
                                            </h4>
                                            <ul className="space-y-3">
                                                {section.actionableTraps.map((trap, trIdx) => (
                                                    <li key={trIdx} className="text-sm text-slate-700 dark:text-slate-300 font-bold flex gap-3 leading-snug">
                                                        <span className="text-red-500 font-black text-lg">✕</span>
                                                        <span>{trap}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Mnemonic - Memory Hack */}
                                    {validMnemonic && (
                                        <div className="bg-fuchsia-50 dark:bg-fuchsia-900/10 p-6 rounded-[2rem] border-2 border-fuchsia-100 dark:border-fuchsia-900/30 relative overflow-hidden shadow-sm">
                                            <div className="absolute -top-2 -right-2 p-4 opacity-10 text-6xl rotate-12 select-none">🧠</div>
                                            <h4 className="text-[10px] font-black uppercase text-fuchsia-600 tracking-[0.2em] mb-3 relative z-10">Memory Hack</h4>
                                            <p className="text-sm font-black italic text-slate-800 dark:text-white leading-relaxed relative z-10">"{validMnemonic}"</p>
                                        </div>
                                    )}

                                    {/* Glossary Grid */}
                                    {validDefinitions.length > 0 && (
                                        <div className="bg-slate-50/80 dark:bg-slate-900/30 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-[0.2em]">Essential Terms</h4>
                                            <div className="space-y-3">
                                                {validDefinitions.slice(0, 3).map((def, dIdx) => (
                                                    <div key={dIdx} className={`${borderSideSmall} border-indigo-200 dark:border-indigo-800 ${pl}`}>
                                                        <p className="font-black text-indigo-700 dark:text-indigo-400 text-xs uppercase tracking-wide">{def.term}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{def.definition}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 5. LINKED CONCEPTS */}
                            {section.linkedConcepts && section.linkedConcepts.length > 0 && (
                                <div className="mt-8 flex flex-wrap gap-2 items-center">
                                    <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest mr-2">Linked:</span>
                                    {section.linkedConcepts.map((tag, tIdx) => (
                                        <span key={tIdx} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded-full border border-slate-200 dark:border-slate-700">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-20 pt-10 border-t border-slate-100 dark:border-slate-800 text-center opacity-40">
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Generated by EDUVA Intelligence • {new Date(data.timestamp).toLocaleDateString()}</p>
            </div>
        </div>
    );
};

export default NoteDisplay;
