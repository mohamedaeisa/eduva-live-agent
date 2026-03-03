import React, { useEffect, useRef, useState, useMemo } from 'react';
import TeacherOverlay from './TeacherOverlay';
import { DrawingAction, TeacherState } from '../types';
// Fix for ESM/CJS interop issues with PDF.js
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// Configure PDF.js Worker
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

// --- Drawing Helpers (Replicated from TeacherOverlay for consistency) ---
const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const drawHandCircle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seedStr: string) => {
  let seed = seedStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  ctx.beginPath();
  const maxAngle = 2 * Math.PI + 0.4;
  const step = 0.2;
  for (let angle = 0; angle <= maxAngle; angle += step) {
    const noiseX = (seededRandom(seed++) - 0.5) * (rx * 0.1);
    const noiseY = (seededRandom(seed++) - 0.5) * (ry * 0.1);
    const px = cx + (rx + noiseX) * Math.cos(angle);
    const py = cy + (ry + noiseY) * Math.sin(angle);
    if (angle === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
};

const drawHandArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const length = Math.hypot(toX - fromX, toY - fromY);
  ctx.beginPath();
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const curveAmt = length * 0.05 * (Math.random() - 0.5);
  const cpX = midX - curveAmt * Math.sin(angle);
  const cpY = midY + curveAmt * Math.cos(angle);
  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo(cpX, cpY, toX, toY);
  ctx.stroke();
  const headLen = Math.max(15, length * 0.15);
  const angle1 = angle - Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle1), toY - headLen * Math.sin(angle1));
  ctx.stroke();
  const angle2 = angle + Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle2), toY - headLen * Math.sin(angle2));
  ctx.stroke();
};

const drawFreehand = (ctx: CanvasRenderingContext2D, points: { x: number, y: number }[], width: number, height: number) => {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo((points[0].x / 100) * width, (points[0].y / 100) * height);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo((points[i].x / 100) * width, (points[i].y / 100) * height);
  }
  ctx.stroke();
};

interface DocumentStageProps {
  mode: 'screen' | 'pdf';
  stream?: MediaStream;
  pdfFile?: File;
  drawingActions: DrawingAction[];
  onFrameCapture: (base64: string, metadata?: any) => void;
  isActive: boolean;
  aiState?: TeacherState;
  onScroll?: (scrollTop: number, scrollLeft: number) => void;
  activeTool?: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser';
  activeColor?: string;
  onUserDraw?: (action: DrawingAction) => void;
  isGenerating?: boolean;
}

