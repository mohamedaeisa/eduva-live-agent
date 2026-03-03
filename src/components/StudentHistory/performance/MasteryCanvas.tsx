import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MasteryCanvasDTO } from '../../../types/performance';

interface MasteryCanvasProps {
    data: MasteryCanvasDTO;
    mode?: 'preview' | 'full';
}

// Internal Physics Types
interface PhysicsNode {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    data: MasteryCanvasDTO['nodes'][0];
}

export const MasteryCanvas: React.FC<MasteryCanvasProps> = ({ data, mode = 'full' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<PhysicsNode[]>([]);
    const requestRef = useRef<number | null>(null);

    // Initialize Simulation
    useEffect(() => {
        if (!data.nodes.length) return;

        const width = containerRef.current?.clientWidth || 400;
        const height = containerRef.current?.clientHeight || 400;
        const centerX = width / 2;
        const centerY = height / 2;

        // Initial positions: spread out in a circle
        const initialNodes: PhysicsNode[] = data.nodes.map((n, i) => {
            const angle = (i / data.nodes.length) * Math.PI * 2;
            const r = 100;
            return {
                id: n.subjectId,
                x: centerX + Math.cos(angle) * r,
                y: centerY + Math.sin(angle) * r,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: 40 + (n.masteryPercent / 4), // Dynamic Size (40-65px)
                data: n
            };
        });

        setNodes(initialNodes);
    }, [data]);

    // Physics Loop
    const updatePhysics = () => {
        setNodes(prevNodes => {
            const width = containerRef.current?.clientWidth || 400;
            const height = containerRef.current?.clientHeight || 400;
            const centerX = width / 2;
            const centerY = height / 2;

            return prevNodes.map((node, i) => {
                let { x, y, vx, vy, radius } = node;

                // 1. Center Gravity (weak pull to center)
                const dx = centerX - x;
                const dy = centerY - y;
                vx += dx * 0.0005;
                vy += dy * 0.0005;

                // 2. Node Repulsion (prevent overlap)
                prevNodes.forEach((other, j) => {
                    if (i === j) return;
                    const diffX = x - other.x;
                    const diffY = y - other.y;
                    const dist = Math.sqrt(diffX * diffX + diffY * diffY);
                    const minDist = radius + other.radius + 10; // +10 padding

                    if (dist < minDist) {
                        const force = (minDist - dist) / minDist; // Normalized force
                        const repelX = (diffX / dist) * force * 1; // Strength
                        const repelY = (diffY / dist) * force * 1;
                        vx += repelX;
                        vy += repelY;
                    }
                });

                // 3. Wall Repulsion
                if (x < radius) vx += 0.5;
                if (x > width - radius) vx -= 0.5;
                if (y < radius) vy += 0.5;
                if (y > height - radius) vy -= 0.5;

                // 4. Dampening (friction)
                vx *= 0.96;
                vy *= 0.96;

                return { ...node, x: x + vx, y: y + vy, vx, vy };
            });
        });
        requestRef.current = requestAnimationFrame(updatePhysics);
    };

    useEffect(() => {
        if (nodes.length > 0) {
            requestRef.current = requestAnimationFrame(updatePhysics);
        }
        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };
    }, [nodes.length > 0]); // Restart loop if nodes re-init

    const getNodeColor = (state: string) => {
        switch (state) {
            case 'stable': return '#10b981'; // emerald-500
            case 'fading': return '#f59e0b'; // amber-500
            case 'critical': return '#ef4444'; // red-500
            default: return '#cbd5e1';
        }
    };

    return (
        <div ref={containerRef} className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full min-h-[400px] relative overflow-hidden group">
            {/* Header */}
            <div className="absolute top-6 left-6 z-10 pointer-events-none">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    Learning Mastery
                    {mode === 'preview' && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full text-slate-500">PREVIEW</span>}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Live simulation of your knowledge clusters</p>
            </div>

            {/* Background Grid */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle, #64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>

            {/* Canvas */}
            <div className="w-full h-full relative">
                {nodes.map(node => (
                    <div
                        key={node.id}
                        style={{
                            transform: `translate(${node.x - node.radius}px, ${node.y - node.radius}px)`,
                            width: node.radius * 2,
                            height: node.radius * 2,
                        }}
                        className="absolute flex items-center justify-center transition-transform will-change-transform cursor-pointer hover:z-50"
                    >
                        {/* Glow Effect for Active/Warning Items */}
                        <div className={`absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500`}
                            style={{ backgroundColor: getNodeColor(node.data.retentionState) }}></div>

                        {/* Main Bubble */}
                        <div className="relative w-full h-full rounded-full bg-white dark:bg-slate-800 border-4 shadow-lg flex flex-col items-center justify-center transform transition-transform hover:scale-105"
                            style={{ borderColor: getNodeColor(node.data.retentionState) }}>

                            {/* Score */}
                            <span className="text-2xl font-black text-slate-700 dark:text-white leading-none">
                                {node.data.masteryPercent}<span className="text-xs align-top opacity-50">%</span>
                            </span>

                            {/* Label */}
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 max-w-[80%] text-center truncate px-1">
                                {node.data.subjectName}
                            </span>

                            {/* State Badge */}
                            <div className="absolute -bottom-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest text-white shadow-sm"
                                style={{ backgroundColor: getNodeColor(node.data.retentionState) }}>
                                {node.data.retentionState}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Legend */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none">
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] font-bold text-slate-400">STABLE</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] font-bold text-slate-400">FADING</span>
                    <div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] font-bold text-slate-400">CRITICAL</span>
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50 animate-pulse"></div>
                </div>
            </div>
        </div>
    );
};
