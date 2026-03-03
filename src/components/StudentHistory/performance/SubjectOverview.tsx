import React from 'react';
import { SubjectOverviewDTO } from '../../../types/performance';
import { ArrowRight } from 'lucide-react';

interface SubjectOverviewProps {
    data: SubjectOverviewDTO[];
}

export const SubjectOverview: React.FC<SubjectOverviewProps> = ({ data }) => {

    const getStatusColor = (state: string) => {
        switch (state) {
            case 'stable': return { ring: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/10', text: 'text-emerald-600 dark:text-emerald-400' };
            case 'fading': return { ring: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10', text: 'text-amber-600 dark:text-amber-400' };
            case 'critical': return { ring: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/10', text: 'text-red-600 dark:text-red-400' };
            default: return { ring: 'text-slate-200', bg: 'bg-slate-50', text: 'text-slate-500' };
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Subject Mastery Overview</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.map(subject => {
                    const colors = getStatusColor(subject.retentionState);
                    return (
                        <div key={subject.subjectId} className={`rounded-2xl p-5 border border-slate-100 dark:border-slate-700 ${colors.bg} relative overflow-hidden group hover:shadow-md transition-all`}>

                            <div className="flex justify-between items-start mb-4">
                                <h4 className="text-md font-bold text-slate-800 dark:text-white">{subject.subjectName}</h4>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white dark:bg-slate-800 ${colors.text}`}>
                                    {subject.retentionState}
                                </span>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="relative w-16 h-16">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-white dark:text-slate-600 opacity-50" />
                                        <circle
                                            cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6"
                                            strokeDasharray={`${2 * Math.PI * 28}`}
                                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - subject.masteryPercent / 100)}`}
                                            strokeLinecap="round"
                                            className={`${colors.ring} transition-all duration-1000`}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-sm font-black text-slate-800 dark:text-white">{subject.masteryPercent}%</span>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Last Attempt</p>
                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{subject.lastAttemptAt}</p>
                                </div>
                            </div>

                            {/* Decorative Button Look-alike (Read-only as per spec) */}
                            <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between opacity-50 grayscale">
                                <span className="text-xs font-bold text-slate-400">Review (locked)</span>
                                <ArrowRight size={14} className="text-slate-400" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
