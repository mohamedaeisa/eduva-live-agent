import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import TeacherOverlay from './TeacherOverlay';
import { useBoard } from '../context/BoardProvider';
import { TeacherState, Stroke, Rect } from '../types';
import { BoardEngine } from '../services/boardEngine';
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// Configure PDF.js Worker
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

import PdfPage from './PdfPage';

interface DocumentStageProps {
  stream?: MediaStream;
  pdfFile?: File;
  onFrameCapture: (base64: string, metadata?: any) => void;
  isActive: boolean;
  aiState?: TeacherState;
  activeTool?: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser';
  activeColor?: string;
  isGenerating?: boolean;
  rescueTrigger?: number; // 🛟 Phase 16.1
}

const DocumentStage: React.FC<DocumentStageProps> = ({
  stream,
  pdfFile,
  onFrameCapture,
  isActive,
  aiState,
  activeTool = 'pointer',
  activeColor = '#ef4444',
  isGenerating = false,
  rescueTrigger = 0, // 🛟 Phase 16.1
}) => {
  const { state, setLifecycle, setViewport, setVisibleRects, addStroke, setSnapshot } = useBoard();
  const { viewport, strokes, lifecycle, source, mode } = state;

  const visionFrameIdRef = useRef(0); // 📊 Phase 17: Correlation ID

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasCapturedFirstFrame, setHasCapturedFirstFrame] = useState(false); // 🧊 Phase 26: Initial latch
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const lastCapturedPageRef = useRef<number>(0); // 🧊 Phase 15: Throttling


  // --- PDF Loading ---
  useEffect(() => {
    if (!pdfFile || state.source !== 'pdf') {
      setPageCount(0);
      setPdfDoc(null);
      return;
    }

    setLifecycle('loading');
    const loadPdf = async () => {
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setLifecycle('ready');
      } catch (err) {
        console.error("PDF Load Error:", err);
        setLifecycle('idle');
      }
    };
    loadPdf();
  }, [pdfFile, state.source, setLifecycle]);

  // --- Screen/Video Stream ---
  useEffect(() => {
    if (state.source === 'screen' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      setLifecycle('ready');
    }
  }, [state.source, stream, setLifecycle]);

  // --- IntersectionObserver (PDF Page Windowing) ---
  useEffect(() => {
    if (state.source !== 'pdf' || !pdfDoc || !pdfContainerRef.current) return;

    const options = {
      root: containerRef.current,
      threshold: 0.1,
      rootMargin: '200px'
    };

    // 🔒 Fix: Decouple BoardProvider updates from state setter logic
    observerRef.current = new IntersectionObserver((entries) => {
      const visiblePages = new Set<number>();
      const rects: Rect[] = [];

      // Collect visibility data first
      entries.forEach(entry => {
        const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
        if (entry.isIntersecting) {
          visiblePages.add(pageNum);
          const rect = entry.target.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            rects.push({
              page: pageNum,
              x: rect.left - containerRect.left,
              y: rect.top - containerRect.top,
              w: rect.width,
              h: rect.height
            });
          }
        }
      });

      // Update LOCAL state
      if (visiblePages.size > 0) {
        setRenderedPages(prev => {
          const next = new Set(prev);
          visiblePages.forEach(p => next.add(p));
          return next;
        });
      }

      // Update BOARD state (Asynchronously to avoid React's "setState during render" warning)
      if (rects.length > 0) {
        setTimeout(() => setVisibleRects(rects), 0);
      }
    }, options);

    // Dynamic Observation: Observe all page placeholders
    const placeholders = pdfContainerRef.current.querySelectorAll('.pdf-page-placeholder');
    placeholders.forEach(p => observerRef.current?.observe(p));

    return () => observerRef.current?.disconnect();
  }, [state.source, pdfDoc, setVisibleRects, pageCount]);

  // --- Drawing Handlers (World Coordinates) ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'pointer' || lifecycle !== 'ready') return;
    e.preventDefault();
    setIsDrawing(true);

    const rect = contentRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert to World
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
  }, [activeTool, lifecycle, viewport, activeColor]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !currentStroke) return;

    const rect = contentRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);

    setCurrentStroke(prev => prev ? { ...prev, path: [...prev.path, worldP] } : null);
  }, [isDrawing, currentStroke, viewport]);

  const handleMouseUp = useCallback(() => {
    if (currentStroke) {
      addStroke(currentStroke);
      setCurrentStroke(null);
    }
    setIsDrawing(false);
  }, [currentStroke, addStroke]);

  // --- Viewport Scaling Logic ---
  const zoomIn = () => setViewport({ scale: Math.min(3, viewport.scale + 0.25) });
  const zoomOut = () => setViewport({ scale: Math.max(0.5, viewport.scale - 0.25) });

  // --- Snapshot Composition (Vision Pipeline) ---
  const captureFrame = useCallback((metadataOverride?: any) => {
    const isRescue = metadataOverride?.isRescue === true;
    const now = Date.now();
    visionFrameIdRef.current++;
    const currentFrameId = visionFrameIdRef.current;

    if (!containerRef.current) {
      console.warn(`[DS][captureFrame][ABORT] reason=NO_CONTAINER ts=${now}`);
      return;
    }

    // Create a new canvas for capture instead of using the ref, as per instruction
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use a fixed resolution for AI vision (e.g., 1280x720)
    // or match the container aspect ratio
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = 1280;
    canvas.height = (1280 / rect.width) * rect.height;

    ctx.fillStyle = '#0f172a'; // bg-slate-900
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = canvas.width / rect.width;

    // 1. Draw PDF/Video Layer
    if (state.source === 'screen' && videoRef.current) {
      ctx.save();
      ctx.scale(scale, scale);
      // Map screen stream to canvas
      const v = videoRef.current;
      const vRect = v.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();
      ctx.drawImage(v, vRect.left - cRect.left, vRect.top - cRect.top, vRect.width, vRect.height);
      ctx.restore();
    } else if (state.source === 'pdf' && pdfContainerRef.current) {
      // Find visible canvas elements
      const canvases = pdfContainerRef.current.querySelectorAll('canvas');
      canvases.forEach(c => {
        const cRect = c.getBoundingClientRect();
        const contRect = containerRef.current!.getBoundingClientRect();

        // Only draw if within capture bounds
        if (cRect.bottom > contRect.top && cRect.top < contRect.bottom) {
          ctx.save();
          ctx.scale(scale, scale);
          ctx.drawImage(c, cRect.left - contRect.left, cRect.top - contRect.top, cRect.width, cRect.height);
          ctx.restore();
        }
      });
    }

    // 2. Draw Vector Drawing Layer (TeacherOverlay)
    // We can either find the overlay canvas or re-render
    const overlayCanvas = containerRef.current.querySelector('canvas.pointer-events-none');
    if (overlayCanvas instanceof HTMLCanvasElement) {
      ctx.save();
      ctx.scale(scale, scale);
      const oRect = overlayCanvas.getBoundingClientRect();
      const contRect = containerRef.current.getBoundingClientRect();
      ctx.drawImage(overlayCanvas, oRect.left - contRect.left, oRect.top - contRect.top, oRect.width, oRect.height);
      ctx.restore();
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.8);

    // 🧱 Rule 1: Rescue bypasses board state (No setSnapshot)
    if (isRescue) {
      console.log(`[DS][rescue] bypassing board state id=${currentFrameId} ts=${now}`);
      if (onFrameCapture) onFrameCapture(base64, {
        viewport: state.viewport,
        visibleRects: state.visibleRects,
        source: state.source,
        pageCount: pageCount,
        timestamp: now,
        frameId: currentFrameId,
        isRescue: true
      });
      return; // STOP: Rescue is infrastructure, not UI
    }

    setHasCapturedFirstFrame(true); // 🧊 Phase 26: Latch after first valid capture
    setSnapshot(base64);

    // 🔒 Phase 13: Attach Rich Metadata for AI Context
    const metadata = {
      viewport: state.viewport,
      visibleRects: state.visibleRects,
      source: state.source,
      pageCount: pageCount,
      timestamp: now,
      frameId: currentFrameId,
      ...metadataOverride
    };

    console.log(`[DS][captureFrame] id=${currentFrameId} source=${state.source} pages=${pageCount} rescue=${isRescue} aiState=${aiState} size=${canvas.width}x${canvas.height} ts=${now}`);

    if (onFrameCapture) onFrameCapture(base64, metadata);
  }, [state.source, state.viewport, state.visibleRects, pageCount, setSnapshot, onFrameCapture, aiState]);


  useEffect(() => {
    const interval = setInterval(() => {
      // ⚖️ Phase 16.2: Strict Inter-Turn Gate
      // 🔒 Phase 22: Stop all captures if session is CLOSED
      // 🔒 Phase 24: DO NOT block if aiState is IDLE (Session is starting)
      const isAIActive = isGenerating || aiState === 'THINKING' || aiState === 'EXPLAINING';
      const isSessionDead = lifecycle !== 'ready'; // Only gate on absolute lifecycle

      // 🧊 Phase 26: Unblock the very first frame even if AI is active (GREETING unblock)
      if (isSessionDead || isDrawing || (isAIActive && hasCapturedFirstFrame)) {
        if (isSessionDead && lifecycle !== 'idle') {
          console.debug(`[DS][gate] capture suppressed: sessionDead=${isSessionDead} ts=${Date.now()}`);
        }
        return;
      }

      console.debug(`[DS][trigger] type=INTERVAL lifecycle=${lifecycle} ts=${Date.now()}`);
      captureFrame();
    }, 5000);
    return () => clearInterval(interval);
  }, [lifecycle, isGenerating, aiState, isDrawing, captureFrame]);

  // 🧊 Phase 15: Intelligent Triggers (PDF Load / Page Count Change / Viewport Shift)
  useEffect(() => {
    if (lifecycle === 'ready' && (state.source === 'pdf' || state.source === 'screen')) {
      // ⚖️ Phase 16.2: Strict Inter-Turn Gate
      const isAIActive = isGenerating || aiState === 'THINKING' || aiState === 'EXPLAINING';
      if (isAIActive && hasCapturedFirstFrame) return; // 🧊 Phase 26: First frame unblocked

      // Trigger if page count changes or viewport shifts significantly
      const t = setTimeout(() => {
        console.log(`[DS][trigger] type=STATE_CHANGE source=${state.source} aiState=${aiState} ts=${Date.now()}`);
        captureFrame();
      }, 500); // Debounce to allow render/scroll to settle
      return () => clearTimeout(t);
    }
  }, [lifecycle, state.source, pageCount, state.viewport.scale, state.viewport.offsetX, state.viewport.offsetY, captureFrame, isGenerating, aiState]);

  // 🛟 Phase 16.1/16.2/16.3: Rescue MUST bypass AI state completely
  useEffect(() => {
    if (rescueTrigger > 0 && lifecycle === 'ready') {
      console.log(`[DS][trigger] type=RESCUE triggerId=${rescueTrigger} aiState=${aiState} ts=${Date.now()}`);
      captureFrame({ isRescue: true });
    }
  }, [rescueTrigger, lifecycle, captureFrame, aiState]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-auto flex flex-col items-center p-8 bg-slate-950/50"
      >
        {/* THE BOARD SURFACE */}
        <div
          ref={contentRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative transition-transform duration-300 ease-out origin-top"
          style={{
            transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
            width: viewport.width,
            minHeight: viewport.height,
            cursor: activeTool === 'pointer' ? 'default' : 'crosshair'
          }}
        >
          {/* CONTENT LAYER */}
          {state.source === 'screen' && (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto object-contain shadow-2xl rounded-lg" />
          )}

          {state.source === 'pdf' && (
            <div ref={pdfContainerRef} className="w-full flex flex-col items-center">
              {Array.from({ length: pageCount }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <PdfPage
                    key={pageNum}
                    pageNum={pageNum}
                    doc={pdfDoc}
                    isVisible={renderedPages.has(pageNum)}
                  />
                );
              })}
            </div>
          )}

          {/* DRAWING LAYER */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <TeacherOverlay
              actions={currentStroke ? [...strokes, currentStroke] : strokes}
              width={viewport.width}
              height={viewport.height}
            />
          </div>
        </div>
      </div>

      {/* SNAPSHOT UTILITY (Hidden) */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* CONTROLS */}
      <div className="absolute top-4 right-4 z-[70] flex flex-col space-y-2">
        <div className="flex items-center space-x-2 bg-slate-800/80 backdrop-blur rounded-lg p-1.5 border border-slate-700 shadow-lg">
          <button onClick={zoomOut} className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 rounded transition-colors">-</button>
          <span className="text-white text-xs font-mono min-w-[3ch] text-center">{Math.round(viewport.scale * 100)}%</span>
          <button onClick={zoomIn} className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 rounded transition-colors">+</button>
        </div>
      </div>

      {/* STATUS OVERLAYS */}
      {lifecycle === 'loading' && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-white font-medium">Preparing Board...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentStage;