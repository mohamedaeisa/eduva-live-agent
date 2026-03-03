
import React, { useState, useMemo } from 'react';
import { ParentFeedEvent, UserProfile, Comment, SignalType, InteractionState } from '../types';
import { toggleFeedLike, addFeedComment, escalateIgnoredAction, rescheduleIgnoredAction } from '../services/parentService';
import Card from './ui/Card';

const getInteractionStatus = (event: ParentFeedEvent) => {
    const state = event.interactionState || InteractionState.ISSUED;
    const now = Date.now();
    const isSnoozed = event.nextScheduledAt && event.nextScheduledAt > now;

    if (isSnoozed && state !== InteractionState.COMPLETED) {
        return { label: 'Rescheduled', color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: '⏳', step: 1 };
    }

    switch (state) {
        case InteractionState.COMPLETED:
            return { label: 'Action Completed', color: 'text-green-600 bg-green-50 border-green-200', icon: '✅', step: 4 };
        case InteractionState.IN_PROGRESS:
            return { label: 'Student Working', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: '🧠', step: 3 };
        case InteractionState.ACKNOWLEDGED:
            return { label: 'Student Reading', color: 'text-amber-500 bg-amber-50 border-amber-200 animate-pulse', icon: '🟡', step: 2 };
        case InteractionState.IGNORED:
            return { label: 'Action Ignored', color: 'text-red-500 bg-red-50 border-red-200', icon: '🔴', step: 0 };
        default:
            return { label: 'Issued', color: 'text-slate-400 bg-slate-50 border-slate-100', icon: '⚪', step: 1 };
    }
};

