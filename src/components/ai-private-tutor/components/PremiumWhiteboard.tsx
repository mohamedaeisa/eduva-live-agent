import React, { useRef, useCallback, useState } from 'react';
import { useBoard } from '../context/BoardProvider';
import TeacherOverlay from './TeacherOverlay';
import { BoardEngine } from '../services/boardEngine';
import { Stroke } from '../types';

interface PremiumWhiteboardProps {
    activeTool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser';
    activeColor: string;
    strokes: Stroke[];
    currentStroke: Stroke | null;
    setCurrentStroke: (stroke: Stroke | null) => void;
    addStroke: (stroke: Stroke) => void;
    clearStrokes: () => void;
}

const PremiumWhiteboard: React.FC<PremiumWhiteboardProps> = ({
    activeTool,
    activeColor,
    strokes,
    currentStroke,
    setCurrentStroke,
    addStroke,
    clearStrokes
}) => {
    const { state } = useBoard();
    const canvasRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    const viewport = state.viewport;

    // Fixed board dimensions (responsive)
    const boardWidth = Math.min(window.innerWidth * 0.9, 1200);
    const boardHeight = boardWidth * (9 / 16); // 16:9 aspect ratio

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (activeTool === 'pointer') return;
        e.preventDefault();
        setIsDrawing(true);

        const rect = canvasRef.current!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);

        const newStroke: Stroke = {
            id: crypto.randomUUID(),
            author: 'user',
            tool: activeTool as any,
            path: [worldP],
            color: activeColor,
            width: 3
        };
        setCurrentStroke(newStroke);
    }, [activeTool, viewport, activeColor, setCurrentStroke]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDrawing || !currentStroke) return;

        const rect = canvasRef.current!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);

        const updatedStroke = { ...currentStroke, path: [...currentStroke.path, worldP] };
        setCurrentStroke(updatedStroke);
    }, [isDrawing, currentStroke, viewport, setCurrentStroke]);

    const handleMouseUp = useCallback(() => {
        if (currentStroke) {
            addStroke(currentStroke);
            setCurrentStroke(null);
        }
        setIsDrawing(false);
    }, [currentStroke, addStroke, setCurrentStroke]);

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
            {/* Premium Board Container */}
            <div className="relative">
                {/* 3D Frame with Shadow */}
                <div className="relative rounded-3xl p-8 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-[0_25px_80px_rgba(0,0,0,0.5)]">
                    {/* Decorative Border */}
                    <div className="absolute inset-0 rounded-3xl border-2 border-gradient-to-r from-amber-500/20 via-blue-500/20 to-purple-500/20 pointer-events-none" />

                    {/* Canvas Area */}
                    <div
                        ref={canvasRef}
                        className="relative bg-white rounded-2xl shadow-[inset_0_2px_20px_rgba(0,0,0,0.1)] cursor-crosshair overflow-hidden"
                        style={{
                            width: `${boardWidth}px`,
                            height: `${boardHeight}px`
                        }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        {/* Grid Pattern (subtle) */}
                        <div
                            className="absolute inset-0 pointer-events-none opacity-10"
                            style={{
                                backgroundImage: `
                  linear-gradient(to right, #cbd5e1 1px, transparent 1px),
                  linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)
                `,
                                backgroundSize: '40px 40px'
                            }}
                        />

                        {/* Drawing Overlay */}
                        <div className="absolute inset-0 pointer-events-none">
                            <TeacherOverlay
                                actions={currentStroke ? [...strokes, currentStroke] : strokes}
                                width={boardWidth}
                                height={boardHeight}
                            />
                        </div>

                        {/* Brand Watermark */}
                        <div className="absolute bottom-4 right-4 text-slate-300 text-xs font-mono opacity-30 pointer-events-none">
                            EDUVA Board™
                        </div>
                    </div>

                    {/* Control Panel */}
                    <div className="mt-6 flex items-center justify-between px-4 py-3 bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-white/10">
                        {/* Tool Info */}
                        <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2 px-3 py-2 bg-slate-700/50 rounded-lg">
                                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                    {activeTool === 'freehand' ? '🖊️ Pen' : activeTool === 'circle' ? '⭕ Circle' : activeTool === 'arrow' ? '➡️ Arrow' : '👆 Pointer'}
                                </span>
                            </div>
                            <div
                                className="w-6 h-6 rounded-full border-2 border-white/20 shadow-lg"
                                style={{ backgroundColor: activeColor }}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={clearStrokes}
                                className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                            >
                                🧹 Clear All
                            </button>
                            <div className="text-xs text-slate-400 font-mono">
                                {strokes.length} stroke{strokes.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>

                    {/* Decorative Corner Accents */}
                    <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-amber-500/30 rounded-tl-2xl pointer-events-none" />
                    <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-blue-500/30 rounded-tr-2xl pointer-events-none" />
                    <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-purple-500/30 rounded-bl-2xl pointer-events-none" />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-pink-500/30 rounded-br-2xl pointer-events-none" />
                </div>

                {/* Floating Help Text */}
                <div className="absolute -bottom-12 left-0 right-0 flex justify-center">
                    <div className="px-4 py-2 bg-slate-800/80 backdrop-blur-sm rounded-full border border-white/10 text-xs text-slate-300 font-medium">
                        💡 Use sidebar tools to draw • Everything stays in view • AI sees your drawings
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PremiumWhiteboard;
