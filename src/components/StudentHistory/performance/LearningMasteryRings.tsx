import React, { useState, useMemo } from 'react';
import { MasteryCanvasDTO } from '../../../types/performance';
import { ChevronRight, TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface LearningMasteryRingsProps {
    data: MasteryCanvasDTO;
    overallScore: number;
    isBuilding?: boolean;
}

export const LearningMasteryRings: React.FC<LearningMasteryRingsProps> = ({ data, overallScore, isBuilding = false }) => {
    // Sort logic: High mastery outer -> Low mastery inner (or vice versa? Usually largest outer looks best)
    // Apple Health typically does outer = most active. 
    // Sort logic: High mastery outer -> Low mastery inner (or vice versa? Usually largest outer looks best)
    // Apple Health typically does outer = most active. 
    const sortedNodes = useMemo(() =>
        [...data.nodes].sort((a, b) => b.masteryPercent - a.masteryPercent),
        [data.nodes]);

    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // SVG Config - REDUCED BY ~30%
    const size = 240;
    const center = size / 2;
    const minRadius = 45; // Shrink center hole slightly
    const maxUseableRadius = (size / 2) - 5;
    const availableSpace = maxUseableRadius - minRadius;

    // Dynamic Sizing
    const nodeCount = sortedNodes.length || 1;
    const baseWidth = availableSpace / nodeCount;
    // Enforce stricter gap for interaction stability
    const gap = Math.max(3, baseWidth * 0.2);
    const strokeWidth = Math.max(3, baseWidth - gap);

    const getNodeColor = (state: string, isRing = true) => {
        if (isBuilding) return isRing ? '#f1f5f9' : 'text-slate-300';

        switch (state) {
            case 'stable': return isRing ? '#10b981' : 'text-emerald-500'; // emerald-500
            case 'fading': return isRing ? '#f59e0b' : 'text-amber-500'; // amber-500
            case 'critical': return isRing ? '#ef4444' : 'text-red-500'; // red-500
            default: return isRing ? '#94a3b8' : 'text-slate-400';
        }
    };

    const getRingPath = (index: number, percent: number) => {
        const radius = maxUseableRadius - (index * (strokeWidth + gap)) - (strokeWidth / 2);
        const circumference = 2 * Math.PI * radius;
        // If building, we might show full rings or partial to imply "calibrating"?
        const displayPercent = isBuilding ? 50 : percent;

        const strokeDasharray = `${(displayPercent / 100) * circumference} ${circumference}`;

        return {
            radius,
            circumference,
            strokeDasharray
        };
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full flex flex-col relative overflow-hidden">

            {/* Header */}
            <div className="flex justify-between items-start mb-2 z-10 w-full">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        Learning Mastery
                        {isBuilding && <span className="text-[9px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full text-slate-500 uppercase tracking-wide">Calibrating</span>}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                        {isBuilding ? "Analyzing initial performance..." : "Live subject health status"}
                    </p>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 w-full min-h-[320px]">

                {/* LEFT COLUMN: Rings + Legend */}
                <div className="flex flex-col items-center gap-6">
                    {/* 1. THE RINGS */}
                    <div className="relative group" style={{ width: size, height: size }}>
                        <svg
                            width={size}
                            height={size}
                            className="transform -rotate-90 pointer-events-auto"
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            {sortedNodes.map((node, i) => {
                                const { radius, circumference, strokeDasharray } = getRingPath(i, node.masteryPercent);
                                const color = getNodeColor(node.retentionState);
                                const isHovered = hoveredIndex === i;
                                const isDimmed = hoveredIndex !== null && hoveredIndex !== i;

                                return (
                                    <g key={node.subjectId}
                                        onMouseEnter={() => setHoveredIndex(i)}
                                        className="transition-all duration-300"
                                        style={{ opacity: isDimmed ? 0.2 : 1 }}
                                    >
                                        <circle cx={center} cy={center} r={radius} fill="none" stroke={isBuilding ? "#f8fafc" : color} strokeWidth={strokeWidth} strokeOpacity={isBuilding ? 1 : 0.15} className="dark:stroke-slate-700" />
                                        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                                        <circle cx={center} cy={center} r={radius} fill="none" stroke="transparent" strokeWidth={Math.max(1, strokeWidth - 2)} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                                    </g>
                                );
                            })}
                        </svg>

                        {/* Center Stat */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">
                                {overallScore}
                            </span>
                            <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold">
                                Net L.H.S
                            </span>
                        </div>
                    </div>

                    {/* 2. LEGEND (Directly under ring) */}
                    <div className="flex items-center justify-center gap-4 px-4 py-2 bg-slate-50/50 dark:bg-slate-800/50 rounded-full border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Stable</span>
                        </div>
                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Fading</span>
                        </div>
                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Critical</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Detail Card (Vertical) */}
                <div className="w-48 flex items-center justify-center min-h-[140px] pt-8">
                    {hoveredIndex !== null ? (
                        /* HOVER STATE: Vertical Card */
                        <div className="w-full bg-slate-50 dark:bg-slate-700/30 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 animate-in slide-in-from-right-4 fade-in duration-200 flex flex-col gap-4 shadow-sm">
                            <div className="flex flex-col gap-2">
                                <span className={`self-start text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-white dark:bg-slate-800 shadow-sm ${getNodeColor(sortedNodes[hoveredIndex].retentionState, false)}`}>
                                    {sortedNodes[hoveredIndex].retentionState}
                                </span>
                                <h4 className="text-sm font-black text-slate-700 dark:text-white leading-tight">
                                    {sortedNodes[hoveredIndex].subjectName}
                                </h4>
                            </div>

                            <div>
                                <div className="text-4xl font-black text-slate-800 dark:text-white leading-none tracking-tight">
                                    {sortedNodes[hoveredIndex].masteryPercent}%
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-wide">Mastery Score</div>
                            </div>

                            <div className="pt-3 border-t border-slate-200 dark:border-slate-600">
                                <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1.5">
                                    <Clock size={10} />
                                    <span className="opacity-75 uppercase">Last Activity</span>
                                    {isBuilding ? 'Just now' : new Date(sortedNodes[hoveredIndex].lastAttemptAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ) : (
                        /* DEFAULT STATE: Helper Text */
                        <div className="text-center text-[10px] text-slate-400 flex flex-col items-center justify-center gap-3 opacity-40">
                            <AlertCircle size={20} />
                            <p className="max-w-[120px] font-medium leading-relaxed">Hover over any ring to xray subject details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
