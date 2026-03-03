/**
 * SCREEN 2: Parent Compass Details - Subject Learning Overview
 * 
 * Philosophy: Show how learning is EXPERIENCED across subjects
 * NOT performance - experience and support
 */

import React from 'react';
import { ParentSubjectOverview } from '../types/parentAggregation';
import Card from './ui/Card';

interface ParentCompassDetailsProps {
    subjects: ParentSubjectOverview[];
    studentName: string;
    isLoading: boolean;
    onSelectSubject: (subject: ParentSubjectOverview) => void;
    appLanguage: Language;
}

import { TRANSLATIONS } from '../i18n';
import { Language } from '../types';

const ParentCompassDetails: React.FC<ParentCompassDetailsProps> = ({
    subjects,
    studentName,
    isLoading,
    onSelectSubject,
    appLanguage
}) => {
    const t = TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];

    // Helper to normalize data strings
    const toCode = (str: string | undefined): string => {
        if (!str) return 'default';
        return str.toLowerCase()
            .replace(/ & /g, '_')
            .replace(/ /g, '_')
            .replace(/[^a-z0-9_]/g, '');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">{t.loading}</p>
            </div>
        );
    }

    if (subjects.length === 0) {
        return (
            <div className="py-20 text-center">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {t.parent.report.no_data}
                </h3>
                <p className="text-slate-500 max-w-md mx-auto">
                    {t.parent.report.data_coming}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-6">
            {/* Header with Student Breadcrumb */}
            <div className="text-center mb-6 sm:mb-8">
                {/* Student Name Breadcrumb - COMPACT (50% height) */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mb-3 sm:mb-4">
                    <span className="text-base">👤</span>
                    <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                        {studentName}
                    </span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-800 dark:text-slate-200 mb-3 sm:mb-4 px-2">
                    {t.subjectProgress}
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-3xl mx-auto px-2">
                    This view shows how learning is progressing across subjects, focusing on experience and support — not results.
                </p>
            </div>

            {/* Subject Cards Grid - RESPONSIVE: 1 col mobile, 2 col tablet/desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {subjects.map(subject => (
                    <SubjectCard
                        key={subject.subject}
                        subject={subject}
                        onClick={() => onSelectSubject(subject)}
                        t={t}
                    />
                ))}
            </div>

            {/* Footer */}
            <div className="text-center py-6 sm:py-8 px-4">
                <p className="text-xs sm:text-sm text-slate-400 uppercase tracking-widest">
                    {t.parent.footer.philosophy}
                </p>
            </div>
        </div>
    );
};

// Subject Card Component
const SubjectCard: React.FC<{
    subject: ParentSubjectOverview;
    onClick: () => void;
    t: any;
}> = ({ subject, onClick, t }) => {
    // Helper must be duplicated or passed, duplicating for self-containment in this context
    const toCode = (str: string | undefined): string => {
        if (!str) return 'default';
        return str.toLowerCase()
            .replace(/ & /g, '_')
            .replace(/ /g, '_')
            .replace(/[^a-z0-9_]/g, '');
    };

    // State color mapping (using English keys from data for logic)
    const stateColors = {
        'Stable & Progressing': 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-300',
        'Effortful but Steady': 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-300',
        'Temporarily Challenging': 'from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-300',
        'Light Engagement': 'from-slate-50 to-slate-100 dark:from-slate-900/20 dark:to-slate-800/20 border-slate-300'
    };

    const stateTextColors = {
        'Stable & Progressing': 'text-emerald-700 dark:text-emerald-400',
        'Effortful but Steady': 'text-blue-700 dark:text-blue-400',
        'Temporarily Challenging': 'text-amber-700 dark:text-amber-400',
        'Light Engagement': 'text-slate-700 dark:text-slate-400'
    };

    // Subject icons
    const subjectIcons: Record<string, string> = {
        'Mathematics': '📐',
        'Arabic Language': '📖',
        'Science': '🔬',
        'ICT': '💻',
        'English': '📝',
        'Physics': '⚛️',
        'Chemistry': '🧪',
        'Biology': '🧬'
    };

    const icon = subjectIcons[subject.subject] || '📚';
    // Use data value for logic, translate for display
    const bgClass = (stateColors as any)[subject.learningState] || stateColors['Light Engagement'];
    const textClass = (stateTextColors as any)[subject.learningState] || stateTextColors['Light Engagement'];

    // Safe lookup for display text
    const displayState = (t.parent.status as any)[toCode(subject.learningState)] || subject.learningState;
    const supportStance = (t.parent.compass.subjectStance as any)[toCode(subject.learningState)] || t.parent.compass.subjectStance.default;

    return (
        <Card
            className={`p-4 sm:p-6 bg-gradient-to-br ${bgClass} border-2 cursor-pointer transition-all hover:scale-105 hover:shadow-2xl`}
            onClick={onClick}
        >
            {/* A. Subject Header - RESPONSIVE TEXT */}
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="text-3xl sm:text-4xl md:text-5xl">{icon}</div>
                <div>
                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-200">
                        {subject.subject}
                    </h3>
                </div>
            </div>

            {/* B. Learning State (PRIMARY) */}
            <div className="mb-4 sm:mb-6">
                <div className={`text-2xl sm:text-3xl font-black ${textClass} leading-tight`}>
                    {displayState}
                </div>
            </div>

            {/* C. Learning Signals (Max 3) */}
            <div className="space-y-3 mb-6">
                {subject.signals.effort && (
                    <SignalBadge
                        icon="📈"
                        label={t.parent.signals.effort}
                        value={(t.parent.status as any)[toCode(subject.signals.effort)]}
                    />
                )}
                {subject.signals.understanding && (
                    <SignalBadge
                        icon="💡"
                        label={t.parent.signals.understanding}
                        value={(t.parent.status as any)[toCode(subject.signals.understanding)]}
                    />
                )}
                {subject.signals.focus && (
                    <SignalBadge
                        icon="🎯"
                        label={t.parent.signals.focus}
                        value={(t.parent.status as any)[toCode(subject.signals.focus)]}
                    />
                )}
            </div>

            {/* D. Parent Support Stance */}
            <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    {t.recentActivity}:
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 italic">
                    {supportStance}
                </div>
            </div>
        </Card>
    );
};

// Signal Badge Component
const SignalBadge: React.FC<{
    icon: string;
    label: string;
    value: string;
}> = ({ icon, label, value }) => (
    <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {label}:
            </div>
        </div>
        <div className="text-sm font-black text-slate-800 dark:text-slate-200">
            {value}
        </div>
    </div>
);

export default ParentCompassDetails;
