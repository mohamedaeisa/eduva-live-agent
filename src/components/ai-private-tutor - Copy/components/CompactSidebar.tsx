import React from 'react';
import { TeacherState } from '../types';

// Icons
const Icons = {

    Screen: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    PDF: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
    Settings: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    Pointer: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
    Pen: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    Circle: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18z" /></svg>,
    Arrow: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
    Eraser: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
};

interface CompactSidebarProps {
    mode: 'screen' | 'pdf';
    setMode: (mode: 'screen' | 'pdf') => void;
    activeTool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser';
    setActiveTool: (tool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser') => void;
    activeColor: string;
    setActiveColor: (color: string) => void;
    screenStream?: MediaStream;
    pdfFile?: File;
    state: TeacherState;
    onToggleScreenShare: () => void;
    onUploadPdf: () => void;
    onOpenSettings: () => void;
    onClearDrawings: () => void;
}

const CompactSidebar: React.FC<CompactSidebarProps> = ({
    mode,
    setMode,
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    screenStream,
    pdfFile,
    state,
    onToggleScreenShare,
    onUploadPdf,
    onOpenSettings,
    onClearDrawings
}) => {
    return (
        <aside className="fixed bottom-0 left-0 right-0 h-16 bg-eduva-800 border-t border-eduva-700 flex flex-row items-center justify-around px-4 z-[500] md:relative md:w-20 md:h-[calc(100vh-2rem)] md:border-r md:border-t-0 md:flex-col md:justify-start md:py-4 md:m-2 md:rounded-2xl md:shadow-xl shrink-0 select-none">
            {/* Input Source Tools - Row on Mobile, Col on Desktop */}
            <div className="flex flex-row md:flex-col space-x-2 md:space-x-0 md:space-y-2 items-center">
                {/* Desktop Separator */}
                <div className="hidden md:block w-full h-px bg-eduva-700 mx-auto opacity-50 mb-2" />


                <button
                    onClick={() => { if (state === TeacherState.IDLE) setMode('screen'); else onToggleScreenShare(); }}
                    title={screenStream ? "Stop Sharing" : "Screen Share"}
                    className={`w-16 h-14 mx-auto rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-200 group relative ${((mode === 'screen' && state === TeacherState.IDLE) || screenStream)
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                        : 'bg-eduva-700/30 text-slate-400 hover:bg-eduva-700 hover:text-slate-200'
                        }`}
                >
                    <Icons.Screen />
                    <span className="text-[9px] font-medium leading-none">Share</span>
                </button>

                <button
                    onClick={onUploadPdf}
                    title={pdfFile ? pdfFile.name : "Upload PDF"}
                    className={`w-16 h-14 mx-auto rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-200 group relative ${mode === 'pdf'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                        : 'bg-eduva-700/30 text-slate-400 hover:bg-eduva-700 hover:text-slate-200'
                        }`}
                >
                    <Icons.PDF />
                    <span className="text-[9px] font-medium leading-none">Upload</span>
                </button>
            </div >

            {/* Drawing Tools - Row on Mobile, Col on Desktop */}
            < div className="flex flex-row md:flex-col items-center space-x-2 md:space-x-0 md:space-y-2 min-h-0 md:flex-1 md:w-full md:px-2" >
                <div className="hidden md:block w-full h-px bg-eduva-700 mx-auto mb-1 opacity-50" />
                <span className="hidden md:block text-[10px] font-bold text-slate-500 uppercase tracking-wider scale-90">Tools</span>

                {
                    [
                        { id: 'pointer', icon: Icons.Pointer, label: 'Pointer' },
                        { id: 'freehand', icon: Icons.Pen, label: 'Pen' },
                        { id: 'circle', icon: Icons.Circle, label: 'Shape' },
                        { id: 'arrow', icon: Icons.Arrow, label: 'Arrow' },
                    ].map((tool) => (
                        <button
                            key={tool.id}
                            onClick={() => setActiveTool(tool.id as any)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative ${activeTool === tool.id
                                ? 'bg-eduva-600 text-white shadow-md ring-1 ring-blue-500/50'
                                : 'text-slate-400 hover:bg-eduva-700/50 hover:text-slate-200'
                                }`}
                        >
                            <tool.icon />
                            <div className="absolute left-12 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                {tool.label}
                            </div>
                        </button>
                    ))
                }

                <button
                    onClick={() => {
                        if (window.confirm("Clear all drawings?")) onClearDrawings();
                    }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all duration-200 group relative"
                >
                    <Icons.Eraser />
                    <div className="absolute left-12 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Clear All
                    </div>
                </button>

                {/* Color Picker - Horizontal to save vertical space */}
                <div className="flex items-center justify-center space-x-2 mt-2 pt-2 border-t border-eduva-700/50 w-full">
                    {[
                        { color: '#ef4444', label: 'Red' },
                        { color: '#3b82f6', label: 'Blue' },
                        { color: '#22c55e', label: 'Green' }
                    ].map((c) => (
                        <button
                            key={c.color}
                            onClick={() => setActiveColor(c.color)}
                            className={`w-4 h-4 rounded-full transition-all duration-200 group relative ${activeColor === c.color
                                ? 'ring-2 ring-white scale-125 shadow-lg'
                                : 'hover:scale-125 opacity-70 hover:opacity-100'
                                }`}
                            style={{ backgroundColor: c.color }}
                        >
                            <div className="absolute left-8 bottom-4 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                {c.label}
                            </div>
                        </button>
                    ))}
                </div>
            </div >

            {/* Footer Controls */}
            < div className="mt-auto flex flex-col items-center space-y-3 w-full pb-2" >
                {/* Status Indicator */}
                < div className="group relative" >
                    <div className={`w-3 h-3 rounded-full shadow-lg ${state === TeacherState.IDLE ? 'bg-slate-600' : 'bg-green-500 animate-pulse'}`}></div>
                    <div className="absolute left-8 bottom-0 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        Status: {state}
                    </div>
                </div >

                <button
                    onClick={onOpenSettings}
                    className="p-2 rounded-xl text-slate-400 hover:bg-eduva-700 hover:text-slate-200 transition-colors group relative"
                >
                    <Icons.Settings />
                    <div className="absolute left-14 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Settings
                    </div>
                </button>
            </div >

        </aside >
    );
};

export default CompactSidebar;
