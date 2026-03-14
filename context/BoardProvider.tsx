import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { BoardState, ViewportState, Rect, Stroke, BoardLifecycle, BoardSource } from '../types';

interface BoardContextType {
    state: BoardState;
    setLifecycle: (l: BoardLifecycle) => void;
    setSource: (s: BoardState['source']) => void;
    setViewport: (v: Partial<ViewportState>) => void;
    setVisibleRects: (r: Rect[]) => void;
    addStroke: (s: Stroke) => void;
    removeStroke: (id: string) => void;
    clearStrokes: () => void;
    setSnapshot: (b64: string | null) => void;
    setMode: (m: BoardState['mode']) => void;
    setKeepTeacherAnnotations: (k: boolean) => void;
}

const INITIAL_VIEWPORT: ViewportState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 1024,
    height: 768
};

const INITIAL_STATE: BoardState = {
    lifecycle: 'idle',
    source: 'none',
    viewport: INITIAL_VIEWPORT,
    visibleRects: [],
    strokes: [],
    snapshotBuffer: null,
    mode: 'study',
    keepTeacherAnnotations: false
};

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<BoardState>(INITIAL_STATE);

    const setLifecycle = useCallback((lifecycle: BoardLifecycle) => {
        setState(prev => ({ ...prev, lifecycle }));
    }, []);

    const setSource = useCallback((source: BoardSource) => {
        setState(prev => {
            const isImmediate = source === 'screen' || source === 'board';
            return {
                ...prev,
                source,
                lifecycle: source === 'none' ? 'idle' : (isImmediate ? 'ready' : 'loading'),
                strokes: [], // Clear on switch
                snapshotBuffer: null,
                // 📊 Phase 31: Initialize a default visible rect for non-PDF sources to enable vision pipeline
                visibleRects: isImmediate ? [{ page: 1, x: 0, y: 0, w: prev.viewport.width, h: prev.viewport.height }] : []
            };
        });
    }, []);

    const setViewport = useCallback((v: Partial<ViewportState>) => {
        setState(prev => ({ ...prev, viewport: { ...prev.viewport, ...v } }));
    }, []);

    const setVisibleRects = useCallback((visibleRects: Rect[]) => {
        setState(prev => ({ ...prev, visibleRects }));
    }, []);

    const addStroke = useCallback((stroke: Stroke) => {
        setState(prev => ({ ...prev, strokes: [...prev.strokes, stroke] }));

        // 🕒 Phase 42: Auto-clear AI drawings after 10 seconds to prevent clutter
        if (stroke.author === 'ai') {
            setState(prev => {
                if (!prev.keepTeacherAnnotations) {
                    setTimeout(() => {
                        setState(current => ({
                            ...current,
                            strokes: current.strokes.filter(s => s.id !== stroke.id)
                        }));
                    }, 10000);
                }
                return prev;
            });
        }
    }, [setState]); // Added setState to deps for safety

    const removeStroke = useCallback((id: string) => {
        setState(prev => ({ ...prev, strokes: prev.strokes.filter(s => s.id !== id) }));
    }, []);

    const clearStrokes = useCallback(() => {
        setState(prev => ({ ...prev, strokes: [] }));
    }, []);

    const setSnapshot = useCallback((b64: string | null) => {
        setState(prev => {
            // 🔒 VisionController Invariant: No snapshot if not ready or blind
            if (b64 && (prev.lifecycle !== 'ready' || prev.visibleRects.length === 0)) {
                return prev;
            }
            return { ...prev, snapshotBuffer: b64 };
        });
    }, []);

    const setMode = useCallback((mode: BoardState['mode']) => {
        setState(prev => ({ ...prev, mode }));
    }, []);

    const setKeepTeacherAnnotations = useCallback((keep: boolean) => {
        setState(prev => ({ ...prev, keepTeacherAnnotations: keep }));
    }, []);

    const value = {
        state,
        setLifecycle,
        setSource,
        setViewport,
        setVisibleRects,
        addStroke,
        removeStroke,
        clearStrokes,
        setSnapshot,
        setMode,
        setKeepTeacherAnnotations
    };

    return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
};

export const useBoard = () => {
    const context = useContext(BoardContext);
    if (!context) throw new Error('useBoard must be used within BoardProvider');
    return context;
};
