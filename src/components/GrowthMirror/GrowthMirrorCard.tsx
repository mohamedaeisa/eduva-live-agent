
import React, { useState } from 'react';
import { GrowthMirrorDelta, HeadlineKey, DeltaSignal } from '../../types';
import {
    ArrowUp, ArrowRight, ArrowDown, Zap, Activity, BatteryCharging,
    AlertTriangle, Flag, ShieldCheck, Leaf, Lightbulb, TrendingUp,
    BookOpen, Beaker, Languages, Calculator, Monitor, Sparkles
} from 'lucide-react';
import Button from '../ui/Button';

interface GrowthMirrorCardProps {
    delta: GrowthMirrorDelta;
}

// Map signals to UI configurations
const SIGNAL_CONFIG = {
    CONSISTENCY: { icon: Leaf, label: 'Consistency', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    UNDERSTANDING: { icon: Lightbulb, label: 'Understanding', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    CONFIDENCE: { icon: TrendingUp, label: 'Confidence Signal', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' }
};

// Map subjects to icons
const SUBJECT_ICONS: Record<string, React.ElementType> = {
    'Math': Calculator,
    'Mathematics': Calculator,
    'Science': Beaker,
    'Biology': Beaker,
    'Physics': Beaker,
    'Chemistry': Beaker,
    'English': Languages,
    'Arabic': BookOpen,
    'ICT': Monitor,
    'Computer Science': Monitor
};

const SignalRow: React.FC<{
    type: 'CONSISTENCY' | 'UNDERSTANDING' | 'CONFIDENCE',
    signal: DeltaSignal
}> = ({ type, signal }) => {
    const config = SIGNAL_CONFIG[type];
    const Icon = config.icon;

    // Determine text based on signal
    let title = '';
    let desc = '';
    let insight = ''; // New soft explanatory line

    if (type === 'CONSISTENCY') {
        title = signal === 'UP' ? 'Consistency Improved' : signal === 'DOWN' ? 'Consistency slipped' : 'Consistency Steady';
        desc = signal === 'UP' ? 'You studied across multiple days' : signal === 'DOWN' ? 'Fewer active days than last week' : 'You maintained your routine';
        insight = signal === 'UP'
            ? 'Small, repeated effort often leads to steadier progress.'
            : signal === 'DOWN'
                ? 'It’s normal for rhythm to fluctuate when life gets busy.'
                : 'Steady habits build the strongest foundations.';
    } else if (type === 'UNDERSTANDING') {
        title = signal === 'UP' ? 'Understanding Deepened' : signal === 'DOWN' ? 'Concept Gaps Found' : 'Understanding Stable';
        desc = signal === 'UP' ? 'You handled more complex questions' : signal === 'DOWN' ? 'Struggled with some new topics' : 'Mastery levels remaining solid';
        insight = signal === 'UP'
            ? 'This often happens when ideas start connecting together.'
            : signal === 'DOWN'
                ? 'This is common when questions become more challenging.'
                : 'You are reinforcing what you already know.';
    } else {
        title = signal === 'UP' ? 'Confidence Rising' : signal === 'DOWN' ? 'Hesitation Detected' : 'Confidence Steady';
        desc = signal === 'UP' ? 'Fewer skips than before' : signal === 'DOWN' ? 'More skipped questions this week' : 'Pacing is consistent';
        insight = signal === 'UP'
            ? 'You\'re trusting your instincts more.'
            : signal === 'DOWN'
                ? 'Taking more time can be a sign of deeper thinking.'
                : 'A steady pace helps prevent burnout.';
    }

    const TrendIcon = signal === 'UP' ? ArrowUp : signal === 'DOWN' ? ArrowDown : ArrowRight;
    const trendColor = signal === 'UP' ? 'text-emerald-500' : signal === 'DOWN' ? 'text-rose-500' : 'text-slate-400';

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-start gap-4 transition-all hover:scale-[1.02]">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.bg} ${config.color}`}>
                <Icon size={20} className="stroke-[2.5]" />
            </div>
            <div className="flex-1">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{title}</h3>
                    <div className={`w-6 h-6 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center shrink-0 ${trendColor}`}>
                        <TrendIcon size={14} />
                    </div>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5">{desc}</p>
                {/* Enhancement: Soft Insight Line */}
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 italic leading-snug">{insight}</p>
            </div>
        </div>
    );
};

const SubjectChip: React.FC<{ subject: string, direction: 'FORWARD' | 'BACKWARD' | 'STABLE' }> = ({ subject, direction }) => {
    // Normalize subject key for icon lookup (e.g. 'science' -> 'Science')
    // This handles the new lowercased keys from backend normalization
    const normalizedKey = Object.keys(SUBJECT_ICONS).find(k => k.toLowerCase() === subject.toLowerCase()) || 'BookOpen';
    const Icon = SUBJECT_ICONS[normalizedKey] || BookOpen;

    const statusText = direction === 'FORWARD' ? 'Building' : direction === 'BACKWARD' ? 'Refining' : 'Exploring';

    // Enhancement: Subject Micro-Insight
    let microInsight = '';
    if (direction === 'FORWARD') microInsight = 'You’re encountering newer ideas here lately.';
    else if (direction === 'BACKWARD') microInsight = 'You’re taking time to strengthen foundations.';
    else microInsight = 'You’re reinforcing what you already know.';

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-3 min-w-[100px] flex-1">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-xs capitalize">
                    <Icon size={16} className="text-indigo-500" />
                    <span>{subject}</span>
                </div>
                <div className={`p-1 rounded-full ${direction === 'FORWARD' ? 'bg-emerald-50' : direction === 'BACKWARD' ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <ArrowUp
                        size={12}
                        className={`transform transition-transform ${direction === 'FORWARD' ? 'text-emerald-500 rotate-45' :
                            direction === 'BACKWARD' ? 'text-rose-500 rotate-135' :
                                'text-slate-300 rotate-90'
                            }`}
                    />
                </div>
            </div>
            <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">{statusText}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">{microInsight}</p>
            </div>
        </div>
    );
};

// New Component: Pattern Insight Card
const PatternInsightCard: React.FC<{ headlineKey: HeadlineKey }> = ({ headlineKey }) => {
    // Only show for meaningful patterns
    const PATTERN_CONFIG: Partial<Record<HeadlineKey, { title: string, text: string, icon: any }>> = {
        'CONSISTENCY_BUILDING': {
            title: 'Rhythm Found',
            text: 'You’re showing up more regularly, even when things feel effortful.',
            icon: Activity
        },
        'EFFICIENCY_DETECTED': {
            title: 'Efficiency Detected',
            text: 'You’re spending less time but getting more out of it.',
            icon: Zap
        },
        'NEED_FOCUS': {
            title: 'Focus Opportunity',
            text: 'You’re putting in effort while questions are becoming more demanding.',
            icon: AlertTriangle
        },
        'RECHARGING_PAUSE': {
            title: 'Recharging Phase',
            text: 'You took a pause after steady effort — that’s part of a healthy rhythm.',
            icon: BatteryCharging
        },
        'NEW_TERRITORY': {
            title: 'New Territory',
            text: 'You\'re pushing into advanced topics you haven\'t seen before. Fluctuation is expected.',
            icon: Flag
        }
    };

    const config = PATTERN_CONFIG[headlineKey];
    if (!config) return null;

    const Icon = config.icon;

    return (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 flex items-start gap-4 animate-fade-in-up">
            <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shrink-0 text-indigo-500 shadow-sm">
                <Icon size={16} />
            </div>
            <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-1">A pattern we noticed</h4>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{config.text}</p>
            </div>
        </div>
    );
};

export const GrowthMirrorCard: React.FC<GrowthMirrorCardProps> = ({ delta }) => {
    const [reflection, setReflection] = useState('');

    // Contextual Prompts based on Headline Key
    const getReflectionPrompt = (key: HeadlineKey) => {
        switch (key) {
            case 'CONSISTENCY_BUILDING': return "What helped you stay consistent this week?";
            case 'EFFICIENCY_DETECTED': return "What made your study time feel more effective?";
            case 'NEED_FOCUS': return "What made some questions feel harder to focus on?";
            case 'RECHARGING_PAUSE': return "How did taking a pause feel for you?";
            case 'NEW_TERRITORY': return "What new concept felt most interesting?";
            case 'UNSTOPPABLE_RHYTHM': return "What part of your routine is working best?";
            default: return "What is one thing you want to keep doing next week?";
        }
    };

    const promptText = getReflectionPrompt(delta.headlineKey);

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in-up delay-75 max-w-lg mx-auto pb-12">
            {/* Header Summary (Simplified) */}
            <div className="text-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-white italic tracking-tight">
                    Your Learning Mirror
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    Based on your recent activity
                </p>
            </div>

            {/* Signal Stack */}
            <div className="space-y-3">
                <SignalRow type="CONSISTENCY" signal={delta.deltas.consistency} />
                <SignalRow type="UNDERSTANDING" signal={delta.deltas.understanding} />
                <SignalRow type="CONFIDENCE" signal={delta.deltas.confidence} />
            </div>

            {/* Pattern Insight (Conditional) */}
            <PatternInsightCard headlineKey={delta.headlineKey} />

            {/* Subject Grid */}
            <div className="grid grid-cols-2 gap-3">
                {Object.entries(delta.subjects).map(([sub, dir]) => (
                    <SubjectChip key={sub} subject={sub} direction={dir} />
                ))}
            </div>

            {/* Reflection Input (Contextual) */}
            <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 border border-indigo-100 dark:border-indigo-900/30">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-500" />
                    {promptText}
                </h3>
                <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border-none rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-indigo-500 mb-4 h-24 placeholder:text-slate-300 placeholder:italic"
                    placeholder="Reflect here..."
                />
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">~30 Seconds</span>
                    <Button variant="outline" className="text-xs h-8 bg-white dark:bg-slate-800 border-none shadow-sm hover:bg-indigo-50">
                        {reflection ? 'Save Reflection' : 'Skip'}
                    </Button>
                </div>
            </div>

            {/* Optional Micro-Comparison (Footer) */}
            <div className="text-center opacity-60 hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-slate-400 italic">
                    "Compared to before, you’re approaching harder ideas with more consistency."
                </p>
            </div>
        </div>
    );
};
