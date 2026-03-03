import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeacherState } from '../types';
import AudioVisualizer from './AudioVisualizer';
import { useMediaQuery } from '../../../hooks/useMediaQuery';

// Icons
const Icons = {
    Mic: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
    MicOff: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
    Stop: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
    Clock: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,

    // Desktop drawing tools icons
    Pointer: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
    Pen: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    Text: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v14m-5 0h10" /></svg>,
    Circle: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /></svg>,
    Arrow: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
    Eraser: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9 9 9-9M3 10l4-4 5 5m5-5l4 4-9 9" />
            <rect x="8" y="12" width="6" height="3" rx="1" fill="currentColor" opacity="0.3" />
        </svg>
    ),
    Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    WalkieTalkie: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
    ),
};

interface BottomToolbarProps {
    // Mobile props (simplified)
    isMuted: boolean;
    onToggleMute: () => void;
    sessionActive: boolean;
    onStopSession: () => void;
    serviceRef: React.RefObject<any>;
    state: TeacherState;
    position?: 'top' | 'bottom'; // 🆕 Phase 50
    onToggleNotes?: () => void; // 🆕 Phase 50
    notesActive?: boolean; // 🆕 Phase 50

    // Desktop props (full drawing tools)
    activeTool?: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky';
    setActiveTool?: (tool: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky') => void;
    activeColor?: string;
    setActiveColor?: (color: string) => void;
    onClearDrawings?: () => void;
}

export default function BottomToolbar({
    isMuted,
    onToggleMute,
    sessionActive,
    onStopSession,
    serviceRef,
    state,
    position = 'bottom',
    onToggleNotes,
    notesActive,
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    onClearDrawings
}: BottomToolbarProps) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [sessionDuration, setSessionDuration] = useState(0);
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'];
    const [showColorPicker, setShowColorPicker] = useState(false);

    const [noiseThreshold, setNoiseThreshold] = useState(0.1);
    const [showNoiseSettings, setShowNoiseSettings] = useState(false);
    const [useAdaptive, setUseAdaptive] = useState(true);
    const [fixedThreshold, setFixedThreshold] = useState(0.1);
    const noiseRafRef = useRef<number | null>(null);

    // 🎙️ Two-Mode Voice Input
    // Option 1 (default): Adaptive VAD + audio visualizer  
    // Option 2 (toggle):  Walkie-Talkie / PTT — hold button to speak
    const [isWalkieTalkie, setIsWalkieTalkie] = useState(false);
    const [isPttActive, setIsPttActive] = useState(false);

    // 🔑 Fix: Track isWalkieTalkie in a ref so PTT press/release callbacks
    // always see the CURRENT value, avoiding stale closure issues.
    const isWalkieTalkieRef = useRef(false);

    const toggleWalkieTalkie = useCallback(() => {
        const newState = !isWalkieTalkieRef.current;
        isWalkieTalkieRef.current = newState;
        setIsWalkieTalkie(newState);
        serviceRef.current?.setWalkieTalkieMode(newState);
        console.log(`[UI][PTT] Walkie-Talkie toggled ${newState ? 'ON' : 'OFF'}`);
        // If turning off while button was held, clean up
        if (!newState && isPttActive) {
            setIsPttActive(false);
            serviceRef.current?.setPttActive(false);
        }
    }, [serviceRef, isPttActive]);

    const handlePttPress = useCallback(() => {
        // Use ref so this always reads the live value, never the stale closure
        if (!isWalkieTalkieRef.current) return;
        if (isPttActive) return; // debounce
        setIsPttActive(true);
        serviceRef.current?.setPttActive(true);
        console.log('[UI][PTT] PRESSED');
    }, [isPttActive, serviceRef]);

    const handlePttRelease = useCallback(() => {
        // Use ref so this always reads the live value, never the stale closure
        if (!isWalkieTalkieRef.current) return;
        if (!isPttActive) return; // debounce
        setIsPttActive(false);
        serviceRef.current?.setPttActive(false);
        console.log('[UI][PTT] RELEASED');
    }, [isPttActive, serviceRef]);

