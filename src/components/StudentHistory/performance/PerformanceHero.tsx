import React from 'react';
import { LearningHealthDTO } from '../../../types/performance';
import { Award, Zap, Flame } from 'lucide-react';

interface PerformanceHeroProps {
    data: LearningHealthDTO;
    mode?: 'building' | 'evaluated';
}

export const PerformanceHero: React.FC<PerformanceHeroProps> = ({ data, mode = 'evaluated' }) => {
    const isBuilding = mode === 'building';

    // Debug Render
    console.log("[UI] <PerformanceHero> rendering with health:", data.status, data.lhsScore, "Mode:", mode);

    // Health Color Logic
    const getHealthColor = (status: string) => {
        if (isBuilding) return 'from-slate-300 to-slate-400'; // Neutral for building

        switch (status) {
            case 'thriving': return 'from-teal-400 to-emerald-500';
            case 'advancing': return 'from-blue-400 to-indigo-500';
            case 'stabilizing': return 'from-yellow-400 to-orange-500';
            case 'at_risk': return 'from-red-400 to-rose-500';
            default: return 'from-blue-400 to-indigo-500';
        }
    };

    const gradient = getHealthColor(data.status);

    return (
        <div className="w-full bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 p-6 md:p-8 relative overflow-hidden border border-slate-100 dark:border-slate-700">
            {/* Background Glow */}
            <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${gradient} opacity-10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2`} />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">

                {/* 1. Learning Health Score (Ring) */}
                <div className="relative w-32 h-32 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-700" />

                        {/* Solid Ring vs Dashed Placeholder */}
                        {!isBuilding ? (
                            <circle
                                cx="64" cy="64" r="56" fill="none" stroke="url(#healthGradient)" strokeWidth="8" strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 56}`}
                                strokeDashoffset={`${2 * Math.PI * 56 * (1 - data.lhsScore / 100)}`}
                                className="transition-all duration-1000 ease-out"
                            />
                        ) : (
                            // Building Mode: Dashed neutral ring
                            <circle
                                cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="4"
                                strokeDasharray="8,8" opacity="0.2" className="text-slate-400 animate-[spin_10s_linear_infinite]"
                            />
                        )}

                        <defs>
                            <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={isBuilding ? "#94a3b8" : "#60a5fa"} />
                                <stop offset="100%" stopColor={isBuilding ? "#cbd5e1" : "#8b5cf6"} />
                            </linearGradient>
                        </defs>
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        {!isBuilding ? (
                            <>
                                <span className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter">{data.lhsScore}</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{data.status}</span>
                            </>
                        ) : (
                            // Building Mode: Icon
                            <Zap size={32} className="text-slate-300 fill-slate-100" />
                        )}
                    </div>
                </div>

                {/* 2. Insight & Summary */}
                <div className="flex-1 text-center md:text-left space-y-2">
                    <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white">Learning Health</h2>
                        {!isBuilding && <Zap size={20} className="text-yellow-500 fill-yellow-500 animate-pulse" />}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium text-lg">
                        {data.insightText}
                    </p>
                    {/* XP Progress Bar (Mini) */}
                    <div className="pt-4 max-w-md">
                        <div className="flex justify-between text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">
                            <span className="flex items-center gap-1"><Award size={12} className="text-purple-500" /> Level {data.xp.level} Scholar</span>
                            <span className="flex items-center gap-1"><Flame size={12} className="text-orange-500" /> +{data.xp.weeklyXPDelta} XP this week</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                                style={{ width: `${(data.xp.currentXP / data.xp.nextLevelXP) * 100}%` }}
                            />
                        </div>
                        <div className="text-right mt-1">
                            <span className="text-[10px] text-slate-400">{data.xp.currentXP} / {data.xp.nextLevelXP} XP</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
