import React, { useState, useEffect } from 'react';

// Icons with refined stroke widths and cleaner paths
const Icons = {
    Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" /></svg>,
    Close: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
    Pointer: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>,
    Pen: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,

    Circle: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /></svg>,
    Arrow: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
    Eraser: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9 9 9-9M3 10l4-4 5 5m5-5l4 4-9 9" />
            <rect x="8" y="12" width="6" height="3" rx="1" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    Text: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v14m-5 0h10" /></svg>,
    Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    Note: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
};

interface FloatingMoreFABProps {
    onToolSelect: (tool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky') => void;
    onOpenNotes: () => void;
    activeTool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky';
    sessionActive?: boolean;
    stageSplit?: number;
    activeColor?: string;
    onColorSelect?: (color: string) => void;
    activeWidth?: number;
    onWidthSelect?: (width: number) => void;
    onClearDrawings?: () => void;
}

export default function FloatingMoreFAB({
    onToolSelect,
    onOpenNotes,
    activeTool,
    sessionActive,
    stageSplit,
    activeColor = '#ef4444',
    onColorSelect,
    activeWidth = 3,
    onWidthSelect,
    onClearDrawings
}: FloatingMoreFABProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (!sessionActive || stageSplit === 100) {
            setIsExpanded(false);
        }
    }, [sessionActive, stageSplit]);

    const drawingTools = [
        { id: 'pointer', icon: Icons.Pointer, label: 'Select', tool: 'pointer' as const },
        { id: 'freehand', icon: Icons.Pen, label: 'Pen', tool: 'freehand' as const },

        { id: 'text', icon: Icons.Text, label: 'Text', tool: 'text' as const },
        { id: 'circle', icon: Icons.Circle, label: 'Circle', tool: 'circle' as const },
        { id: 'arrow', icon: Icons.Arrow, label: 'Arrow', tool: 'arrow' as const },
        { id: 'eraser', icon: Icons.Eraser, label: 'Eraser', tool: 'eraser' as const },
    ];

    const colors = [
        { hex: '#ef4444', name: 'Red' },     // Red 500
        { hex: '#f97316', name: 'Orange' },  // Orange 500
        { hex: '#eab308', name: 'Yellow' },  // Yellow 500
        { hex: '#ccff00', name: 'Lime' },    // Custom Lemon Green
        { hex: '#22c55e', name: 'Green' },   // Green 500
        { hex: '#3b82f6', name: 'Blue' },    // Blue 500
        { hex: '#8b5cf6', name: 'Purple' },  // Purple 500
        { hex: '#ec4899', name: 'Pink' },    // Pink 500
        { hex: '#000000', name: 'Black' },   // Black
    ];

    return (
        <>
            {/* FAB Button - Premium Animated */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`fixed bottom-[88px] right-[20px] z-[100] w-14 h-14 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center active:scale-90 ${isExpanded ? 'bg-white text-blue-600 scale-110' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30'}`}
                aria-label="Drawing Tools"
            >
                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}>
                    {isExpanded ? <Icons.Close /> : <Icons.Menu />}
                </div>
            </button>

            {/* Premium Menu Panel */}
            {isExpanded && (
                <div className="fixed bottom-[158px] right-[20px] z-[99] w-[calc(100vw-40px)] max-w-[340px] animate-in fade-in slide-in-from-bottom-6 zoom-in-95 duration-300 ease-out-expo">
                    <div className="bg-white/90 backdrop-blur-2xl border border-white/50 rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden">
                        <div className="p-4 md:p-5">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4 px-1">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Drawing Studio</h3>
                                <button
                                    onClick={() => onClearDrawings?.()}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-500 text-[9px] font-bold hover:bg-red-100 transition-colors uppercase tracking-wider"
                                >
                                    <Icons.Trash />
                                    Clear
                                </button>
                            </div>

                            {/* Tools Grid */}
                            <div className="grid grid-cols-4 gap-2.5 mb-6">
                                {drawingTools.map((item, index) => {
                                    const isActive = activeTool === item.tool;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => onToolSelect(item.tool)}
                                            className="flex flex-col items-center gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300"
                                            style={{ animationDelay: `${index * 40}ms` }}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-blue-600 text-white shadow-[0_12px_24px_-8px_rgba(37,99,235,0.6)] scale-110' : 'bg-slate-50 text-slate-500 group-hover:bg-slate-100 group-active:scale-95'}`}>
                                                <item.icon />
                                            </div>
                                            <span className={`text-[10px] font-bold transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{item.label}</span>
                                        </button>
                                    );
                                })}

                                {/* Width Quick Switch (only if tool needs it) */}
                                {activeTool === 'freehand' && (
                                    <button
                                        onClick={() => onWidthSelect?.(activeWidth === 4 ? 8 : activeWidth === 8 ? 2 : 4)}
                                        className="flex flex-col items-center gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300 animation-delay-300"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center group-active:scale-95 transition-all">
                                            <div
                                                className="rounded-full bg-slate-400 transition-all duration-300"
                                                style={{ width: activeWidth * 2.5, height: activeWidth * 2.5 }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">Size</span>
                                    </button>
                                )}
                            </div>

                            {/* Colors Section */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3 px-1">
                                    <div className="h-px flex-1 bg-slate-100" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-300">Palette</span>
                                    <div className="h-px flex-1 bg-slate-100" />
                                </div>
                                <div className="flex flex-wrap justify-center gap-2.5">
                                    {colors.map((color, index) => {
                                        const isActive = activeColor === color.hex;
                                        return (
                                            <button
                                                key={color.hex}
                                                onClick={() => onColorSelect?.(color.hex)}
                                                className="p-0.5 rounded-full transition-all duration-300 animate-in fade-in zoom-in duration-300 hover:scale-125"
                                                style={{ animationDelay: `${index * 30}ms` }}
                                            >
                                                <div
                                                    className={`w-6 h-6 rounded-full shadow-inner-lg transition-all duration-300 ${isActive ? 'ring-2 ring-blue-500 ring-offset-2 scale-110 shadow-lg' : ''}`}
                                                    style={{ backgroundColor: color.hex }}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Separator */}
                            <div className="h-px bg-slate-100/50 mb-4" />

                            {/* Private Teacher Notes Button - Ultra Premium */}
                            <button
                                onClick={() => {
                                    onOpenNotes();
                                    setIsExpanded(false);
                                }}
                                className="w-full relative group overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[1.5rem]" />
                                <div className="relative flex items-center gap-3 p-1 rounded-[1.25rem] bg-blue-50/50 transition-all duration-300 group-hover:translate-x-1">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-500">
                                        <Icons.Note />
                                    </div>
                                    <div className="flex-1 text-left py-1.5">
                                        <div className="text-[11px] font-black text-slate-800 group-hover:text-blue-900 transition-colors uppercase tracking-tight">Study Notes</div>
                                        <div className="text-[9px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">Access your learning insights</div>
                                    </div>
                                    <div className="mr-3 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sophisticated Backdrop Overlay */}
            {isExpanded && (
                <div
                    onClick={() => setIsExpanded(false)}
                    className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[98] animate-in fade-in duration-500"
                />
            )}
        </>
    );
}
