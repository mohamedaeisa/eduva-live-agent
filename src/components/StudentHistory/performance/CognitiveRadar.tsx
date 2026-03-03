import React, { useEffect, useState } from 'react';
import { CognitiveSkillsDTO } from '../../../types/performance';
import { ArrowUpRight, Radar, ScanLine } from 'lucide-react';

interface CognitiveRadarProps {
    data: CognitiveSkillsDTO;
    mode?: 'calibration' | 'full';
}

export const CognitiveRadar: React.FC<CognitiveRadarProps> = ({ data, mode = 'full' }) => {
    const size = 260; // Increased size slightly
    const center = size / 2;
    const radius = 90; // Increased radius
    const angleStep = (Math.PI * 2) / data.metrics.length;
    const [scanAngle, setScanAngle] = useState(0);

    // Scanner Animation
    useEffect(() => {
        let frameId: number;
        const animate = () => {
            setScanAngle(prev => (prev + 1) % 360);
            frameId = requestAnimationFrame(animate);
        };
        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, []);

    const getPoint = (value: number, index: number, radiusScale = 1) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = (value / 100) * radius * radiusScale;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return { x, y, angle };
    };

    const userPath = data.metrics.map((m, i) => {
        const p = getPoint(m.value, i);
        return `${p.x},${p.y}`;
    }).join(' ');

    const webs = [25, 50, 75, 100].map(level =>
        data.metrics.map((_, i) => {
            const p = getPoint(level, i);
            return `${p.x},${p.y}`;
        }).join(' ')
    );

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full relative overflow-hidden flex flex-col">

            <div className="flex justify-between items-start mb-4 z-10">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Radar className="text-violet-500" size={20} /> Cognitive Skills
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Multi-dimensional analysis</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-black text-violet-500">
                        {data.studentScore}<span className="text-sm text-slate-400 font-bold">%</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
                {/* Radar Vis */}
                <div className="relative">
                    <svg width={size} height={size} className="overflow-visible">
                        {/* Background Webs */}
                        {webs.map((points, i) => (
                            <polygon
                                key={i}
                                points={points}
                                fill="none"
                                stroke={i === 3 ? "#cbd5e1" : "#f1f5f9"}
                                strokeWidth="1"
                                className="dark:stroke-slate-700"
                                strokeDasharray={i === 3 ? "0" : "4,4"}
                            />
                        ))}

                        {/* Axis Lines */}
                        {data.metrics.map((_, i) => {
                            const p = getPoint(100, i);
                            return (
                                <line
                                    key={i}
                                    x1={center} y1={center}
                                    x2={p.x} y2={p.y}
                                    stroke="#e2e8f0"
                                    strokeWidth="1"
                                    className="dark:stroke-slate-700"
                                />
                            );
                        })}

                        {/* Data Polygon */}
                        <polygon
                            points={userPath}
                            fill="rgba(139, 92, 246, 0.2)"
                            stroke="#8b5cf6"
                            strokeWidth="3"
                            className="drop-shadow-lg"
                        />

                        {/* Data Points */}
                        {data.metrics.map((m, i) => {
                            const p = getPoint(m.value, i);
                            return (
                                <g key={i}>
                                    <circle cx={p.x} cy={p.y} r="4" fill="#8b5cf6" stroke="white" strokeWidth="2" />
                                </g>
                            );
                        })}

                        {/* Scanner Line (Optional visual flair) */}
                        <g transform={`rotate(${scanAngle}, ${center}, ${center})`}>
                            <line
                                x1={center} y1={center}
                                x2={center} y2={center - radius}
                                stroke="url(#scanGradient)"
                                strokeWidth="2"
                                opacity="0.5"
                            />
                        </g>

                        <defs>
                            <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
                            </linearGradient>
                        </defs>

                        {/* Labels */}
                        {data.metrics.map((m, i) => {
                            // Push labels out by 1.25x radius + padding
                            const p = getPoint(100, i, 1.25);
                            return (
                                <foreignObject
                                    key={i}
                                    x={p.x - 40}
                                    y={p.y - 15}
                                    width="80"
                                    height="40"
                                    className="overflow-visible"
                                >
                                    <div className="flex flex-col items-center justify-center text-center leading-none">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-1 rounded backdrop-blur-sm whitespace-nowrap">
                                            {m.name.replace('_', ' ')}
                                        </span>
                                        <span className="text-[10px] font-bold text-violet-500 mt-1">
                                            {m.value}
                                        </span>
                                    </div>
                                </foreignObject>
                            );
                        })}
                    </svg>
                </div>
            </div>

            {/* Footer / Insight */}
            <div className="mt-2 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    "{data.insight}"
                </p>
            </div>
        </div>
    );
};
