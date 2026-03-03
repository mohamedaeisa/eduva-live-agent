import React from 'react';
import { RecentActivityDTO } from '../../../types/performance';
import { Activity, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface RecentActivityProps {
    data: RecentActivityDTO[];
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ data }) => {

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                <Activity className="text-blue-500" size={20} /> Recent Activity
            </h3>

            <div className="space-y-4">
                {data.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl relative overflow-hidden">
                        {/* Left Color Bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.masteryDelta > 0 ? 'bg-green-500' : 'bg-red-500'}`} />

                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-800 dark:text-white">{item.subjectName}</span>
                                <span className={`text-xs font-black px-2 py-0.5 rounded ${item.type === 'quiz' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'} uppercase tracking-wider`}>
                                    {item.type}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                Retention: <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{item.retentionImpact}</span>
                            </p>
                        </div>

                        <div className="text-right">
                            <div className={`text-lg font-black flex items-center justify-end gap-1 ${item.masteryDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {item.masteryDelta > 0 ? '+' : ''}{item.masteryDelta}%
                                {item.masteryDelta > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                            </div>
                            <p className="text-[10px] text-slate-400">{new Date(item.occurredAt).toLocaleDateString()}</p>
                        </div>
                    </div>
                ))}

                <button className="w-full py-3 text-xs font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors">
                    View Full Log
                </button>
            </div>
        </div>
    );
};