    // Keyboard PTT (Spacebar) — only active when walkie-talkie mode is on
    useEffect(() => {
        if (!sessionActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
            if (e.code === 'Space' && !e.repeat && !isTyping) {
                if (!isWalkieTalkieRef.current) return;
                e.preventDefault();
                handlePttPress();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
            if (e.code === 'Space' && !isTyping) {
                if (!isWalkieTalkieRef.current) return;
                e.preventDefault();
                handlePttRelease();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [sessionActive, handlePttPress, handlePttRelease]);

    // Clean up PTT state when session ends
    useEffect(() => {
        if (!sessionActive) {
            isWalkieTalkieRef.current = false;
            setIsWalkieTalkie(false);
            setIsPttActive(false);
        }
    }, [sessionActive]);

    const pollNoise = useCallback(() => {
        if (serviceRef.current?.noiseThreshold != null) {
            setNoiseThreshold(serviceRef.current.noiseThreshold);
        }
        noiseRafRef.current = requestAnimationFrame(pollNoise);
    }, [serviceRef]);

    useEffect(() => {
        if (sessionActive) {
            noiseRafRef.current = requestAnimationFrame(pollNoise);
        } else {
            if (noiseRafRef.current) cancelAnimationFrame(noiseRafRef.current);
        }
        return () => { if (noiseRafRef.current) cancelAnimationFrame(noiseRafRef.current); };
    }, [sessionActive, pollNoise]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (sessionActive) {
            setSessionDuration(0);
            const startTime = Date.now();
            interval = setInterval(() => {
                setSessionDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } else {
            setSessionDuration(0);
        }
        return () => clearInterval(interval);
    }, [sessionActive]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Mobile: Simplified single-row toolbar (relative positioning, not fixed)
    if (isMobile) {
        const isTop = position === 'top';
        return (
            <div className={`w-full h-16 bg-white ${isTop ? 'border-b' : 'border-t'} border-slate-200 flex items-center justify-between px-4 z-40 shadow-md transition-all duration-300`}>
                {/* Left: Mute & Walkie-Talkie (Mobile) */}
                <div className="flex items-center gap-2">
                    <button onClick={onToggleMute} className={`p-2.5 rounded-full transition-colors ${isMuted ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'}`} title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? <Icons.MicOff /> : <Icons.Mic />}
                    </button>

                    {sessionActive && (
                        <button
                            onClick={toggleWalkieTalkie}
                            className={`p-2.5 rounded-full transition-all ${isWalkieTalkie ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-slate-600'}`}
                            title={isWalkieTalkie ? 'Switch to Adaptive VAD' : 'Switch to PTT mode'}
                        >
                            <Icons.WalkieTalkie />
                        </button>
                    )}

                    {/* 🆕 Phase 50: Notes Toggle (Mobile Top Bar Only) */}
                    {isTop && (
                        <button
                            onClick={onToggleNotes}
                            className={`p-2.5 rounded-full transition-all ${notesActive ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600'}`}
                            title="Toggle Notes"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Center: Audio Waveform (adaptive) or PTT Button (walkie-talkie) */}
                <div className="flex-1 max-w-md mx-3 h-11 relative flex items-center justify-center bg-slate-50/80 rounded-xl overflow-hidden border border-slate-100">
                    {sessionActive && serviceRef.current ? (
                        isWalkieTalkie ? (
                            <button
                                onMouseDown={handlePttPress}
                                onMouseUp={handlePttRelease}
                                onMouseLeave={handlePttRelease}
                                onTouchStart={(e) => { e.preventDefault(); handlePttPress(); }}
                                onTouchEnd={(e) => { e.preventDefault(); handlePttRelease(); }}
                                className={`w-full h-full flex items-center gap-2 justify-center font-bold text-xs tracking-wide transition-all select-none
                                    ${isPttActive
                                        ? 'bg-orange-500 text-white shadow-inner'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}
                                `}
                            >
                                {isPttActive ? (
                                    <>
                                        {/* Animated mic dot */}
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                                        </span>
                                        <span>LISTENING…</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-emerald-500">🎙️</span>
                                        <span>HOLD TO SPEAK · SPACE</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <>
                                <div className="absolute inset-0 z-10 opacity-60 pointer-events-none mix-blend-multiply">
                                    <AudioVisualizer isActive={true} analyser={serviceRef.current.inputAnalyserNode} variant="mic" barColor="#3b82f6" noiseThreshold={noiseThreshold} />
                                </div>
                                <div className="absolute inset-0 z-0 opacity-80">
                                    <AudioVisualizer isActive={true} analyser={serviceRef.current.outputAnalyserNode} variant="ai" barColor="#ef4444" />
                                </div>
                            </>
                        )
                    ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audio Idle</span>
                    )}
                </div>

                {/* Right: Stop + Timer */}
                <div className="flex items-center gap-2">
                    {sessionActive && (
                        <div className="flex items-center gap-1.5 bg-slate-50 rounded-full px-2.5 py-1.5 border border-slate-100">
                            <Icons.Clock />
                            <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">{formatTime(sessionDuration)}</span>
                        </div>
                    )}
                    {sessionActive ? (
                        <button onClick={onStopSession} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2.5 transition-all shadow-md shadow-red-500/20 active:scale-95">
                            <Icons.Stop />
                            <span className="text-xs font-bold">Stop</span>
                        </button>
                    ) : (
                        <div className="w-10" /> // Spacer
                    )}
                </div>
            </div>
        );
    }

    // Desktop: Ultra-Compact Unified Toolbar
    return (
        <div className={`w-full bg-white rounded-full shadow-lg border border-slate-200 px-4 py-2 flex items-center justify-between gap-4 transition-all duration-300 ${!sessionActive ? 'opacity-60 pointer-events-none grayscale' : ''}`}>

            {/* Left Group: Drawing Tools - Compacted Gap */}
            <div className="flex items-center gap-0.5">
                <button onClick={() => setActiveTool?.('pointer')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'pointer' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Pointer"><Icons.Pointer /></button>
                <button onClick={() => setActiveTool?.('freehand')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'freehand' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Pen"><Icons.Pen /></button>
                <button onClick={() => setActiveTool?.('circle')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Circle"><Icons.Circle /></button>
                <button onClick={() => setActiveTool?.('arrow')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'arrow' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Arrow"><Icons.Arrow /></button>
                <div className="w-px h-5 bg-slate-200 mx-0.5" />
                <button onClick={() => setActiveTool?.('eraser')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Eraser"><Icons.Eraser /></button>
                <button onClick={() => setActiveTool?.('text')} className={`p-1.5 rounded-full transition-colors ${activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="Text"><Icons.Text /></button>
                <button onClick={onClearDrawings} className="p-1.5 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors" title="Clear All"><Icons.Trash /></button>

                {/* Color Picker Compact */}
                <div className="relative ml-1">
                    <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm"
                        style={{ backgroundColor: activeColor }}
                    >
                        <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 border border-slate-100 shadow-sm">
                            <svg className="w-2 h-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </button>

                    {showColorPicker && (
                        <div className="absolute bottom-10 left-0 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex gap-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    onClick={() => { setActiveColor?.(color); setShowColorPicker(false); }}
                                    className={`w-6 h-6 rounded-full border transition-all ${activeColor === color ? 'border-blue-500 scale-110' : 'border-slate-200 hover:scale-110'}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Center Group: Audio Visualizer / PTT & Mute & Walkie-Talkie Toggle */}
            <div className="flex-1 flex items-center justify-center gap-2 px-2 border-l border-r border-slate-100 min-w-0">
                <button onClick={onToggleMute} className={`p-2 rounded-full transition-all ${isMuted ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`} title={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? <Icons.MicOff /> : <Icons.Mic />}
                </button>

                {/* Walkie-Talkie toggle — switches between Adaptive VAD and PTT */}
                {sessionActive && (
                    <button
                        onClick={toggleWalkieTalkie}
                        className={`p-2 rounded-full transition-all flex-shrink-0 ${isWalkieTalkie ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                        title={isWalkieTalkie ? 'PTT mode ON — click to switch back to adaptive VAD' : 'Click to enable PTT mode'}
                    >
                        <Icons.WalkieTalkie />
                    </button>
                )}

                {/* Center audio area: visualizer (adaptive) or HOLD TO SPEAK (PTT) */}
                <div className="flex-1 max-w-[1000px] h-8 bg-slate-50/50 rounded-full overflow-hidden relative border border-slate-100 shadow-inner">
                    {sessionActive && serviceRef.current ? (
                        isWalkieTalkie ? (
                            <button
                                onMouseDown={handlePttPress}
                                onMouseUp={handlePttRelease}
                                onMouseLeave={handlePttRelease}
                                onTouchStart={(e) => { e.preventDefault(); handlePttPress(); }}
                                onTouchEnd={(e) => { e.preventDefault(); handlePttRelease(); }}
                                className={`w-full h-full flex items-center gap-2 justify-center font-bold text-[10px] tracking-widest transition-all select-none
                                    ${isPttActive
                                        ? 'bg-orange-500 text-white shadow-inner scale-[0.98]'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}
                                `}
                            >
                                {isPttActive ? (
                                    <>
                                        {/* Pulsing indicator while transmitting */}
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                        </span>
                                        TRANSMITTING…
                                    </>
                                ) : (
                                    <>🎙️&nbsp; HOLD TO SPEAK · SPACE</>
                                )}
                            </button>
                        ) : (
                            <>
                                <div className="absolute inset-0 z-10 opacity-70 pointer-events-none mix-blend-multiply">
                                    <AudioVisualizer isActive={true} analyser={serviceRef.current.inputAnalyserNode} variant="mic" barColor="#3b82f6" noiseThreshold={noiseThreshold} />
                                </div>
                                <div className="absolute inset-0 z-0 opacity-90">
                                    <AudioVisualizer isActive={true} analyser={serviceRef.current.outputAnalyserNode} variant="ai" barColor="#ef4444" />
                                </div>
                            </>
                        )
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-medium text-slate-400 tracking-wide uppercase">Audio Idle</div>
                    )}
                </div>
            </div>

            {/* Right Group: Timer & Stop */}
            <div className="flex items-center gap-2">
                {/* 🔊 Noise Settings Gear — only shown in adaptive mode */}
                {sessionActive && !isWalkieTalkie && (
                    <div className="relative">
                        <button
                            onClick={() => setShowNoiseSettings(v => !v)}
                            title="Noise threshold settings"
                            className={`p-1.5 rounded-full transition-colors ${showNoiseSettings ? 'bg-orange-100 text-orange-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        {showNoiseSettings && (
                            <div className="absolute bottom-9 right-0 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 min-w-[200px]">
                                <p className="text-xs font-bold text-slate-700 mb-2">🔊 Noise Gate</p>
                                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useAdaptive}
                                        onChange={e => {
                                            setUseAdaptive(e.target.checked);
                                            serviceRef.current?.setAdaptiveMode(e.target.checked);
                                        }}
                                        className="accent-orange-500"
                                    />
                                    <span className="text-xs text-slate-600">Adaptive mode</span>
                                </label>
                                {!useAdaptive && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-slate-500">
                                            <span>Threshold</span>
                                            <span className="font-mono font-bold text-orange-600">{fixedThreshold.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0.01} max={0.5} step={0.01}
                                            value={fixedThreshold}
                                            onChange={e => {
                                                const v = parseFloat(e.target.value);
                                                setFixedThreshold(v);
                                                serviceRef.current?.setFixedNoiseThreshold(v);
                                            }}
                                            className="w-full accent-orange-500"
                                        />
                                    </div>
                                )}
                                <p className="text-[9px] text-slate-400 mt-1">
                                    Current: <span className="font-mono text-orange-500">{noiseThreshold.toFixed(3)}</span>
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="font-mono text-xs font-semibold text-slate-500 w-8 text-center tabular-nums">
                    {formatTime(sessionDuration)}
                </div>

                <button
                    onClick={onStopSession}
                    disabled={!sessionActive}
                    className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-full hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icons.Stop />
                    <span>Stop</span>
                </button>
            </div>

        </div>
    );
}
