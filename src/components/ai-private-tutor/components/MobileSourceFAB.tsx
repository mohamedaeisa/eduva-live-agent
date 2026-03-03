import React, { useState, useEffect } from 'react';

// Icons
const Icons = {
    Camera: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
    Board: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7h4M10 11h4M10 15h4" /></svg>,
    Plus: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
};

interface MobileSourceFABProps {
    onCameraCapture: () => void;
    onUploadPDF: () => void;
    onReturnToBoard: () => void;
    sessionActive?: boolean; // Phase 4: For close triggers
}

export default function MobileSourceFAB({
    onCameraCapture,
    onUploadPDF,
    onReturnToBoard,
    sessionActive
}: MobileSourceFABProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFirstRender, setIsFirstRender] = useState(true);

    // Pulse animation on first mount to help discovery
    useEffect(() => {
        const timer = setTimeout(() => setIsFirstRender(false), 3000);
        return () => clearTimeout(timer);
    }, []);

    // Phase 4: Close on session stop
    useEffect(() => {
        if (!sessionActive) {
            setIsExpanded(false);
        }
    }, [sessionActive]);

    const actions = [
        {
            icon: Icons.Camera,
            label: 'Take Photo',
            onClick: () => {
                console.log('[MOBILE_FAB] "Take Photo" action clicked');
                onCameraCapture();
            },
            color: 'bg-blue-500'
        },
        {
            icon: Icons.Upload,
            label: 'Upload PDF',
            onClick: () => {
                console.log('[MOBILE_FAB] "Upload PDF" action clicked');
                onUploadPDF();
            },
            color: 'bg-green-500'
        },
        {
            icon: Icons.Board,
            label: 'Board',
            onClick: () => {
                console.log('[MOBILE_FAB] "Board" action clicked');
                onReturnToBoard();
            },
            color: 'bg-purple-500'
        },
    ];

    return (
        <>
            {/* FAB Button - Top Left, Safe from iOS back swipe */}
            {/* 🎯 FIX: Increased size (w-14 h-14), moved lower (top-20), changed to Blue for visibility */}
            <button
                onClick={() => {
                    console.log('[MOBILE_FAB] Main FAB toggle clicked', !isExpanded);
                    setIsExpanded(!isExpanded);
                }}
                className={`fixed top-32 left-4 md:hidden z-[100] w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-500/40 transition-all duration-150 active:scale-95 flex items-center justify-center border-2 border-white/20 ${isFirstRender ? 'animate-pulse' : ''}`}
                aria-label="Source Options"
            >
                <Icons.Plus />
            </button>

            {/* Expanded Panel - Slides from top-left */}
            {/* 🎯 FIX: Adjusted top position to match new FAB location (top-32 + 16 = 48) */}
            {isExpanded && (
                <div className="fixed top-48 left-4 md:hidden z-[99] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-150">
                    <div className="flex flex-col min-w-[180px]">
                        {actions.map((action, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    action.onClick();
                                    setIsExpanded(false);
                                }}
                                className="flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors duration-150 border-b border-slate-100 last:border-b-0 group"
                            >
                                <div className={`w-10 h-10 rounded-full ${action.color} text-white flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm`}>
                                    <action.icon />
                                </div>
                                <span className="font-bold text-slate-700 text-sm">
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Backdrop */}
            {isExpanded && (
                <div
                    onClick={() => {
                        console.log('[MOBILE_FAB] Backdrop clicked - closing menu');
                        setIsExpanded(false);
                    }}
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[98] animate-in fade-in duration-150 md:hidden"
                />
            )}
        </>
    );
}
