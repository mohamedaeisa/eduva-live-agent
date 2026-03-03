import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { BoardState, ViewportState, Rect, Stroke, BoardLifecycle } from '../types';

interface BoardContextType {
    state: BoardState;
    setLifecycle: (l: BoardLifecycle) => void;
    setSource: (s: BoardState['source']) => void;
    setViewport: (v: Partial<ViewportState>) => void;
    setVisibleRects: (r: Rect[]) => void;
    addStroke: (s: Stroke) => void;
    clearStrokes: () => void;
    setSnapshot: (b64: string | null) => void;
    setMode: (m: BoardState['mode']) => void;
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
    source: 'board', // 🎯 Phase 38: Default to board
    viewport: INITIAL_VIEWPORT,
    visibleRects: [],
    strokes: [],
    snapshotBuffer: null,
    mode: 'study'
};

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<BoardState>(INITIAL_STATE);

    const setLifecycle = useCallback((lifecycle: BoardLifecycle) => {
        setState(prev => ({ ...prev, lifecycle }));
    }, []);

    const setSource = useCallback((source: BoardState['source']) => {
        setState(prev => ({
            ...prev,
            source,
            // 🛡️ Round 10: Unblock Board Interactivity
            // Board and Screen don't need a loading phase. Setting to 'ready' immediately
            // prevents the 'idle' lock that was blocking user drawing.
            lifecycle: source === 'pdf' ? 'loading' : 'ready',
            strokes: [], // Clear on switch
            snapshotBuffer: null
        }));
    }, []);

    const setViewport = useCallback((v: Partial<ViewportState>) => {
        setState(prev => ({ ...prev, viewport: { ...prev.viewport, ...v } }));
    }, []);

    const setVisibleRects = useCallback((visibleRects: Rect[]) => {
        setState(prev => ({ ...prev, visibleRects }));
    }, []);

    const addStroke = useCallback((stroke: Stroke) => {
        setState(prev => ({ ...prev, strokes: [...prev.strokes, stroke] }));
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

    const value = {
        state,
        setLifecycle,
        setSource,
        setViewport,
        setVisibleRects,
        addStroke,
        clearStrokes,
        setSnapshot,
        setMode
    };

    return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
};

export const useBoard = () => {
    const context = useContext(BoardContext);
    if (!context) throw new Error('useBoard must be used within BoardProvider');
    return context;
};
