import React from 'react';
import { TeacherState, BoardSource } from '../types';

// Icons
const Icons = {
    Screen: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    PDF: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
    Settings: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M10 3a1 1 0 011-1h2a1 1 0 011 1v1h4a1 1 0 110 2H6a1 1 0 110-2h4V3z" /></svg>,
    Whiteboard: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7h4M10 11h4M10 15h4" /></svg>,
    Grid: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
};

interface CompactSidebarProps {
    mode: BoardSource;
    setMode: (mode: BoardSource) => void;
    screenStream?: MediaStream;
    pdfFile?: File;
    state: TeacherState;
    onToggleScreenShare: () => void;
    onUploadPdf: () => void;
    onClearPdf: () => void;
    onBoard: () => void;
    onOpenSettings: () => void;
    visionState?: string;
}

const CompactSidebar: React.FC<CompactSidebarProps> = ({
    mode,
    setMode,
    screenStream,
    pdfFile,
    state,
    onToggleScreenShare,
    onUploadPdf,
    onClearPdf,
    onBoard,
    // 🎯 Phase 38: Removed onWhiteboard, onEnhancedBoard
    onOpenSettings,
    visionState = 'SESSION_CLOSED'
}) => {
    // 📊 Derived Status for UI
    const isVisual = visionState === 'VISUAL_MODE';
    const isClosed = visionState === 'SESSION_CLOSED';
    const statusLabel = visionState === 'VISUAL_MODE' ? 'VISUAL MODE' : visionState === 'CONVERSATION_MODE' ? 'ACTIVE' : 'SESSION CLOSED';
    const statusColor = isVisual ? 'bg-green-500' : isClosed ? 'bg-slate-600' : 'bg-blue-500';

    return (
        <aside className="w-full h-16 bg-white dark:bg-eduva-800 border-t border-slate-200 dark:border-eduva-700 flex flex-row items-center justify-around px-4 z-[500] shrink-0 md:relative md:w-20 md:h-[calc(100vh-2rem)] md:border-r md:border-t-0 md:flex-col md:justify-start md:py-4 md:m-2 md:rounded-2xl md:shadow-xl md:select-none">
            {/* Input Source Tools - Row on Mobile, Col on Desktop */}
            <div className="flex flex-row md:flex-col space-x-2 md:space-x-0 md:space-y-2 items-center">
                {/* Desktop Separator */}
                <div className="hidden md:block w-full h-px bg-slate-200 dark:bg-eduva-700 mx-auto opacity-50 mb-2" />


                <button
                    onClick={onToggleScreenShare}
                    title={screenStream ? "Stop Sharing" : "Screen Share"}
                    className={`w-16 h-14 mx-auto rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-200 group relative ${((mode === 'screen' && state === TeacherState.IDLE) || screenStream)
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                        : 'bg-slate-100 dark:bg-eduva-700/30 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-eduva-700 hover:text-slate-700 dark:hover:text-slate-200'
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
                        : 'bg-slate-100 dark:bg-eduva-700/30 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-eduva-700 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                >
                    <Icons.PDF />
                    <span className="text-[9px] font-medium leading-none">Upload</span>
                </button>

                {/* Clear PDF Button (shown when PDF is loaded) */}
                {mode === 'pdf' && pdfFile && (
                    <button
                        onClick={onClearPdf}
                        title="Clear PDF"
                        className="w-16 h-14 mx-auto rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-200 bg-red-600/80 text-white hover:bg-red-500 shadow-lg"
                    >
                        <Icons.Trash />
                        <span className="text-[9px] font-medium leading-none">Clear</span>
                    </button>
                )}

                {/* 🎯 Phase 38: Board Button - return to board from PDF/screen */}
                <button
                    onClick={onBoard}
                    title="Return to Board"
                    className={`w-16 h-14 mx-auto rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-200 group relative ${mode === 'board'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                        : 'bg-slate-100 dark:bg-eduva-700/30 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-eduva-700 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                >
                    <Icons.Whiteboard />
                    <span className="text-[9px] font-medium leading-none">Board</span>
                </button>
            </div >

            {/* Footer Controls - Lifted Up */}
            <div className="mt-auto md:mb-[35vh] flex flex-col items-center space-y-3 w-full pb-2 transition-all duration-300">
                {/* Status Indicator & Label */}
                <div className="flex flex-col items-center gap-1.5 mb-2 opacity-90 hover:opacity-100 transition-opacity">
                    <div className="group relative">
                        <div className={`w-3.5 h-3.5 rounded-full shadow-md border border-white/20 ${statusColor} ${!isClosed && 'animate-pulse'}`}></div>
                        <div className="absolute left-10 bottom-0 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700 font-bold tracking-wide">
                            Status: {visionState}
                        </div>
                    </div>

                    {/* Compact Label for Toolbar */}
                    <div className={`text-[9px] font-black uppercase tracking-wider text-center leading-tight select-none ${isClosed ? 'text-slate-400 dark:text-slate-300' : 'text-slate-700 dark:text-white'}`}>
                        {statusLabel.split(' ').map((word, i) => (
                            <div key={i} className="py-0.5">{word}</div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onOpenSettings}
                    className="p-3 rounded-xl text-slate-300 hover:bg-eduva-700 hover:text-white transition-all group relative active:scale-95 border border-transparent hover:border-slate-600"
                >
                    <Icons.Settings />
                    <div className="absolute left-16 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-slate-700 font-bold tracking-wide">
                        Settings
                    </div>
                </button>
            </div>

        </aside >
    );
};

export default CompactSidebar;
