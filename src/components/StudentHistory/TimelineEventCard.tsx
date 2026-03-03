import React from 'react';
import { TimelineEvent, formatRelativeTime } from '../../services/studentHistoryService';
import { Award, BookOpen, Brain, FileText, TrendingUp, TrendingDown, Minus, CheckCircle } from 'lucide-react';

interface TimelineEventCardProps {
    event: TimelineEvent;
}

export const TimelineEventCard: React.FC<TimelineEventCardProps> = ({ event }) => {
    // Icon and color based on event type
    const getEventStyle = () => {
        switch (event.type) {
            case 'EXAM':
                return {
                    icon: Award,
                    bgColor: 'bg-gradient-to-br from-yellow-100 to-amber-100 dark:from-yellow-900/20 dark:to-amber-900/20',
                    iconColor: 'text-yellow-600 dark:text-yellow-400',
                    borderColor: 'border-yellow-200 dark:border-yellow-800',
                };
            case 'QUIZ':
                return {
                    icon: CheckCircle,
                    bgColor: 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20',
                    iconColor: 'text-blue-600 dark:text-blue-400',
                    borderColor: 'border-blue-200 dark:border-blue-800',
                };
            case 'NOTE':
                return {
                    icon: BookOpen,
                    bgColor: 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20',
                    iconColor: 'text-green-600 dark:text-green-400',
                    borderColor: 'border-green-200 dark:border-green-800',
                };
            case 'STUDY':
                return {
                    icon: Brain,
                    bgColor: 'bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20',
                    iconColor: 'text-purple-600 dark:text-purple-400',
                    borderColor: 'border-purple-200 dark:border-purple-800',
                };
            default:
                return {
                    icon: FileText,
                    bgColor: 'bg-gray-100 dark:bg-gray-800',
                    iconColor: 'text-gray-600 dark:text-gray-400',
                    borderColor: 'border-gray-200 dark:border-gray-700',
                };
        }
    };

    const style = getEventStyle();
    const Icon = style.icon;

    // Grade badge color
    const getGradeBadgeColor = (grade: string) => {
        if (grade === 'A') return 'bg-green-500 text-white';
        if (grade === 'B+' || grade === 'B') return 'bg-blue-500 text-white';
        if (grade === 'C+' || grade === 'C') return 'bg-yellow-500 text-white';
        return 'bg-red-500 text-white';
    };

    // Mastery delta indicator
    const getMasteryDeltaIcon = () => {
        if (!event.masteryDelta) return null;
        if (event.masteryDelta > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
        if (event.masteryDelta < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
        return <Minus className="w-4 h-4 text-gray-400" />;
    };

    return (
        <div className={`
            group relative p-5 rounded-2xl border-2 ${style.borderColor}
            ${style.bgColor} backdrop-blur-sm
            transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
            cursor-pointer
        `}>
            {/* Event Header */}
            <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-6 h-6 ${style.iconColor}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Title and Timestamp */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-gray-800 dark:text-white truncate">
                                {event.title}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {event.subject} • {formatRelativeTime(event.timestamp)}
                            </p>
                        </div>

                        {/* Grade Badge (for exams/quizzes) */}
                        {event.grade && event.score !== undefined && (
                            <div className="flex flex-col items-end gap-1">
                                <div className={`
                                    px-3 py-1 rounded-full text-xs font-bold
                                    ${getGradeBadgeColor(event.grade)}
                                    shadow-sm
                                `}>
                                    {event.grade}
                                </div>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                    {Math.round(event.score)}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Mastery Delta (if available) */}
                    {event.masteryDelta !== undefined && event.masteryDelta !== 0 && (
                        <div className="flex items-center gap-2 mb-3 text-xs font-medium">
                            {getMasteryDeltaIcon()}
                            <span className={`
                                ${event.masteryDelta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                            `}>
                                {event.masteryDelta > 0 ? '+' : ''}{event.masteryDelta}% mastery
                            </span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {event.actions.map((action, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('[Action]', action.action, action.data);
                                    // TODO: Implement action handlers
                                }}
                                className="
                                    px-3 py-1.5 rounded-lg text-xs font-semibold
                                    bg-white dark:bg-gray-800 
                                    text-gray-700 dark:text-gray-300
                                    border border-gray-200 dark:border-gray-700
                                    hover:bg-gray-50 dark:hover:bg-gray-700
                                    transition-colors duration-200
                                    shadow-sm
                                "
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
