/**
 * SCREEN 3: Subject Progress Report
 * 
 * Purpose: Show structural progress - how complete is the subject?
 * Shows COVERAGE, not performance
 */

import React from 'react';
import { ParentSubjectProgressReport } from '../types/parentAggregation';
import Card from './ui/Card';
import Button from './ui/Button';

interface ParentSubjectProgressReportProps {
    report: ParentSubjectProgressReport | null;
    studentName: string;
    isLoading: boolean;
    onBack: () => void;
    appLanguage: Language;
}

import { TRANSLATIONS } from '../i18n';
import { Language } from '../types';

const ParentSubjectProgressReportView: React.FC<ParentSubjectProgressReportProps> = ({
    report,
    studentName,
    isLoading,
    onBack,
    appLanguage
}) => {
    const t = TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];

    // Helper to normalize strings for lookup
    const toCode = (str: string): string => {
        return str.toLowerCase().replace(/ /g, '_');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">{t.loading}</p>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="py-20 text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {t.parent.report.no_progress}
                </h3>
                <p className="text-slate-500 max-w-md mx-auto mb-6">
                    {t.parent.report.progress_coming}
                </p>
                <Button onClick={onBack}>{t.parent.report.back_subjects}</Button>
            </div>
        );
    }

    // Mastery health colors - CALM SEMANTICS
    const healthColors = {
        'Strong': 'bg-teal-500 text-white',   // Calm teal
        'Stable': 'bg-blue-500 text-white',   // Neutral blue
        'Fragile': 'bg-amber-500 text-white'  // Soft amber (not red)
    };

    return (
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-6">
            {/* Student Name Badge - COMPACT (50% height) */}
            <div className="flex justify-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                    <span className="text-base">👤</span>
                    <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                        {studentName}
                    </span>
                </div>
            </div>

            {/* Header - RESPONSIVE */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-800 dark:text-slate-200">
                        {report.subject} – {t.progressReport}
                    </h1>
                </div>
                <Button onClick={onBack} className="px-6 py-3 w-full sm:w-auto">
                    ← {t.parent.report.back_subjects}
                </Button>
            </div>

            {/* Summary Card */}
            <Card className="p-8 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-6">
                    {t.parent.report.structural_coverage}
                </h2>

                {/* RESPONSIVE GRID: 1 col mobile, 2 col tablet, 4 col desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* CRITICAL FIX: Labels ABOVE numbers on all devices for clarity */}

                    {/* Covered Concepts */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm sm:text-lg font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 order-1">
                            {t.coveredConcepts}
                        </div>
                        <div className="text-2xl sm:text-3xl font-semibold text-indigo-600 dark:text-indigo-400 order-2">
                            {report.coveredConcepts} / {report.totalConcepts > 0 ? report.totalConcepts : '—'}
                        </div>
                        {report.totalConcepts === 0 && (
                            <div className="text-xs text-slate-400 mt-1 italic order-3">{t.parent.report.total_not_defined}</div>
                        )}
                    </div>

                    {/* Mastered Concepts */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm sm:text-lg font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 order-1">
                            {t.masteredConcepts}
                        </div>
                        <div className="text-2xl sm:text-3xl font-semibold text-emerald-600 dark:text-emerald-400 order-2">
                            {report.masteredConcepts}
                        </div>
                    </div>

                    {/* Pending Concepts */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm sm:text-lg font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 order-1">
                            {t.pendingConcepts}
                        </div>
                        <div className="text-2xl sm:text-3xl font-semibold text-amber-600 dark:text-amber-400 order-2">
                            {report.pendingConcepts}
                        </div>
                    </div>

                    {/* Recent Momentum - Icon + Text Together */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm sm:text-lg font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 order-1">
                            {t.recentMomentum}
                        </div>
                        <div className="flex flex-col items-center gap-2 order-2">
                            <div className="text-2xl sm:text-3xl">
                                {report.recentMomentum === 'Rising' ? '↗' :
                                    report.recentMomentum === 'Slowing' ? '↘' : '→'}
                            </div>
                            <div className="text-lg sm:text-xl font-semibold text-purple-600 dark:text-purple-400">
                                {(t as any)[`momentum${report.recentMomentum}`] || report.recentMomentum}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Mastery Health */}
            <Card className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">
                            {t.masteryHealth}
                        </div>
                        <div className="text-lg text-slate-700 dark:text-slate-300">
                            {t.parent.report.mastery_description}
                        </div>
                    </div>
                    <div className={`px-6 py-3 rounded-2xl font-black text-lg ${healthColors[report.masteryHealth]}`}>
                        {(t.parent.signals as any)[toCode(report.masteryHealth)] || report.masteryHealth}
                    </div>
                </div>
            </Card>

            {/* Chapter Timeline */}
            {report.timeline.length > 0 && (
                <Card className="p-8">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-6">
                        {t.chapterTimeline}
                    </h2>

                    <div className="space-y-4">
                        {report.timeline.map((chapter, index) => {
                            // Translate status
                            const statusKey = toCode(chapter.status); // "Completed" -> "completed", "In Progress" -> "in_progress", "Not Started" -> "not_started"
                            const localizedStatus = (t.parent.report.timeline_status as any)[statusKey] || chapter.status;

                            return (
                                <div
                                    key={index}
                                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl"
                                >
                                    {/* Status Icon */}
                                    <div className="text-3xl">
                                        {chapter.status === 'Completed' ? '✔' :
                                            chapter.status === 'In Progress' ? '🔄' : '⚠'}
                                    </div>

                                    {/* Chapter Info */}
                                    <div className="flex-1">
                                        <div className="font-bold text-lg text-slate-800 dark:text-slate-200">
                                            {chapter.chapterName}
                                        </div>
                                        {chapter.status === 'Completed' && (
                                            <div className="text-sm text-emerald-600 dark:text-emerald-400">
                                                {localizedStatus} — {chapter.conceptsCovered} {t.conceptsCovered.toLowerCase()}
                                            </div>
                                        )}
                                        {chapter.status === 'In Progress' && (
                                            <div className="text-sm text-blue-600 dark:text-blue-400">
                                                {localizedStatus} — {chapter.conceptsCovered} / {chapter.conceptsTotal} {t.conceptsTotal.toLowerCase()}
                                            </div>
                                        )}
                                        {chapter.status === 'Not Started' && (
                                            <div className="text-sm text-slate-500">
                                                {localizedStatus}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Mandatory Rule Banner */}
            <Card className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700">
                <div className="flex items-start gap-4">
                    <div className="text-3xl">⚠️</div>
                    <div className="flex-1">
                        <div className="font-bold text-lg text-amber-900 dark:text-amber-300 mb-2">
                            {t.importantReminder}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">
                            {t.parent.report.reminder_content}
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default ParentSubjectProgressReportView;