const DocumentStage: React.FC<DocumentStageProps> = ({
  mode,
  stream,
  pdfFile,
  drawingActions,
  onFrameCapture,
  isActive,
  aiState,
  onScroll,
  activeTool = 'pointer',
  activeColor = '#ef4444',
  onUserDraw,
  isGenerating = false,
}) => {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const drawingCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stableFrameRef = useRef<HTMLCanvasElement | null>(null);
  const renderAbortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const timeoutRef = useRef<any>(null);
  const tempActionRef = useRef<DrawingAction | null>(null);
  const sendInFlightRef = useRef(false);
  const lastCaptureTimeRef = useRef(0);
  const lastExportTimeRef = useRef(0);
  const hasCapturedInitialPdfRef = useRef(false);
  const needsCacheRebuildRef = useRef(false);
  const stageRectRef = useRef<DOMRect | null>(null);

  // --- State ---
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempAction, setTempAction] = useState<DrawingAction | null>(null);
  const [zoom, setZoom] = useState(1);

  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // --- Helpers ---
  const rebuildDrawingCache = React.useCallback(() => {
    const cache = drawingCacheCanvasRef.current;
    if (!cache || dimensions.width === 0 || dimensions.height === 0) return;
    const ctx = cache.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cache.width, cache.height);
    drawingActions.forEach(action => {
      const w = cache.width;
      const h = cache.height;
      const ax = (action.x / 100) * w;
      const ay = (action.y / 100) * h;
      const aw = action.width ? (action.width / 100) * w : 0;
      const ah = action.height ? (action.height / 100) * h : 0;
      ctx.save();
      ctx.strokeStyle = action.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (action.type) {
        case 'circle': {
          const rx = aw ? aw / 2 : 50;
          const ry = ah ? ah / 2 : 50;
          drawHandCircle(ctx, aw ? ax + rx : ax, ah ? ay + ry : ay, rx, ry, action.id);
          break;
        }
        case 'arrow': {
          drawHandArrow(ctx, ax, ay, (aw === 0 && ah === 0) ? ax + 60 : ax + aw, (aw === 0 && ah === 0) ? ay + 60 : ay + ah);
          break;
        }
        case 'freehand': {
          if (action.points) drawFreehand(ctx, action.points, w, h);
          break;
        }
        case 'eraser': {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 20;
          if (action.points) drawFreehand(ctx, action.points, w, h);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
      ctx.restore();
    });
    needsCacheRebuildRef.current = false;
  }, [drawingActions, dimensions]);

  // --- Frame Capture Logic ---
  const captureFrame = React.useCallback((forceExport = false, reason: string = 'interval') => {
    // 🔒 GATING: Vision is passive context. Blocking only during GENERATING.
    if (isGenerating) return;

    if (!onFrameCapture) return;
    const now = Date.now();

    if (!forceExport) {
      if (now - lastCaptureTimeRef.current < 150) return;
      if (isDrawing && now - lastExportTimeRef.current < 400) return;
    }
    lastCaptureTimeRef.current = now;

    const container = containerRef.current;
    if (!container || !captureCanvasRef.current) return;
    if (sendInFlightRef.current && !forceExport) return;

    const viewportWidth = container.clientWidth;
    const viewportHeight = container.clientHeight;
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    // PATH 1: Keep-Alive
    if (reason === 'keep-alive') {
      try {
        if (!stableFrameRef.current) return;
        const kaCanvas = document.createElement('canvas');
        const src = stableFrameRef.current;
        const scale = Math.min(1, 256 / src.width);
        kaCanvas.width = src.width * scale;
        kaCanvas.height = src.height * scale;
        const kaCtx = kaCanvas.getContext('2d');
        if (kaCtx) {
          kaCtx.drawImage(src, 0, 0, kaCanvas.width, kaCanvas.height);
          const base64 = kaCanvas.toDataURL('image/jpeg', 0.2).split(',')[1];
          if (base64.length <= 15000) {
            onFrameCapture(base64, { visionMode: 'passive', intent: 'none', suppressReasoning: true });
          }
        }
      } catch (e) { console.error("Keep-Alive Failed", e); }
      return;
    }

    // PATH 2: Intent Render
    try {
      // INVARIANT: captureCanvasRef is NEVER resized after initialization
      if (captureCanvasRef.current.width === 0) {
        captureCanvasRef.current.width = 1024;
        captureCanvasRef.current.height = 768;
      }

      const ctx = captureCanvasRef.current.getContext('2d', { alpha: false });
      if (!ctx) return;

      const captureWidth = captureCanvasRef.current.width;
      const captureHeight = captureCanvasRef.current.height;
      const scaleRatio = captureWidth / viewportWidth;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, captureWidth, captureHeight);

      ctx.save();
      if (mode === 'screen' && videoRef.current && stream) {
        const video = videoRef.current;
        const vW = video.videoWidth || 1280;
        const vH = video.videoHeight || 720;
        const vScale = Math.min(captureWidth / vW, captureHeight / vH);
        const x = (captureWidth - vW * vScale) / 2;
        const y = (captureHeight - vH * vScale) / 2;
        ctx.drawImage(video, x, y, vW * vScale, vH * vScale);
      } else if (mode === 'pdf') {
        if (pdfDoc && pdfContainerRef.current) {
          const containerRect = container.getBoundingClientRect();
          pageCanvasRefs.current.forEach((pageCanvas) => {
            if (!pageCanvas.isConnected) return;
            const pageRect = pageCanvas.getBoundingClientRect();
            const relX = pageRect.left - containerRect.left;
            const relY = pageRect.top - containerRect.top;
            if (relY < viewportHeight && relY + pageRect.height > 0) {
              ctx.drawImage(pageCanvas, relX * scaleRatio, relY * scaleRatio, pageRect.width * scaleRatio, pageRect.height * scaleRatio);
            }
          });
        }
      }

      // Overlays from cache
      if (drawingCacheCanvasRef.current) {
        ctx.drawImage(drawingCacheCanvasRef.current, scrollLeft, scrollTop, viewportWidth, viewportHeight, 0, 0, captureWidth, captureHeight);
      }
      ctx.restore();

      const base64 = captureCanvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      if (!base64) return;

      if (!stableFrameRef.current) stableFrameRef.current = document.createElement('canvas');
      stableFrameRef.current.width = captureWidth;
      stableFrameRef.current.height = captureHeight;
      const sfCtx = stableFrameRef.current.getContext('2d');
      if (sfCtx) sfCtx.drawImage(captureCanvasRef.current, 0, 0);

      onFrameCapture(base64, { visionMode: 'active', intent: reason });
      sendInFlightRef.current = true;
      requestAnimationFrame(() => { sendInFlightRef.current = false; });
    } catch (e) { console.error("Capture Failed", e); }
  }, [isActive, aiState, isDrawing, mode, stream, pdfDoc, onFrameCapture]);

  // --- Effects ---
  useEffect(() => {
    tempActionRef.current = tempAction;
  }, [tempAction]);

  useEffect(() => {
    if (mode === 'screen' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [mode, stream]);

  useEffect(() => {
    if (needsCacheRebuildRef.current || drawingActions.length > 0) rebuildDrawingCache();
  }, [rebuildDrawingCache, drawingActions]);

  /* ❄️ PHASE 0: RAF LOOP FROZEN
  useEffect(() => {
    if (!isActive) return;
    if (mode !== 'screen') return;
    if (!stream) return;
    if (!videoRef.current) return;

    let rafId: number;
    const loop = () => {
      if (aiState === TeacherState.LISTENING && !isGenerating) {
        captureFrame(false, 'screen-raf');
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, mode, stream, aiState, captureFrame]);
  */

  // Handle PDF resize-then-render
  useEffect(() => {
    if (!pdfDoc || !pdfContainerRef.current) return;
    const renderPages = async () => {
      setIsRendering(true);
      pdfContainerRef.current!.innerHTML = '';
      pageCanvasRefs.current.clear();
      const RENDER_WIDTH = 1200;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (renderAbortControllerRef.current?.signal.aborted) break;
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const scale = (RENDER_WIDTH - 40) / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.className = "mb-4 shadow-lg mx-auto bg-white max-w-full block";
        pageCanvasRefs.current.set(i, canvas);
        pdfContainerRef.current!.appendChild(canvas);
        const context = canvas.getContext('2d');
        if (context) await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
      }
      setIsRendering(false);
      setTimeout(() => {
        if (containerRef.current) {
          setDimensions({ width: containerRef.current.scrollWidth, height: containerRef.current.scrollHeight });
        }
        captureFrame(true, 'pdf-render-complete');
      }, 200);
    };

    if (renderAbortControllerRef.current) renderAbortControllerRef.current.abort();
    renderAbortControllerRef.current = new AbortController();
    renderPages();
    return () => renderAbortControllerRef.current?.abort();
  }, [pdfDoc, mode]);

  // Resize Stage (PDF stability logic)
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const newW = mode === 'pdf' ? containerRef.current.scrollWidth : containerRef.current.clientWidth;
      const newH = mode === 'pdf' ? containerRef.current.scrollHeight : containerRef.current.clientHeight;
      if (mode === 'pdf' && dimensions.height > 100 && Math.abs(dimensions.height - newH) < 50) return;
      setDimensions({ width: newW, height: newH });
    };
    updateDimensions();
    if (mode === 'pdf') return;
    const obs = new ResizeObserver(updateDimensions);
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [mode, pdfDoc]);

  /* ❄️ PHASE 4/5: PASSIVE VISION SEEDING (3s INTERVAL) */
  useEffect(() => {
    // Note: We capture even when not "active" (IDLE) to seed the buffer.
    const interval = setInterval(() => captureFrame(false, 'passive-interval'), 3000);
    return () => clearInterval(interval);
  }, [captureFrame]);

  /* ❄️ PHASE 0: KEEP-ALIVE (Original) - REMAIN FROZEN
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => captureFrame(false, 'keep-alive'), 4000);
    return () => clearInterval(interval);
  }, [isActive, captureFrame]);
  */

  // --- Handlers ---
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) onScroll(e.currentTarget.scrollTop, e.currentTarget.scrollLeft);
    // ❄️ PHASE 0: AUTO-CAPTURE FROZEN
    /*
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => captureFrame(false, 'scroll-end'), 400);
    */
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pointer') return;
    e.preventDefault();
    setIsDrawing(true);
    // 🛡️ Fix: Cache rect on mousedown to prevent null-access in mousemove
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    stageRectRef.current = rect;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newAction: DrawingAction = {
      id: crypto.randomUUID(), type: activeTool as any, x, y, width: 0, height: 0,
      color: activeColor, timestamp: Date.now(), points: [{ x, y }]
    };
    setTempAction(newAction);

    const move = (ev: MouseEvent) => {
      if (!stageRectRef.current) return; // Silent safety
      const r = stageRectRef.current;
      const cx = ((ev.clientX - r.left) / r.width) * 100;
      const cy = ((ev.clientY - r.top) / r.height) * 100;
      setTempAction(prev => {
        if (!prev) return null;
        if (activeTool === 'freehand' || activeTool === 'eraser') {
          return { ...prev, points: [...(prev.points || []), { x: cx, y: cy }] };
        }
        return { ...prev, width: cx - prev.x, height: cy - prev.y };
      });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      stageRectRef.current = null;
      setIsDrawing(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  useEffect(() => {
    if (!isDrawing && tempAction && onUserDraw) {
      onUserDraw(tempAction);
      setTempAction(null);
    }
  }, [isDrawing, tempAction, onUserDraw]);

  // --- Render ---
  const actionsToRender = useMemo(() => {
    const base = [...drawingActions];
    if (tempAction) base.push(tempAction);
    return base;
  }, [drawingActions, tempAction]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
      <div ref={containerRef} onScroll={handleScroll} className="relative w-full h-full overflow-auto flex flex-col items-center">
        <div className="relative transition-transform duration-200 origin-top"
          style={{ width: dimensions.width, height: mode === 'pdf' ? 'auto' : dimensions.height, transform: `scale(${zoom})`, marginTop: mode === 'pdf' ? '20px' : '0' }}>

          <div className="absolute inset-0 pointer-events-none z-50">
            <TeacherOverlay actions={actionsToRender} width={dimensions.width} height={dimensions.height} />
          </div>

          {activeTool !== 'pointer' && (
            <div className="absolute inset-0 z-[60] cursor-crosshair touch-none" onMouseDown={handleMouseDown} />
          )}

          <canvas ref={captureCanvasRef} className="hidden" />

          {mode === 'screen' && (
            <div className="w-full h-full flex items-center justify-center sticky top-0">
              {stream ? (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <p className="text-lg font-medium">Capture Screen to Start</p>
                </div>
              )}
            </div>
          )}

          {mode === 'pdf' && (
            <div className="w-full min-h-full flex flex-col items-center justify-start p-4 bg-slate-800">
              {isRendering && <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50 text-white">Rendering Document...</div>}
              {loadError && <div className="text-red-400 p-4">{loadError}</div>}
              <div ref={pdfContainerRef} className="w-full max-w-3xl flex flex-col items-center"></div>
              {pdfImage && <img src={pdfImage} alt="Document" className="max-w-full max-h-full object-contain" />}
            </div>
          )}
        </div>
      </div>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-[70] flex space-x-2 bg-slate-800/80 backdrop-blur rounded p-1 border border-slate-700">
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 text-white">-</button>
        <span className="text-white text-xs flex items-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 text-white">+</button>
      </div>
    </div>
  );
};

export default DocumentStage;