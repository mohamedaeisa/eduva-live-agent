import React, { useState } from 'react';

// Drawing Tools Icons
const Icons = {
    Pointer: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
    Pen: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,

    Circle: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /></svg>,
    Arrow: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
    Eraser: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6" /><rect x="3" y="14" width="7" height="7" rx="1" transform="rotate(-45 3 14)" strokeWidth={2} /></svg>,
    Close: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
};

interface MobileDrawingPanelProps {
    activeTool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky';
    setActiveTool: (tool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky') => void;
    activeColor: string;
    setActiveColor: (color: string) => void;
    onClearDrawings: () => void;
    onClose: () => void;
}

export default function MobileDrawingPanel({
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    onClearDrawings,
    onClose
}: MobileDrawingPanelProps) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'];

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[98] animate-in fade-in duration-150" />

            {/* Drawing Panel */}
            <div className="fixed bottom-20 right-4 z-[99] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 animate-in slide-in-from-bottom-4 fade-in duration-150">
                <div className="flex flex-col gap-2">
                    {/* Tools Row */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => setActiveTool('pointer')} className={`p-2.5 rounded-lg transition-colors ${activeTool === 'pointer' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            <Icons.Pointer />
                        </button>
                        <button onClick={() => setActiveTool('freehand')} className={`p-2.5 rounded-lg transition-colors ${activeTool === 'freehand' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            <Icons.Pen />
                        </button>

                        <button onClick={() => setActiveTool('circle')} className={`p-2.5 rounded-lg transition-colors ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            <Icons.Circle />
                        </button>
                        <button onClick={() => setActiveTool('arrow')} className={`p-2.5 rounded-lg transition-colors ${activeTool === 'arrow' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            <Icons.Arrow />
                        </button>
                        <button onClick={() => setActiveTool('eraser')} className={`p-2.5 rounded-lg transition-colors ${activeTool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            <Icons.Eraser />
                        </button>
                    </div>

                    {/* Color + Clear Row */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <button onClick={() => setShowColorPicker(!showColorPicker)} className="w-full h-10 rounded-lg border-2 border-slate-300 flex items-center gap-2 px-3">
                                <div className="w-5 h-5 rounded-full border border-slate-300" style={{ backgroundColor: activeColor }} />
                                <span className="text-sm font-medium text-slate-700">Color</span>
                            </button>

                            {showColorPicker && (
                                <div className="absolute bottom-12 left-0 bg-white rounded-lg shadow-xl border border-slate-200 p-2 flex gap-1.5">
                                    {colors.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => {
                                                setActiveColor(color);
                                                setShowColorPicker(false);
                                            }}
                                            className={`w-8 h-8 rounded-full border-2 transition-all ${activeColor === color ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={onClearDrawings} className="p-2.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
                            <Icons.Close />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