const formatTimeLeft = (target: number) => {
    const diff = target - Date.now();
    if (diff <= 0) return 'Any moment';
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m left`;
};

interface ParentFeedProps {
    feed: ParentFeedEvent[];
    onExplain: (event: ParentFeedEvent) => void;
    user: UserProfile;
}

const ParentFeed: React.FC<ParentFeedProps> = ({ feed, onExplain, user }) => {
    const [activeFilter, setActiveFilter] = useState<SignalType | 'ALL'>('ALL');
    const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
    const [isEscalating, setIsEscalating] = useState<string | null>(null);
    const [isRescheduling, setIsRescheduling] = useState<string | null>(null);

    const filteredFeed = useMemo(() => {
        if (activeFilter === 'ALL') return feed;
        return feed.filter(item => item.signalType === activeFilter);
    }, [feed, activeFilter]);

    const handleLike = async (eventId: string) => {
        await toggleFeedLike(eventId, user.id);
    };

    const handleEscalate = async (eventId: string) => {
        setIsEscalating(eventId);
        await escalateIgnoredAction(eventId);
        setIsEscalating(null);
    };

    const handleReschedule = async (eventId: string) => {
        setIsRescheduling(eventId);
        await rescheduleIgnoredAction(eventId);
        setIsRescheduling(null);
    };

    const filters: { id: SignalType | 'ALL', label: string, icon: string }[] = [
        { id: 'ALL', label: 'All Activity', icon: '🌀' },
        { id: SignalType.WIN, label: 'Daily Wins', icon: '🏆' },
        { id: SignalType.STUCK, label: 'Friction', icon: '🧩' },
        { id: SignalType.IMPROVING, label: 'Momentum', icon: '⚡' },
        { id: SignalType.ACTIVE, label: 'Sessions', icon: '📖' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 pt-1">
                {filters.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveFilter(f.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all border-2 ${activeFilter === f.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-100 text-slate-400'
                            }`}
                    >
                        <span className="text-sm">{f.icon}</span>{f.label}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {filteredFeed.map((item) => {
                    const isLiked = item.likes?.includes(user.id);
                    const status = getInteractionStatus(item);
                    const hasTrace = !!item.aiDecisionTrace;
                    const isIgnored = item.interactionState === InteractionState.IGNORED;
                    const isRescheduled = status.label === 'Rescheduled';
                    const rescheduleLimitReached = (item.rescheduleCount || 0) >= 3;

                    return (
                        <Card key={item.id} className="p-0 border border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 overflow-hidden group">
                            <div className={`p-6 ${isIgnored ? 'bg-red-50/20 dark:bg-red-950/10' : isRescheduled ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''}`}>
                                <div className="flex justify-between items-center mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl ${item.isWin ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {item.isWin ? '🏆' : '🎯'}
                                        </div>
                                        <h4 className="font-black text-slate-800 dark:text-white text-base tracking-tight">{item.title}</h4>
                                    </div>
                                    <div className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${status.color}`}>
                                        <span className="text-xs leading-none">{status.icon}</span> {status.label}
                                    </div>
                                </div>

                                {/* INTERACTION STATE TRACKER */}
                                <div className="mb-6 px-2">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[7px] font-black uppercase text-slate-400 tracking-tighter">Connection Loop</span>
                                        <span className={`text-[7px] font-black uppercase tracking-tighter ${isIgnored ? 'text-red-500' : 'text-indigo-500'}`}>
                                            {isIgnored ? 'Loop Broken' : isRescheduled ? 'Snoozed Mission' : `Phase: ${status.step}/4`}
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full flex gap-1 p-0.5">
                                        {isIgnored ? (
                                            <div className="h-full w-full bg-red-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div>
                                        ) : isRescheduled ? (
                                            <div className="h-full w-full bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.3)]"></div>
                                        ) : (
                                            [1, 2, 3, 4].map(s => (
                                                <div key={s} className={`h-full flex-1 rounded-full transition-all duration-700 ${status.step >= s ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {isRescheduled && (
                                    <div className="mb-6 p-5 bg-white dark:bg-slate-800 rounded-3xl border-2 border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between gap-4 shadow-sm animate-fade-in">
                                        <div className="flex items-center gap-4">
                                            <span className="text-2xl animate-pulse">⏳</span>
                                            <div>
                                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Reschedule Active</p>
                                                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Mission re-appears in {formatTimeLeft(item.nextScheduledAt!)}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleEscalate(item.id)}
                                            disabled={isEscalating === item.id}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                        >
                                            Elevate Now
                                        </button>
                                    </div>
                                )}

                                {isIgnored ? (
                                    <div className="mb-6 p-6 bg-white dark:bg-slate-800 rounded-3xl border-2 border-red-100 dark:border-red-900/30 flex flex-col items-center justify-between gap-6 shadow-xl animate-fade-in relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-2 opacity-5 text-4xl">⚠️</div>

                                        <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-start w-full">
                                            <span className="text-4xl filter grayscale">😴</span>
                                            <div className="flex-grow">
                                                <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-1">Student Dismissed Mission</p>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                                                    The student marked this as "Later". You can try a gentle reschedule or elevate it to a high-priority alert.
                                                </p>
                                                {rescheduleLimitReached && (
                                                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
                                                        <span className="text-sm">🤖</span>
                                                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight">
                                                            AI ADVICE: Rescheduling has been used 3 times with no response. I recommend <b>Elevating Priority</b> to ensure mastery is verified.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full pt-4 border-t border-red-50 dark:border-red-900/20">
                                            <button
                                                onClick={() => handleReschedule(item.id)}
                                                disabled={isRescheduling === item.id || isEscalating === item.id || rescheduleLimitReached}
                                                className={`px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${rescheduleLimitReached
                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200'
                                                    }`}
                                            >
                                                <span className="text-xs">⏳</span> {isRescheduling === item.id ? 'Rescheduling...' : `Reschedule (Used ${item.rescheduleCount || 0}/3)`}
                                            </button>
                                            <button
                                                onClick={() => handleEscalate(item.id)}
                                                disabled={isEscalating === item.id || isRescheduling === item.id}
                                                className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                            >
                                                <span className="text-xs">🔴</span> {isEscalating === item.id ? 'Elevating...' : 'Elevate Priority'}
                                            </button>
                                        </div>
                                    </div>
                                ) : !isRescheduled && (
                                    <div className="mb-6">
                                        <button
                                            onClick={() => setExpandedTrace(expandedTrace === item.id ? null : item.id)}
                                            className="w-full flex items-start gap-4 p-4 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30 text-start group/btn transition-all hover:border-indigo-300"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-indigo-100 flex-shrink-0">
                                                <span className="text-2xl">🤖</span>
                                            </div>
                                            <div className="flex-grow pt-0.5">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em]">AI Decision Context</span>
                                                    <span className={`text-indigo-300 transition-transform ${expandedTrace === item.id ? 'rotate-180' : ''}`}>▼</span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed italic pr-4">
                                                    {item.aiDecisionTrace?.explanation || item.message}
                                                </p>
                                            </div>
                                        </button>

                                        {expandedTrace === item.id && hasTrace && (
                                            <div className="mx-4 p-5 bg-white dark:bg-slate-900 border-x border-b border-indigo-100/50 dark:border-indigo-800/30 rounded-b-2xl shadow-inner animate-slide-up space-y-3">
                                                <div className="space-y-1.5">
                                                    {item.aiDecisionTrace?.reasoning.map((r, i) => (
                                                        <div key={i} className="flex gap-2 items-start text-[10px] text-slate-500">
                                                            <span className="mt-1 w-1 h-1 rounded-full bg-indigo-400"></span>
                                                            <span className="font-medium leading-relaxed">{r}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
                                    <div className="flex gap-6">
                                        <button onClick={() => handleLike(item.id)} className={`flex items-center gap-2 group/like ${isLiked ? 'text-indigo-600' : 'text-slate-400'}`}>
                                            <div className={`p-2 rounded-full transition-colors ${isLiked ? 'bg-indigo-50' : 'group-hover/like:bg-slate-50'}`}>
                                                <span className="text-xl">{isLiked ? '💜' : '🤍'}</span>
                                            </div>
                                            <span className="text-xs font-black">{item.likes?.length || 0}</span>
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => onExplain(item)}
                                        className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.3em] px-4 py-2 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                                    >
                                        Diagnose
                                    </button>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default ParentFeed;
