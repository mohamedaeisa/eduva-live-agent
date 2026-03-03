/**
 * SCREEN 1: Parent Compass - Overall Learning Health
 * 
 * Philosophy: Answer "Is my child generally okay in their learning?"
 * NO scores, NO subjects, NO grades - ONLY emotional support signals
 */

import React from 'react';
import { ParentStudentOverview } from '../types/parentAggregation';
import { TRANSLATIONS } from '../i18n';
import { Language } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';

interface ParentCompassProps {
    overview: ParentStudentOverview | null;
    studentName: string;
    isLoading: boolean;
    onViewDetails: () => void;
    appLanguage: Language;
}

const ParentCompass: React.FC<ParentCompassProps> = ({
    overview,
    studentName,
    isLoading,
    onViewDetails,
    appLanguage
}) => {
    // Translation support
    const t = TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];

    // Helper to normalize data strings to translation keys
    // e.g., "Needs Support" -> "needs_support"
    // "Stable & Progressing" -> "stable_progressing"
    const toCode = (str: string | undefined): string => {
        if (!str) return 'default';
        return str.toLowerCase()
            .replace(/ & /g, '_')
            .replace(/ /g, '_')
            .replace(/[^a-z0-9_]/g, '');
    };

    // Helper to get color based on signal value
    const getSignalColor = (signal: string | undefined): string => {
        const code = toCode(signal);
        switch (code) {
            case 'strong':
            case 'stable_progressing':
                return 'text-emerald-500 dark:text-emerald-400';
            case 'stable':
                return 'text-blue-500 dark:text-blue-400';
            case 'needs_support':
                return 'text-amber-500 dark:text-amber-400';
            case 'struggling':
                return 'text-red-500 dark:text-red-400';
            default:
                return 'text-slate-500 dark:text-slate-400';
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">{t.loading}</p>
            </div>
        );
    }

    if (!overview) {
        return (
            <div className="py-20 text-center">
                <div className="text-6xl mb-4">🌱</div>
                <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Learning Journey Starting
                </h3>
                <p className="text-slate-500 max-w-md mx-auto">
                    {studentName}'s learning data will appear here after their first activity.
                    We'll show you how they're experiencing learning, not just their results.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-6">
            {/* TOP ROW: Hero (60%) + Support (40%) Side-by-Side - COMPACT 50% HEIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* LEFT: Overall Learning Health - 60% (3/5 columns) */}
                <div className="lg:col-span-3">
                    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-4 md:p-5 shadow-xl h-full text-white`}>
                        {/* Animated Background Glow */}
                        <div className="absolute inset-0 opacity-20">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] rounded-full bg-gradient-radial from-white/40 to-transparent animate-pulse"></div>
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row items-center gap-4">
                            {/* Brain Visual - SMALLER */}
                            <div className="relative">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                                    <span className="text-3xl">🧠</span>
                                </div>
                                {/* Pulse rings */}
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-300/30 animate-ping" style={{ animationDuration: '3s' }}></div>
                            </div>
                            {/* Header Section */}
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-sm font-bold text-indigo-200 uppercase tracking-widest">
                                            {t.overallSignal}
                                        </span>
                                    </div>
                                    <h1 className={`text-4xl md:text-5xl font-black ${getSignalColor(overview.overallHealth)}`}>
                                        {(t.parent.status as any)[toCode(overview.overallHealth)] || overview.overallHealth}
                                    </h1>
                                    <p className="text-slate-200 mt-2 max-w-lg text-lg">
                                        {(t.parent.compass.supportStance as any)[toCode(overview.overallHealth)] || t.parent.compass.supportStance.default}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: This Week's Support - 40% (2/5 columns) - COMPACT */}
                <div className="lg:col-span-2">
                    <Card className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-2 border-indigo-200 dark:border-indigo-800 h-full">
                        <div className="flex flex-col h-full">
                            <div className="flex items-start gap-2 mb-3">
                                <div className="text-2xl">💬</div>
                                <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-300">
                                    {t.recentActivity}
                                </h3>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 flex-1">
                                {overview.supportStance}
                            </p>
                            <Button
                                onClick={onViewDetails}
                                className="w-full px-4 py-2 text-xs font-bold"
                            >
                                {t.viewDetails}
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Four Signal Cards - RESPONSIVE: 1 col mobile, 2 col small, 4 col desktop */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {/* Recovery */}
                <SignalCard
                    icon="🔄"
                    label={t.parent.signals.recovery}
                    value={(t.parent.status as any)[toCode(overview.recovery)] || overview.recovery}
                    color="indigo"
                />

                {/* Focus */}
                <SignalCard
                    icon="🎯"
                    label={t.parent.signals.focus}
                    value={(t.parent.status as any)[toCode(overview.focus)] || overview.focus}
                    color="purple"
                />

                {/* Understanding */}
                <SignalCard
                    icon="💡"
                    label={t.parent.signals.understanding}
                    value={(t.parent.status as any)[toCode(overview.understanding)] || overview.understanding}
                    color="blue"
                />

                {/* Effort */}
                <SignalCard
                    icon="📈"
                    label={t.parent.signals.effort}
                    value={(t.parent.status as any)[toCode(overview.effort)] || overview.effort}
                    color="emerald"
                />
            </div>

            {/* Learning Stability Over Time - RESPONSIVE HEIGHT */}
            <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">
                    Learning Stability Over Time
                </h3>

                {/* Abstract visualization - responsive height for mobile */}
                <div className="relative h-32 md:h-40 lg:h-48">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                            <linearGradient id="signalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="rgb(20, 184, 166)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path
                            d={generateSignalPath(overview.stabilityTrend)}
                            fill="url(#signalGradient)"
                            stroke="rgb(20, 184, 166)"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>

                <p className="text-xs text-slate-400 text-center mt-3">
                    This shows engagement patterns, not performance
                </p>
            </Card>

            {/* Footer Message */}
            <div className="text-center py-4">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                    EDUVA shows growth signals, not grades or answers.
                </p>
            </div>
        </div>
    );
};

// Signal Card Component - FLATTENED (less status-like, more label-like)
const SignalCard: React.FC<{
    icon: string;
    label: string;
    value: string;
    color: string;
}> = ({ icon, label, value, color }) => {
    const colorClasses = {
        emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
        blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
        purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
        indigo: "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800",
        amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    }[color] || "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800";

    return (
        <Card className={`p-6 text-center border ${colorClasses} shadow-none`}>
            <div className="text-4xl mb-3">{icon}</div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                {label}
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                {value}
            </div>
        </Card>
    );
};

// Helper: Generate SVG path for opaque signal trend (no normalization)
const generateSignalPath = (signals: Array<{ t: number; v: number }>): string => {
    if (signals.length === 0) return '';

    // Find max value for relative scaling within chart only
    const maxVal = Math.max(...signals.map(s => s.v), 1);
    const width = 100;
    const height = 100;
    const xStep = width / (signals.length - 1 || 1);

    let path = `M 0 ${height}`;

    signals.forEach((signal, i) => {
        const x = i * xStep;
        // Scale relative to max, inverted for SVG coordinates
        const y = height - ((signal.v / maxVal) * height * 0.8);
        if (i === 0) {
            path += ` L ${x} ${y}`;
        } else {
            path += ` L ${x} ${y}`;
        }
    });

    path += ` L ${width} ${height} L 0 ${height} Z`;

    return path;
};

export default ParentCompass;
