import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import TeacherOverlay from './TeacherOverlay';
import { useBoard } from '../context/BoardProvider';
import { TeacherState, Stroke, Rect, BoardState, ViewportState, DrawingAction } from '../types';

// 🔒 Phase 33: Global Throttling Constants
const VISION_COOLDOWN_MS = 1000;
let LAST_VISION_CAPTURE_TS = 0;
import { BoardEngine } from '../services/boardEngine';
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// Configure PDF.js Worker
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

import PdfPage from './PdfPage';
import FeatureDashboard from './FeatureDashboard';

interface DocumentStageProps {
  stream?: MediaStream;
  pdfFile?: File;
  onFrameCapture: (base64: string, metadata?: any) => void;
  isActive: boolean;
  aiState?: TeacherState;
  activeTool?: 'pointer' | 'pen' | 'circle' | 'arrow' | 'eraser' | 'text';
  activeColor?: string;
  isGenerating?: boolean;
  rescueTrigger?: number; // 🛟 Phase 16.1
  onUploadClick?: () => void;
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
  onUploadClick,
}) => {
  const { state, setLifecycle, setViewport, setVisibleRects, addStroke, setSnapshot, setSource, setKeepTeacherAnnotations } = useBoard();
  const { viewport, strokes, lifecycle, source, mode, keepTeacherAnnotations } = state;

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
  const [textInput, setTextInput] = useState<{ x: number, y: number, worldX: number, worldY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCapturedPageRef = useRef<number>(0); // 🧊 Phase 15: Throttling


  // --- PDF Loading ---
  useEffect(() => {
    if (!pdfFile || state.source !== 'pdf') {
      // 🛡️ Phase 32: Prevent "loading lock" spinner if source is PDF but no file selected
      if (state.source === 'pdf' && lifecycle === 'loading') {
        console.debug("[DS] No PDF file selected, resetting lifecycle to idle");
        setLifecycle('idle');
      }
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
        
        // 📏 Phase 35: Calculate accurate total document height
        let totalWorldHeight = 0;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          totalWorldHeight += vp.height + 32; // Include page margin (mb-8 = 32px)
        }
        
        console.log(`[DS] PDF Loaded: pages=${doc.numPages} totalHeight=${totalWorldHeight}`);
        setViewport({ height: totalWorldHeight });
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

  // --- 📐 Phase 35: ResizeObserver for Dynamic DOM Bounds ---
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // 🛰️ Rule: ResizeObserver only tracks PHYSICAL dimensions.
        // It should NEVER overwrite scale, which belongs to the user.
        if (state.source === 'pdf') {
          setViewport({ width });
        } else {
          setViewport({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [state.source, setViewport]);

  // --- 📐 Phase 36: Initial Fit-to-Content (One-time or Source switch) ---
  const lastSourceRef = useRef<string | null>(null);
  useEffect(() => {
    if (lifecycle !== 'ready' || !containerRef.current) return;
    
    // Only trigger fit-to-content when source actually CHANGES
    if (lastSourceRef.current === state.source && (state.source !== 'pdf' || pdfDoc === null)) return;
    lastSourceRef.current = state.source;

    const { width, height } = containerRef.current.getBoundingClientRect();

    if (state.source === 'pdf' && pdfDoc) {
      pdfDoc.getPage(1).then((page: any) => {
        const pdfViewport = page.getViewport({ scale: 1 });
        const fitScale = width / pdfViewport.width;
        console.log(`[DS][fit] pdf fitScale=${fitScale}`);
        setViewport({ scale: fitScale, offsetX: 0, offsetY: 0 });
      });
    } else if (state.source === 'board') {
      console.log(`[DS][fit] board fitScale=1`);
      setViewport({ scale: 1, offsetX: 0, offsetY: 0 });
    }
  }, [state.source, pdfDoc, lifecycle, setViewport]);

  // --- Drawing Handlers (World Coordinates) ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'pointer' || lifecycle !== 'ready') return;
    e.preventDefault();
    setIsDrawing(true);

    const rect = contentRef.current!.getBoundingClientRect();
    // 📐 Rule: If screenX is relative to the TRANSFORMED element, we only need to divide by scale.
    const worldX = (e.clientX - rect.left) / viewport.scale;
    const worldY = (e.clientY - rect.top) / viewport.scale;
    
    const worldP = { x: worldX, y: worldY };
    
    // 🔤 Text Tool Logic
    if (activeTool === 'text') {
      setTextInput({ x: e.clientX - rect.left, y: e.clientY - rect.top, worldX: worldP.x, worldY: worldP.y });
      setTextValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

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

  const handleTextCommit = useCallback(() => {
    if (textInput && textValue.trim()) {
      addStroke({
        id: crypto.randomUUID(),
        author: 'user',
        tool: 'text',
        path: [{ x: textInput.worldX, y: textInput.worldY }],
        color: activeColor,
        width: 3,
        text: textValue.trim()
      });
    }
    setTextInput(null);
    setTextValue("");
  }, [textInput, textValue, activeColor, addStroke]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !currentStroke) return;

    const rect = contentRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / viewport.scale;
    const worldY = (e.clientY - rect.top) / viewport.scale;
    const worldP = { x: worldX, y: worldY };

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
  const zoomIn = () => setViewport({ scale: Math.min(4, viewport.scale + 0.25) });
  const zoomOut = () => setViewport({ scale: Math.max(0.1, viewport.scale - 0.25) });

  // --- Snapshot Composition (Vision Pipeline) ---
  const captureFrame = useCallback((isRescue: boolean = false, metadataOverride?: any) => {
    // 🔒 Phase 33: Strict Global Throttle to prevent "Vision Storms"
    const now = Date.now();
    if (!isRescue && (now - LAST_VISION_CAPTURE_TS < VISION_COOLDOWN_MS)) {
      console.debug(`[DS][throttle] skipping capture, cooldown active (${now - LAST_VISION_CAPTURE_TS}ms)`);
      return;
    }
    LAST_VISION_CAPTURE_TS = now;

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
        isRescue: true,
        strokes: state.strokes // 🖊️ Precise telemetry even in rescue
      });
      return; // STOP: Rescue is infrastructure, not UI
    }

    setHasCapturedFirstFrame(true); // 🧊 Phase 26: Latch after first valid capture
    setSnapshot(base64);

    // 🔒 Phase 13: Attach Rich Metadata for AI Context
    const metadata = {
      viewport: {
        ...state.viewport,
        containerWidth: containerRef.current.clientWidth, // 🛰️ Phase 35: Visible bounds
        containerHeight: containerRef.current.clientHeight,
        scrollX: containerRef.current.scrollLeft, // 🛰️ Phase 35: Track scroll
        scrollY: containerRef.current.scrollTop,
      },
      visibleRects: state.visibleRects,
      source: state.source,
      pageCount: pageCount,
      timestamp: now,
      frameId: currentFrameId,
      strokes: state.strokes, // 🖊️ Digital Ink Telemetry (Coordinates + Author)
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
      const isAIActive = isGenerating || aiState === TeacherState.THINKING || aiState === TeacherState.SPEAKING || aiState === TeacherState.GENERATING;
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
    if (lifecycle === 'ready' && (state.source === 'pdf' || state.source === 'screen' || state.source === 'board')) {
      // ⚖️ Phase 16.2: Strict Inter-Turn Gate
      const isAIActive = isGenerating || aiState === TeacherState.THINKING || aiState === TeacherState.SPEAKING || aiState === TeacherState.GENERATING;
      if (isAIActive && hasCapturedFirstFrame) return;

      // Trigger if significant state change occurs
      const t = setTimeout(() => {
        console.log(`[DS][trigger] type=STATE_CHANGE source=${state.source} aiState=${aiState} ts=${Date.now()}`);
        captureFrame();
      }, 500); // 🧊 Settle delay back to 500ms
      return () => clearTimeout(t);
    }
    // 🛡️ REFINED: Removed state.strokes.length as it causes storms during AI drawing
  }, [lifecycle, state.source, pageCount, state.viewport.scale, state.viewport.offsetX, state.viewport.offsetY, captureFrame, isGenerating, aiState]);

  // 🛟 Phase 16.1/16.2/16.3: Rescue MUST bypass AI state completely
  useEffect(() => {
    if (rescueTrigger > 0) {
      console.log(`[DS][rescue] Manual rescue triggered ts=${Date.now()}`);
      captureFrame(true, { isRescue: true });
    }
  }, [rescueTrigger, captureFrame]);

  return (
    <div className="relative w-full h-full bg-[#f8fbff] rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className={`relative w-full h-full flex flex-col items-center p-0 bg-slate-200/20 ${state.source === 'pdf' ? 'overflow-auto' : 'overflow-hidden'}`}
      >
        {/* THE BOARD SURFACE */}
        <div
          ref={contentRef}
          className="relative transition-transform duration-300 ease-out origin-top"
          style={{
            transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
            width: viewport.width,
            height: viewport.height, // Force to document height for strokes
            cursor: activeTool === 'pointer' ? 'default' : 'crosshair'
          }}
        >
          {/* ⚡ Interaction Layer (Captures events above PDF/Screen) */}
          {activeTool !== 'pointer' && (
            <div 
              className="absolute inset-0 z-[60] cursor-crosshair touch-none pointer-events-auto"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          )}

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

          {state.source === 'board' && (
            <div className="w-full h-full bg-white rounded-xl border border-slate-300 shadow-sm flex items-center justify-center animate-pulse-slow">
              <div className="flex flex-col items-center space-y-3 opacity-20 select-none">
                <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-xl font-medium tracking-widest text-slate-300 uppercase">Whiteboard Surface</span>
              </div>
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

          {/* 🔤 Floating Text Input - Placed inside transformed content wrapper */}
          {textInput && (
            <div 
              className="absolute z-[100] animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
              style={{ 
                left: textInput.x,
                top: textInput.y,
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTextCommit();
                  if (e.key === 'Escape') setTextInput(null);
                }}
                onBlur={handleTextCommit}
                className="bg-transparent text-white border-b-2 border-blue-500/50 outline-none min-w-[50px] font-bold p-0 m-0 leading-none"
                style={{ 
                  color: activeColor,
                  fontSize: '20px',
                  fontFamily: 'Inter, system-ui, sans-serif'
                }}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* 🚀 Feature Dashboard (Default Land View) */}
        {state.source === 'none' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-y-auto custom-scrollbar p-4">
             <FeatureDashboard 
               onSelectFeature={setSource}
               onUploadClick={() => onUploadClick?.()}
             />
          </div>
        )}
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

        {/* 🖊️ Teacher Annotation Control */}
        <div className="bg-slate-800/80 backdrop-blur rounded-lg p-1 border border-slate-700 shadow-lg flex flex-col items-center space-y-1">
          <button 
            onClick={() => setKeepTeacherAnnotations(!keepTeacherAnnotations)}
            title={keepTeacherAnnotations ? "Keep AI Annotations (Permanent)" : "Auto-Clear AI Annotations (10s)"}
            className={`w-10 h-10 flex flex-col items-center justify-center rounded transition-all duration-300 ${
              keepTeacherAnnotations ? 'bg-amber-500/20 text-amber-500' : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            {keepTeacherAnnotations ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
            )}
            <span className="text-[8px] font-bold mt-0.5 uppercase tracking-tighter">
              {keepTeacherAnnotations ? 'Locked' : 'Auto'}
            </span>
          </button>
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