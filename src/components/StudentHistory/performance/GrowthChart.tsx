import React from 'react';
import { GrowthTimelineDTO } from '../../../types/performance';

interface GrowthChartProps {
    data: GrowthTimelineDTO;
    mode?: 'placeholder' | 'full';
}

export const GrowthChart: React.FC<GrowthChartProps> = ({ data, mode = 'full' }) => {

    if (mode === 'placeholder') {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Growth Over Time</h3>
                <div className="w-full h-[180px] flex flex-col items-center justify-center text-center opacity-40">
                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full mb-4" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Not enough data to show trends</p>
                </div>
            </div>
        );
    }

    // Generate SVG path for chart
    // We assume data is sorted chronologically
    const points = data.points;
    const height = 150;
    const width = 500;

    // Normalize logic
    const minScore = 0;
    const maxScore = 100;

    const getX = (i: number) => (i / (points.length - 1)) * width;
    const getY = (val: number) => height - ((val - minScore) / (maxScore - minScore)) * height;

    const actualPath = points.map((p, i) => `${getX(i)},${getY(p.masteryScore)}`).join(' L ');
    const expectedPath = points.map((p, i) => `${getX(i)},${getY(p.expectedScore)}`).join(' L ');

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Growth Over Time</h3>

            <div className="w-full h-[180px] relative">
                <svg viewBox={`0 0 ${width} ${height + 20}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    {/* Grid Lines */}
                    <line x1="0" y1={height} x2={width} y2={height} stroke="#e2e8f0" strokeWidth="1" />
                    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4,4" />

                    {/* Expected (Dashed) */}
                    <path
                        d={`M 0,${getY(points[0].expectedScore)} L ${expectedPath}`}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeDasharray="6,4"
                        className="dark:stroke-slate-600"
                    />

                    {/* Actual (Solid + Gradient) */}
                    <defs>
                        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path
                        d={`M 0,${height} L 0,${getY(points[0].masteryScore)} L ${actualPath} L ${width},${height} Z`}
                        fill="url(#growthFill)"
                    />
                    <path
                        d={`M 0,${getY(points[0].masteryScore)} L ${actualPath}`}
                        fill="none"
                        stroke="#8b5cf6"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />

                    {/* Current Point */}
                    <circle
                        cx={width} cy={getY(points[points.length - 1].masteryScore)}
                        r="4" fill="white" stroke="#8b5cf6" strokeWidth="2"
                    />
                </svg>

                <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span>{points[0].date}</span>
                    <span>{points[points.length - 1].date}</span>
                </div>
            </div>
        </div>
    );
};
