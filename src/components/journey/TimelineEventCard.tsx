
import React from 'react';
import { JourneyEvent } from '../../types/journey';
import { BookOpen, MonitorPlay, GraduationCap, FileText, ClipboardList } from 'lucide-react';

interface TimelineEventCardProps {
    event: JourneyEvent;
}

export const TimelineEventCard: React.FC<TimelineEventCardProps> = ({ event }) => {

    // Design System Mapping matching the target image
    const styles = {
        quiz: {
            border: 'border-purple-500',
            bg: 'bg-purple-50/50 dark:bg-purple-900/10',
            iconBg: 'bg-purple-100 dark:bg-purple-900/30',
            text: 'text-purple-700 dark:text-purple-300',
            icon: ClipboardList,
            label: 'Quizzes'
        },
        exam: {
            border: 'border-orange-500',
            bg: 'bg-orange-50/50 dark:bg-orange-900/10',
            iconBg: 'bg-orange-100 dark:bg-orange-900/30',
            text: 'text-orange-700 dark:text-orange-300',
            icon: GraduationCap,
            label: 'Exams'
        },
        study: {
            border: 'border-green-500',
            bg: 'bg-green-50/50 dark:bg-green-900/10',
            iconBg: 'bg-green-100 dark:bg-green-900/30',
            text: 'text-green-700 dark:text-green-300',
            icon: BookOpen,
            label: 'Study'
        },
        notes: {
            border: 'border-emerald-500',
            bg: 'bg-emerald-50/50 dark:bg-emerald-900/10',
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
            text: 'text-emerald-700 dark:text-emerald-300',
            icon: FileText,
            label: 'Notes'
        },
        class: {
            border: 'border-blue-500',
            bg: 'bg-blue-50/50 dark:bg-blue-900/10',
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            text: 'text-blue-700 dark:text-blue-300',
            icon: MonitorPlay,
            label: 'Classes'
        }
    };

    const style = styles[event.type] || styles.study;
    const Icon = style.icon;

    // Time formatting helper
    const formatTime = (isoString?: string | number) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const startTimeStr = formatTime(event.startAt);
    const endTimeStr = formatTime(event.endAt);
    const timeRange = `${startTimeStr} - ${endTimeStr}`;

    const durationDisplay = event.durationMin > 60
        ? `${Math.floor(event.durationMin / 60)}h ${event.durationMin % 60}m`
        : `${event.durationMin}m`;

    return (
        <div className="flex gap-0 md:gap-4 mb-3 relative group animate-in fade-in slide-in-from-bottom-2 duration-500 pl-0 md:pl-0">
            {/* Time Column (Desktop Only) */}
            <div className="hidden md:block w-24 flex-shrink-0 text-right pt-5">
                <span className="text-xs font-semibold text-slate-400 block">{startTimeStr}</span>
                <span className="text-xs text-slate-300 block">{endTimeStr}</span>
            </div>

            {/* Timeline Line & Node */}
            <div className="flex flex-col items-center absolute left-4 md:left-28 h-full transition-all duration-300">
                {/* Node */}
                <div className={`w-3 h-3 rounded-full border-2 ${style.border.replace('border-', 'bg-')} z-10 mt-6 shadow-[0_0_0_4px_white] dark:shadow-[0_0_0_4px_#0f172a]`} />
                {/* Line */}
                <div className="w-0.5 bg-slate-100 dark:bg-slate-800 h-full absolute top-8 -bottom-4 group-last:hidden" />
            </div>

            {/* Card Content - GLASSMOPHISM & GRADIENT */}
            <div className={`
                flex-1 ml-10 md:ml-8 rounded-xl border-l-4 shadow-sm hover:shadow-md transition-all duration-200 
                bg-gradient-to-r from-white to-white/50 dark:from-slate-800 dark:to-slate-900/50 backdrop-blur-sm
                ${style.border} ${style.bg} relative overflow-hidden group/card cursor-default
            `}>
                {/* Background Decor (Subtle Gradient) */}
                <div className={`absolute inset-0 bg-gradient-to-r ${style.bg} opacity-30 pointer-events-none`} />

                <div className="relative p-4 flex flex-col sm:flex-row justify-between gap-4">

                    {/* LEFT: Main Content */}
                    <div className="flex-1 min-w-0">
                        {/* Header: Icon + Type */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <Icon size={14} className={style.text} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>
                                {style.label}
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-snug mb-1 truncate">
                            {event.title}
                        </h3>

                        {/* Subtitle: Time • Subject (Mobile friendly) */}
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            <span className="text-slate-400 dark:text-slate-500 font-semibold">{timeRange} • </span>
                            <span className="text-slate-600 dark:text-slate-300">{event.subjectId}</span>
                            <span>•</span>
                            <span>{durationDisplay}</span>
                        </div>
                    </div>

                    {/* RIGHT: Metrics Panel (The "Detail" view) */}
                    <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-200/50 pt-3 sm:pt-0 sm:pl-4 mt-1 sm:mt-0 min-w-[120px]">

                        {/* CASE: QUIZ / EXAM */}
                        {(event.type === 'quiz' || event.type === 'exam') && event.metrics.score !== undefined && (
                            <div className="flex flex-row sm:flex-col items-center sm:items-end gap-x-4 gap-y-0.5 w-full justify-between sm:justify-start">
                                <div className="text-right">
                                    <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Score</div>
                                    <div className={`text-lg font-black ${style.text}`}>
                                        {Math.round(event.metrics.score)}%
                                    </div>
                                </div>
                                <div className="text-right flex flex-col">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                        Correct: <span className="text-slate-700 dark:text-slate-200">{event.metrics.correct}/{event.metrics.total}</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                        Time: {durationDisplay}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* CASE: CLASS */}
                        {event.type === 'class' && (
                            <div className="text-right w-full">
                                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5">Attended</span>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {event.metrics.attendedDurationMin || event.durationMin}m
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                    of {event.durationMin}m
                                </span>
                            </div>
                        )}

                        {/* CASE: STUDY / NOTES (Simple Duration) */}
                        {(event.type === 'study' || event.type === 'notes') && (
                            <div className="text-right w-full">
                                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider block mb-0.5">Duration</span>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {durationDisplay}
                                </span>
                            </div>
                        )}

                        {/* View Details Hover Button (Visual only for now) */}
                        <div className="hidden group-hover/card:flex absolute top-2 right-2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow-lg items-center gap-1 opacity-0 animate-in fade-in zoom-in duration-200">
                            View Details
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
