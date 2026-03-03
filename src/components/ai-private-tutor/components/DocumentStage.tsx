import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import TeacherOverlay from './TeacherOverlay';
import { useBoard } from '../context/BoardProvider';
import { TeacherState, Stroke, Rect, BoardSource } from '../types';
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
  activeTool?: 'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky' | 'rect' | 'line';
  activeColor?: string;
  activeWidth?: number; // 🖊️ Phase 51
  isGenerating?: boolean;
  rescueTrigger?: number; // 🛟 Phase 16.1
  onStartSession?: () => void;
}

// --- 🌸 WakeUpScreen Component ---
const WakeUpScreen = ({ onStart }: { onStart: () => void }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0F172A] z-30 overflow-hidden py-4 md:py-8">
      {/* 🌌 Aurora Mesh Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '1s' }} />
        <div className="absolute -bottom-[20%] left-[20%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none z-1"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* 🧪 Glassmorphic Content Card */}
      <div className="relative flex flex-col items-center w-full max-w-lg px-6 py-6 md:py-4 mx-4 animate-fade-in-up z-10 transition-all">
        {/* Background Glass Plate */}
        <div className="absolute inset-0 bg-white/5 dark:bg-slate-900/40 backdrop-blur-2xl rounded-[3rem] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50" />
        </div>

        {/* 🛸 Layered Animated Icon Stage */}
        <div className="relative mb-3 md:mb-1 group scale-[0.5] md:scale-[0.6]">
          {/* Outer Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-3xl blur-3xl opacity-30 group-hover:opacity-50 transition-all duration-700 animate-pulse" />

          {/* Main Icon Plate - Floating */}
          <div className="relative bg-white/10 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-white/20 shadow-2xl transform transition-all duration-700 hover:scale-105 hover:-rotate-2 animate-float">
            <div className="text-[70px] md:text-[90px] leading-none select-none filter drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]">
              🎓
            </div>
          </div>

          {/* Floating Decorative Elements */}
          <div className="absolute -right-6 -top-6 bg-blue-500/20 backdrop-blur-md p-4 rounded-2xl border border-blue-400/30 shadow-xl animate-[bounce_4s_infinite] transition-transform hover:scale-110">
            <span className="text-3xl md:text-4xl filter drop-shadow-md">💡</span>
          </div>
          <div className="absolute -left-10 bottom-4 bg-indigo-500/20 backdrop-blur-md p-3 rounded-2xl border border-indigo-400/30 shadow-xl animate-[bounce_5s_infinite_1s] transition-transform hover:scale-110">
            <span className="text-2xl md:text-3xl filter drop-shadow-md">📚</span>
          </div>
          <div className="absolute right-12 -bottom-4 bg-purple-500/20 backdrop-blur-md p-2 rounded-xl border border-purple-400/30 shadow-xl animate-[bounce_3s_infinite_0.5s] hidden md:block">
            <span className="text-xl filter drop-shadow-md">🧠</span>
          </div>
        </div>

        {/* ✍️ Expressive Typography */}
        <div className="text-center mb-6 md:mb-4 space-y-2 md:space-y-3 px-4 relative">
          <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight">
            <span className="inline-block hover:scale-105 transition-transform duration-300">Ready</span>{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 animate-pulse">to Learn?</span>
          </h2>

          <div className="h-px w-24 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent mx-auto" />

          <p className="text-sm md:text-lg text-slate-300 font-medium italic max-w-sm mx-auto leading-relaxed opacity-90">
            "The art of teaching is the art of assisting discovery."
            <span className="block text-[10px] text-blue-400 mt-2 not-italic font-black uppercase tracking-[0.2em] opacity-100">— Mark Van Doren</span>
          </p>
        </div>

        {/* 🚀 Ultimate CTA Button */}
        <button
          onClick={onStart}
          className="relative group overflow-hidden bg-white text-slate-900 font-black text-sm md:text-base px-6 py-2.5 md:px-8 md:py-3.5 rounded-xl shadow-[0_15px_40px_-10px_rgba(59,130,246,0.6)] transition-all hover:shadow-[0_20px_50px_-10px_rgba(59,130,246,0.8)] hover:-translate-y-1.5 active:translate-y-0 active:scale-95 z-20"
        >
          {/* Animated Gradient Fill */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[length:200%_200%] animate-gradient" />

          <div className="relative flex items-center gap-3 transition-colors group-hover:text-white">
            <div className="p-1.5 bg-blue-100 group-hover:bg-white/20 rounded-lg transition-colors shrink-0 shadow-inner">
              <svg className="w-5 h-5 text-blue-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="tracking-tight">Enter Classroom</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </button>

        {/* Help Tip */}
        <p className="mt-4 md:mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">
          Click to start session
        </p>
      </div>
    </div>
  );
};

const DocumentStage: React.FC<DocumentStageProps> = ({
  stream,
  pdfFile,
  onFrameCapture,
  isActive,
  aiState,
  activeTool = 'pointer',
  activeColor = '#ef4444',
  activeWidth = 3,
  isGenerating = false,
  rescueTrigger = 0,
  onStartSession
}) => {
  const { state, setLifecycle, setViewport, setVisibleRects, addStroke, setSnapshot } = useBoard();
  const { viewport, strokes, lifecycle, source, mode } = state;

  const visionFrameIdRef = useRef(0);
  const lastCaptureTimeRef = useRef<number>(0);
  const lastHandledRescueRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null); // 🎯 Direct Ref for Image Capture
  const chunksContainerRef = useRef<HTMLDivElement>(null); // 🎯 Tiled Canvas Containerf = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasCapturedFirstFrame, setHasCapturedFirstFrame] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [textInput, setTextInput] = useState<{ x: number, y: number, visible: boolean, worldP: { x: number, y: number }, maxWidth: number } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const lastCapturedPageRef = useRef<number>(0);
  const lastScreenForceSendTimeRef = useRef<number>(0);


  // --- PDF Loading ---
  useEffect(() => {
    if (!pdfFile || state.source !== 'pdf') {
      setPageCount(0);
      setPdfDoc(null);

      // 🧊 Phase 41: SAFETY RESET
      if (state.source === 'pdf' && containerRef.current) {
        setViewport({
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          width: containerRef.current.clientWidth || 1280,
          height: containerRef.current.clientHeight || 720
        });
      }
      return;
    }

    setLifecycle('loading');

    // 🧹 Phase 52: Hard State Reset
    // Ensure we don't have stale state from previous file
    setImageUrl(null);
    setPdfDoc(null);
    setPageCount(0);

    const loadPdf = async () => {
      try {
        console.log(`[DS][loadPdf] Processing file: name=${pdfFile.name} type=${pdfFile.type} size=${pdfFile.size}`);

        // 🎯 Handle Images Transparently in PDF Mode
        // Check MIME type OR file extension to be robust
        const isImage = pdfFile.type.startsWith('image/') ||
          /\.(jpe?g|png|webp|gif|bmp)$/i.test(pdfFile.name);

        if (isImage) {
          console.log('[DS][loadPdf] Detected IMAGE file - using direct render');
          const url = URL.createObjectURL(pdfFile);
          setImageUrl(url);
          setPdfDoc(null);
          setPageCount(1);
          setLifecycle('ready');
          return;
        }

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

    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [pdfFile, state.source, setLifecycle, setViewport]);

  // 🛡️ Round 8: Responsive PDF Fitting
  useEffect(() => {
    if (state.source !== 'pdf' || !pdfDoc || !containerRef.current) return;

    const updateFit = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      // Get the first page to determine native aspect ratio
      pdfDoc.getPage(1).then((firstPage: any) => {
        const pdfViewport = firstPage.getViewport({ scale: 1 });
        const availableWidth = containerRect.width;
        const fitScale = availableWidth / (pdfViewport.width || 600);

        setViewport({
          scale: fitScale,
          width: pdfViewport.width,
          height: pdfViewport.height * pdfDoc.numPages,
          offsetX: 0,
          offsetY: 0
        });
        console.debug(`[PDF] Auto-fit updated scale=${fitScale.toFixed(2)} containerWidth=${availableWidth}`);
      });
    };

    // 🎯 Mobile Notes Fix: Use ResizeObserver to detect flex layout changes
    // This handles resizing when the notes panel opens/closes, not just window resize.
    const resizeObserver = new ResizeObserver(() => {
      updateFit();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Initial fit
    updateFit();

    return () => {
      resizeObserver.disconnect();
    };
  }, [pdfDoc, state.source, setViewport]); // Only update when doc or source changes

  // --- Screen/Video Stream ---
  useEffect(() => {
    if (state.source === 'screen' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [state.source, stream]);

  // --- Whiteboard Viewport Management ---
  useEffect(() => {
    // 🧊 Phase 41: RESET Viewport when returning to board/screen to prevent "Lost in Space"
    if (state.source === 'board' || state.source === 'screen') {
      // If we come from PDF (scrolled down), reset to center.
      console.log(`[DS][Viewport] Resetting to default for ${state.source} mode`);
      setViewport({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        width: containerRef.current?.clientWidth || 1280,
        height: containerRef.current?.clientHeight || 720
      });
    }
  }, [state.source, setViewport]);

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
      // 🎯 Phase 43: Virtualization Management
      // We must atomicly update the set of rendered pages based on intersection changes.
      setRenderedPages(prev => {
        const next = new Set(prev);
        let changed = false;

        entries.forEach(entry => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum === 0) return;

          if (entry.isIntersecting) {
            if (!next.has(pageNum)) {
              next.add(pageNum);
              changed = true;
            }
          } else {
            if (next.has(pageNum)) {
              next.delete(pageNum);
              changed = true;
            }
          }
        });

        return changed ? next : prev;
      });

      // Update Rects only for intersecting entries (optional, depends on downstream usage)
      // For now, we keep the original logic but ensure it doesn't crash
      const rects: Rect[] = [];
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const rect = entry.target.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            rects.push({
              page: parseInt(entry.target.getAttribute('data-page') || '0'),
              x: rect.left - containerRect.left,
              y: rect.top - containerRect.top,
              w: rect.width,
              h: rect.height
            });
          }
        }
      });


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

  // 🎯 Phase 48: Scroll Debounce Trigger for PDF
  useEffect(() => {
    if (state.source !== 'pdf' || !containerRef.current) return;

    let scrollDebounceTimer: NodeJS.Timeout | null = null;
    let lastScrollPos = { x: 0, y: 0 };

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const currentScroll = { x: container.scrollLeft, y: container.scrollTop };
      const hasScrolled =
        Math.abs(currentScroll.x - lastScrollPos.x) > 10 ||
        Math.abs(currentScroll.y - lastScrollPos.y) > 10;

      if (hasScrolled) {
        // Clear previous debounce timer
        if (scrollDebounceTimer) {
          clearTimeout(scrollDebounceTimer);
        }

        // Wait for scroll to stop (1s debounce)
        scrollDebounceTimer = setTimeout(() => {
          lastScrollPos = currentScroll;
          console.log('[DS][trigger] type=PDF_SCROLL (debounced) ts=' + Date.now());
          captureFrame({ captureReason: 'student_drawing' }); // Use HIGH priority for scroll
        }, 1000);
      }
    };

    containerRef.current.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      containerRef.current?.removeEventListener('scroll', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.source]); // captureFrame is stable, no need to recreate scroll handler

  // --- Drawing Handlers (World Coordinates) ---
  // --- Drawing Handlers (World Coordinates) ---
  // 🖐️ Phase 51: Switch to Pointer Events for Pressure
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // console.log('[DRAW] PointerDown', { tool: activeTool, x: e.clientX, y: e.clientY, p: e.pressure });
    if (activeTool === 'pointer' || lifecycle !== 'ready') {
      return;
    }

    e.preventDefault(); // Prevent scrolling when drawing
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const rect = contentRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert to World
    const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);
    // Add Pressure (default to 0.5 if not available/mouse)
    const pressure = e.pressure !== 0.5 ? e.pressure : (e.pointerType === 'pen' ? e.pressure : 0.5);

    // Text Tool Handler
    if (activeTool === 'text') {
      // Only allow one text input at a time
      if (textInput) return; // Or commit previous

      const maxWidth = Math.max(200, viewport.width - worldP.x - 20); // 20px padding
      setTextInput({
        x: e.clientX,
        y: e.clientY,
        visible: true,
        worldP: worldP,
        maxWidth: maxWidth
      });
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    const newStroke: Stroke = {
      id: crypto.randomUUID(),
      author: 'user',
      tool: activeTool as any,
      path: [{ ...worldP, p: pressure }],
      color: activeColor,
      width: activeTool === 'eraser' ? 40 : activeWidth, // Use activeWidth
    };
    setCurrentStroke(newStroke);
  }, [activeTool, lifecycle, viewport, activeColor, activeWidth, textInput]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();

    const rect = contentRef.current!.getBoundingClientRect();

    // ✅ Mobile Pen Fix: Use coalesced events for high-fidelity input
    // The browser batches multiple pointer samples between animation frames.
    // getCoalescedEvents() exposes all of them for smooth, unaliased strokes.
    const events = (e.nativeEvent as any).getCoalescedEvents?.() || [e.nativeEvent];
    const newPoints: { x: number; y: number; p?: number }[] = [];

    for (const ce of events) {
      const screenX = ce.clientX - rect.left;
      const screenY = ce.clientY - rect.top;
      const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);
      const pressure = ce.pressure;
      newPoints.push({ ...worldP, p: pressure });
    }

    setCurrentStroke(prev => prev ? { ...prev, path: [...prev.path, ...newPoints] } : null);
  }, [isDrawing, currentStroke, viewport]);

  // --- Viewport Scaling Logic ---
  const zoomIn = () => setViewport({ scale: Math.min(3, viewport.scale + 0.25) });
  const zoomOut = () => setViewport({ scale: Math.max(0.5, viewport.scale - 0.25) });

  // --- Snapshot Composition (Vision Pipeline) ---
  const captureFrame = useCallback((metadataOverride?: any) => {
    const isRescue = metadataOverride?.isRescue === true;
    const forceSend = metadataOverride?.forceSend === true;
    const now = Date.now();
    visionFrameIdRef.current++;
    const currentFrameId = visionFrameIdRef.current;

    if (!containerRef.current) {
      console.warn(`[DS][captureFrame][ABORT] reason=NO_CONTAINER ts=${now}`);
      return;
    }

    // 🛡️ Safety: Check for valid container dimensions to prevent Infinity/NaN errors (Code 1008)
    const rect = containerRef.current.getBoundingClientRect();
    // 🎯 CRITICAL FIX: Use getBoundingClientRect().height instead of clientHeight
    // On mobile, clientHeight returns the FULL scroll height (e.g., 144295px for 66-page PDF)
    // but we only want to capture the VISIBLE viewport height.
    // 🛡️ Round 5: Sanity check if rect.height is too large (meaning the container itself expanded)
    let visibleHeight = rect.height;
    if (visibleHeight > window.innerHeight && window.innerHeight > 0) {
      console.warn(`[DS][captureFrame][SANITY] rect.height (${visibleHeight}) > innerHeight (${window.innerHeight}). Clipping to viewport.`);
      visibleHeight = window.innerHeight;
    }

    if (rect.width === 0 || visibleHeight === 0) {
      console.warn(`[DS][captureFrame][ABORT] reason=ZERO_DIMENSIONS w=${rect.width} h=${visibleHeight}`);
      return;
    }

    // Create a new canvas for capture instead of using the ref
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 🎯 Phase 100: Capture ONLY visible viewport & Cap Resolution
    // Standardizing to 1024px to perfectly match AI coordinate mapping logic.
    const TARGET_WIDTH = 1024;
    canvas.width = TARGET_WIDTH;
    canvas.height = (TARGET_WIDTH / rect.width) * visibleHeight;

    // 🛡️ Phase 100: Hard Safety Cap to further optimize large PDF/Image payloads
    const MAX_HEIGHT = 1280;
    if (canvas.height > MAX_HEIGHT) {
      console.warn(`[DS][captureFrame][Phase 100] canvas.height ${canvas.height} capped to ${MAX_HEIGHT}`);
      canvas.height = MAX_HEIGHT;
    }

    // Last Guard: Ensure calculated height is finite and positive
    if (!Number.isFinite(canvas.height) || canvas.height <= 0) {
      console.error(`[DS][captureFrame][ABORT] reason=INVALID_HEIGHT h=${canvas.height}`);
      return;
    }

    // 🔒 Security: Force clip to viewport to ensure no "full document" leakage
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();

    ctx.fillStyle = '#0f172a'; // bg-slate-900
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = canvas.width / rect.width;

    // 1. Draw Content Layer (PDF, Screen, or Board background)
    if (state.source === 'screen' && videoRef.current) {
      ctx.save();
      ctx.scale(scale, scale);
      const v = videoRef.current;
      const vRect = v.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();
      ctx.drawImage(v, vRect.left - cRect.left, vRect.top - cRect.top, vRect.width, vRect.height);
      ctx.restore();

      // 🎯 Phase 52: Image Capture Support (Priority over PDF to prevent "0 pages" error)
    } else if (state.source === 'pdf' && (imageUrl || (pdfFile && (pdfFile.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(pdfFile.name))))) {
      const img = imageRef.current;

      // 🛡️ Round 10: Block capture if image is detected but not ready
      if (!imageUrl || !img || !img.complete || img.naturalWidth === 0) {
        console.debug(`[DS][captureFrame] Blocking image capture: imageUrl=${!!imageUrl} complete=${img?.complete} ts=${Date.now()}`);
        return;
      }

      if (containerRef.current) {
        try {
          const imgRect = img.getBoundingClientRect();
          const cRect = containerRef.current.getBoundingClientRect();

          // Calculate visible portion
          const visibleLeft = Math.max(imgRect.left, cRect.left);
          const visibleTop = Math.max(imgRect.top, cRect.top);
          const visibleRight = Math.min(imgRect.right, cRect.right);
          const visibleBottom = Math.min(imgRect.bottom, cRect.bottom);

          if (visibleRight > visibleLeft && visibleBottom > visibleTop) {
            // Source Rect (Image Coords)
            // We need to map screen pixels back to natural image pixels
            const displayWidth = imgRect.width;
            const displayHeight = imgRect.height;

            const scaleX = img.naturalWidth / displayWidth;
            const scaleY = img.naturalHeight / displayHeight;

            const sourceX = (visibleLeft - imgRect.left) * scaleX;
            const sourceY = (visibleTop - imgRect.top) * scaleY;
            const sourceW = (visibleRight - visibleLeft) * scaleX;
            const sourceH = (visibleBottom - visibleTop) * scaleY;

            // Dest Rect (Canvas Coords)
            const destX = (visibleLeft - cRect.left) * scale;
            const destY = (visibleTop - cRect.top) * scale;
            const destW = (visibleRight - visibleLeft) * scale;
            const destH = (visibleBottom - visibleTop) * scale;

            ctx.drawImage(
              img,
              sourceX, sourceY, sourceW, sourceH, // Crop from natural image
              destX, destY, destW, destH          // Draw to canvas
            );
          }
        } catch (err) {
          console.error('[DS][captureFrame] Image capture failed:', err);
        }
      }

    } else if (state.source === 'pdf' && contentRef.current) {
      // 🎯 Phase 47: Viewport-Aware PDF Capture
      // Only capture the PDF content that is actually visible in the viewport,
      // not the full-resolution PDF pages. This reduces payload size and prevents Code 1008 crashes.
      try {
        const contRect = containerRef.current.getBoundingClientRect();

        // 1. Fill background (PDFs are usually on grey/white)
        ctx.fillStyle = '#64748b'; // slate-500 background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Iterate ALL possible page canvases using ROBUST selector matching PdfPage.tsx
        const pdfCanvases = contentRef.current.querySelectorAll('.pdf-page-canvas');
        console.debug(`[DS][captureFrame] Found ${pdfCanvases.length} PDF canvases`);

        ctx.save();

        let drawnCount = 0;
        pdfCanvases.forEach((pdfCanvas) => {
          if (!(pdfCanvas instanceof HTMLCanvasElement)) return;

          const cRect = pdfCanvas.getBoundingClientRect();

          // Check intersection with visible viewport
          const isVisible = (
            cRect.bottom > contRect.top &&
            cRect.top < contRect.bottom &&
            cRect.right > contRect.left &&
            cRect.left < contRect.right
          );

          if (isVisible) {
            drawnCount++;

            // 🎯 VIEWPORT CLIPPING: Calculate visible intersection rect
            const visibleLeft = Math.max(cRect.left, contRect.left);
            const visibleTop = Math.max(cRect.top, contRect.top);
            const visibleRight = Math.min(cRect.right, contRect.right);
            const visibleBottom = Math.min(cRect.bottom, contRect.bottom);

            // Calculate source rectangle (crop from PDF canvas)
            const sourceX = (visibleLeft - cRect.left) / cRect.width * pdfCanvas.width;
            const sourceY = (visibleTop - cRect.top) / cRect.height * pdfCanvas.height;
            const sourceW = (visibleRight - visibleLeft) / cRect.width * pdfCanvas.width;
            const sourceH = (visibleBottom - visibleTop) / cRect.height * pdfCanvas.height;

            // Calculate destination rectangle (position in capture canvas)
            const destX = (visibleLeft - contRect.left) * scale;
            const destY = (visibleTop - contRect.top) * scale;
            const destW = (visibleRight - visibleLeft) * scale;
            const destH = (visibleBottom - visibleTop) * scale;

            try {
              // Draw only the visible portion of the PDF page
              ctx.drawImage(
                pdfCanvas,
                sourceX, sourceY, sourceW, sourceH,  // Source rect (crop)
                destX, destY, destW, destH           // Dest rect (position)
              );
            } catch (drawErr) {
              console.warn('[DS][captureFrame] Failed to draw PDF page canvas', drawErr);
            }
          }
        });
        ctx.restore();
        console.debug(`[DS][captureFrame] Composed ${drawnCount}/${pdfCanvases.length} visible PDF pages`);

      } catch (err) {
        console.error('[DS][captureFrame] PDF composite capture failed:', err);
      }
      // 🎯 Phase 52: Image Capture Support
    } else if (state.source === 'pdf' && imageUrl) {
      const img = imageRef.current;
      if (img && img.complete && img.naturalWidth > 0 && containerRef.current) {
        try {
          const imgRect = img.getBoundingClientRect();
          const cRect = containerRef.current.getBoundingClientRect();

          // Calculate visible portion
          const visibleLeft = Math.max(imgRect.left, cRect.left);
          const visibleTop = Math.max(imgRect.top, cRect.top);
          const visibleRight = Math.min(imgRect.right, cRect.right);
          const visibleBottom = Math.min(imgRect.bottom, cRect.bottom);

          if (visibleRight > visibleLeft && visibleBottom > visibleTop) {
            // Source Rect (Image Coords)
            // We need to map screen pixels back to natural image pixels
            const displayWidth = imgRect.width;
            const displayHeight = imgRect.height;

            const scaleX = img.naturalWidth / displayWidth;
            const scaleY = img.naturalHeight / displayHeight;

            const sourceX = (visibleLeft - imgRect.left) * scaleX;
            const sourceY = (visibleTop - imgRect.top) * scaleY;
            const sourceW = (visibleRight - visibleLeft) * scaleX;
            const sourceH = (visibleBottom - visibleTop) * scaleY;

            // Dest Rect (Canvas Coords)
            const destX = (visibleLeft - cRect.left) * scale;
            const destY = (visibleTop - cRect.top) * scale;
            const destW = (visibleRight - visibleLeft) * scale;
            const destH = (visibleBottom - visibleTop) * scale;

            ctx.drawImage(
              img,
              sourceX, sourceY, sourceW, sourceH, // Crop from natural image
              destX, destY, destW, destH          // Draw to canvas
            );
          }
        } catch (err) {
          console.error('[DS][captureFrame] Image capture failed:', err);
        }
      }
    }

    // 2. Draw Teacher Overlay (The User's Drawings)
    // 🎯 Fix: Use ID selector to avoid grabbing PDF page canvases which also have 'pointer-events-none'
    // 🎯 Use ID selector to avoid grabbing PDF page canvases which also have 'pointer-events-none'
    // 🎯 UPDATE: Support Tiled Overlays (chunks)
    const overlayCanvas = contentRef.current?.querySelector('#teacher-overlay-canvas'); // Legacy check
    const chunkCanvases = contentRef.current?.querySelectorAll('.teacher-overlay-chunk');

    // 🎯 CRITICAL FIX: Overlay can be HUGE (e.g., 54,912px for 66-page PDF) and scrolled off-screen.
    // We need to use source rectangles to CROP the overlay to only the visible portion.
    const cRect = containerRef.current.getBoundingClientRect();

    // Check for NEW Tiled Implementation
    if (chunkCanvases && chunkCanvases.length > 0) {
      chunkCanvases.forEach((chunk: HTMLCanvasElement) => {
        // Get Chunk Position (Relative to Content Container)
        // The chunks are positioned absolute with 'top' style.
        const topStyle = chunk.style.top || '0px';
        const chunkY = parseInt(topStyle, 10); // Not used directly, relying on getBoundingClientRect()

        // Chunk Rect (Screen Coordinates) calculation
        // Since the chunk is inside contentRef which is transformed, getBoundingClientRect() is reliable.
        const chunkRect = chunk.getBoundingClientRect();

        // Safety Check
        if (chunkRect.width <= 0 || chunkRect.height <= 0) return;

        // Check Visibility (Screen Space Intersection)
        const visibleWidth = Math.min(chunkRect.width, cRect.width, Math.max(0, chunkRect.right - cRect.left), Math.max(0, cRect.right - chunkRect.left));
        const visibleHeight = Math.min(chunkRect.height, cRect.height, Math.max(0, chunkRect.bottom - cRect.top), Math.max(0, cRect.bottom - chunkRect.top));

        if (visibleWidth > 0 && visibleHeight > 0) {
          // Calculate Offsets
          // Screen space offset of the chunk relative to the container view
          const drawScreenX = Math.max(0, chunkRect.left - cRect.left);
          const drawScreenY = Math.max(0, chunkRect.top - cRect.top);

          // Source Crop Calculation
          const scaleX = chunk.width / chunkRect.width;
          const scaleY = chunk.height / chunkRect.height;

          // Offset in Screen Pixels from the top-left of the chunk
          const deltaX = Math.max(0, cRect.left - chunkRect.left);
          const deltaY = Math.max(0, cRect.top - chunkRect.top);

          const sourceX = deltaX * scaleX;
          const sourceY = deltaY * scaleY;

          // Destination on Final Capture Canvas (Screen Scaled)
          const destX = drawScreenX * scale;
          const destY = drawScreenY * scale;

          try {
            ctx.drawImage(
              chunk,
              sourceX, sourceY, (visibleWidth * scaleX), (visibleHeight * scaleY), // Source Rect
              destX, destY, visibleWidth * scale, visibleHeight * scale
            );
          } catch (err) {
            // Ignore form errors
          }
        }
      });
    } else if (overlayCanvas instanceof HTMLCanvasElement) {
      // 🎯 Fix: Draw overlay at correct screen position relative to container (handles scroll)
      const oRect = overlayCanvas.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();

      // 🎯 CRITICAL FIX: Overlay can be HUGE (e.g., 54,912px for 66-page PDF) and scrolled off-screen.
      // We need to use source rectangles to CROP the overlay to only the visible portion.

      // Calculate which part of the overlay canvas is actually visible
      // Calculate which part of the overlay canvas is actually visible (Screen Coordinates)
      const overlayOffsetX = Math.max(0, cRect.left - oRect.left);
      const overlayOffsetY = Math.max(0, cRect.top - oRect.top);

      // 🎯 CRITICAL FIX: Handle Zoom/DPI Scaling & Safety Check
      // Only proceed if overlay has valid dimensions (prevent div-by-zero)
      if (oRect.width > 0 && oRect.height > 0) {

        // oRect is in Screen Pixels (Zoomed). overlayCanvas is in Source Pixels (Unzoomed).
        // We must convert the Screen Offsets to Source Canvas Coordinates.
        const scaleX = overlayCanvas.width / oRect.width;
        const scaleY = overlayCanvas.height / oRect.height;

        // Convert Screen Offsets -> Source Coordinates
        const sourceX = overlayOffsetX * scaleX;
        const sourceY = overlayOffsetY * scaleY;

        // Calculate Visible Width in Source Coordinates
        const visibleWidth = Math.min(overlayCanvas.width - sourceX, cRect.width * scaleX);
        const visibleHeight = Math.min(overlayCanvas.height - sourceY, cRect.height * scaleY);

        // Only proceed if visible dimensions are valid
        if (visibleWidth > 0 && visibleHeight > 0) {
          try {
            // 🛡️ CRITICAL: Do NOT apply ctx.scale() here!
            // Destination coordinates are already in screen pixels (scaled by quality).
            ctx.drawImage(
              overlayCanvas,
              sourceX, sourceY, visibleWidth, visibleHeight,  // Source rect (Correctly Scaled)
              Math.max(0, (oRect.left - cRect.left) * scale), // Dest X (Screen Relative)
              Math.max(0, (oRect.top - cRect.top) * scale),   // Dest Y (Screen Relative)
              visibleWidth / scaleX * scale,                  // Dest W (Convert back to Screen -> apply Quality Scale)
              visibleHeight / scaleY * scale                  // Dest H (Convert back to Screen -> apply Quality Scale)
            );
          } catch (err) {
            console.error('[DS][captureFrame] Overlay drawImage failed:', err, {
              sourceX, sourceY,
              visibleWidth, visibleHeight,
              scaleX, scaleY
            });
          }
        }
      }
    }

    // 🎯 Phase 44 & Phase 100: Optimized quality settings (Balanced for high-load modes)
    // board (whiteboard) = 0.35 → Phase 100: Increased from 0.1 for high-def pencil recognition
    // screen = 0.1 → Fast enough for movement
    // pdf/image = 0.35 → Phase 100: Reduced from 0.45 to optimize for speed
    const quality = state.source === 'board' ? 0.1 : state.source === 'screen' ? 0.1 : 0.1;
    const base64 = canvas.toDataURL('image/jpeg', quality);

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

    // ✅ Embed capture dimensions in metadata so liveSessionService can map AI screenshot coords→world coords
    // 🎯 Use containerRef to guarantee exactly the dynamic size used on the current screen (mobile/desktop/resized)
    const exactViewport = {
      ...state.viewport,
      width: containerRef.current.clientWidth || state.viewport.width,
      height: containerRef.current.clientHeight || state.viewport.height,
    };

    const metadata = {
      viewport: exactViewport,
      visibleRects: state.visibleRects,
      source: state.source,
      pageCount: pageCount,
      timestamp: now,
      frameId: currentFrameId,
      captureWidth: canvas.width,
      captureHeight: canvas.height,
      ...metadataOverride
    };

    console.log(`[DS][captureFrame] id=${currentFrameId} source=${state.source} pages=${pageCount} rescue=${isRescue} aiState=${aiState} size=${canvas.width}x${canvas.height} viewport=${exactViewport.width}x${exactViewport.height} ts=${now}`);

    lastCaptureTimeRef.current = now; // 🎯 Phase 49: Update throttle ref for all capture paths
    if (onFrameCapture) onFrameCapture(base64, { ...metadata, forceSend });
  }, [state.source, state.viewport, state.visibleRects, pageCount, setSnapshot, onFrameCapture, aiState]);

  // --- Mouse Up Handler (After captureFrame) ---
  // --- Pointer Up Handler (After captureFrame) ---
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDrawing && currentStroke) {
      addStroke(currentStroke);
      // console.log('[DRAW] Adding stroke', currentStroke);

      // 🎯 Fix: Defer capture to allow React to render the new stroke to the DOM
      setTimeout(() => {
        // console.log('[DRAW] Triggering capture with reason=student_drawing');
        captureFrame({ captureReason: 'student_drawing' });
      }, 0);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, [isDrawing, currentStroke, addStroke, captureFrame]);



  // 🎯 Phase 48: Track viewport changes for smart PDF throttling
  const lastViewportRef = useRef({ scrollX: 0, scrollY: 0 });

  useEffect(() => {
    // 🎯 Phase 49: Reduced screen interval (3.5s) for better interactivity
    const INTERVAL_MS = state.source === 'screen' ? 3500 : 10000; // Slower periodic captures for Board/PDF (10s)

    const interval = setInterval(() => {
      // ⚖️ Phase 16.2: Strict Inter-Turn Gate
      // 🔒 Phase 22: Stop all captures if session is CLOSED
      // 🔒 Phase 42: Block 'IDLE' to prevent "Session Not Open" frame drops at startup
      const isAIActive = isGenerating || (aiState as string) === 'THINKING' || (aiState as string) === 'EXPLAINING';
      const isSessionDead = !isActive || lifecycle !== 'ready' || (aiState as string) === 'IDLE' || (aiState as string) === 'DISCONNECTED';

      // 🎯 Phase 49: Relaxed Vision Gate (Blind Spot Removal)
      // We no longer block periodic captures while the AI is active for screen/pdf/board.
      // This allows the AI to "see" what the user is doing while it's talking.
      // 🧊 Phase 26: Unblock the very first frame even if AI is active
      const isBlindSpotProtected = (state.source === 'screen' || state.source === 'pdf' || state.source === 'board');

      if (isSessionDead || isDrawing || (!isBlindSpotProtected && isAIActive && hasCapturedFirstFrame)) {
        if (isSessionDead && lifecycle !== 'idle') {
          console.debug(`[DS][gate] capture suppressed: sessionDead=${isSessionDead} ts=${Date.now()}`);
        }
        return;
      }

      // 🎯 Phase 48: For PDF, check viewport change before capturing
      if (state.source === 'pdf' && containerRef.current) {
        const container = containerRef.current;
        const viewportChanged =
          container.scrollLeft !== lastViewportRef.current.scrollX ||
          container.scrollTop !== lastViewportRef.current.scrollY;

        if (!viewportChanged) {
          console.debug('[DS][trigger] SKIPPED (PDF viewport unchanged) ts=' + Date.now());
          return;
        }

        lastViewportRef.current = {
          scrollX: container.scrollLeft,
          scrollY: container.scrollTop
        };
      }

      // 🎯 Phase 39: Force screen frame every 5s if in screen mode (Bypass dedup)
      let forceSend = false;
      const now = Date.now();
      if (state.source === 'screen' && now - lastScreenForceSendTimeRef.current > 5000) {
        forceSend = true;
        lastScreenForceSendTimeRef.current = now;
        console.debug('[DS][trigger] Forcing screen frame update (timer)');
      }

      console.debug(`[DS][trigger] type=INTERVAL lifecycle=${lifecycle} ts=${now}`);
      captureFrame({ forceSend });
    }, INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lifecycle, isGenerating, aiState, isDrawing, captureFrame, state.source, hasCapturedFirstFrame]);

  // 🧊 Phase 15 & 38: Intelligent Triggers - IMMEDIATE on source change, throttled otherwise
  const prevSourceRef = useRef<BoardSource>('board');
  const prevAiStateRef = useRef<string>('IDLE'); // 🎯 Track previous AI state

  // 🎯 Phase 42: Trigger immediate capture when session connects (IDLE -> LISTENING)
  useEffect(() => {
    const currentAiState = aiState as string;
    if (prevAiStateRef.current === 'IDLE' && (currentAiState === 'LISTENING' || currentAiState === 'SPEAKING')) {
      console.log('[DS][trigger] Session Connected - Forcing Immediate Capture');
      captureFrame({ forceSend: true });
    }
    prevAiStateRef.current = currentAiState;
  }, [aiState, captureFrame]);

  useEffect(() => {
    // 🎯 Phase 48: Skip STATE_CHANGE for PDF (AI state doesn't affect PDF content)
    // 🛡️ Round 5: But allow source transitions (board -> pdf) to trigger an immediate frame
    if (state.source === 'pdf' && prevSourceRef.current === 'pdf') {
      return; // Don't capture on viewport/state changes for PDF if already in PDF mode
    }

    // 🎯 Phase 49: Trigger on Source/State Change
    if (lifecycle === 'ready' && (state.source === 'screen' || state.source === 'pdf')) {
      // ⚖️ Phase 16.2: Strict Inter-Turn Gate
      const isAIActive = isGenerating || aiState === 'THINKING' || aiState === 'EXPLAINING';
      const isBlindSpotProtected = (state.source === 'screen' || state.source === 'pdf');

      if (!isBlindSpotProtected && isAIActive && hasCapturedFirstFrame) return; // 🧊 Phase 26: First frame unblocked

      const now = Date.now();
      const timeSinceLastCapture = now - lastCaptureTimeRef.current;
      const sourceChanged = prevSourceRef.current !== state.source;

      // 🎯 Phase 38: BYPASS throttle if source changed (mode switch = immediate)
      if (!sourceChanged && timeSinceLastCapture < 3000) {
        console.log(`[DS][trigger] THROTTLED (${timeSinceLastCapture}ms < 3000ms)`);
        return;
      }

      // Update previous source
      prevSourceRef.current = state.source;

      // 🎯 Phase 100: Increase delay for PDF mode to avoid bursting during rapid scrolls
      const delay = (state.source === 'pdf' && !sourceChanged) ? 300 : sourceChanged ? 100 : 500;

      const t = setTimeout(() => {
        console.log(`[DS][trigger][Phase 100] type=STATE_CHANGE source=${state.source} aiState=${aiState} sourceChanged=${sourceChanged} delay=${delay}ms ts=${now}`);
        captureFrame({ forceSend: sourceChanged });
      }, delay);
      return () => clearTimeout(t);
    }
  }, [lifecycle, state.source, pageCount, state.viewport.scale, state.viewport.offsetX, state.viewport.offsetY, captureFrame, isGenerating, aiState, hasCapturedFirstFrame, imageUrl]);

  // --- 🎯 Round 15: Non-Passive Touch Listeners for Mobile Stability ---
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      console.log('[DS][TouchStart] touches=' + e.touches.length + ' tool=' + activeTool + ' lifecycle=' + lifecycle);
      if (activeTool === 'pointer' || lifecycle !== 'ready' || e.touches.length > 1) return;

      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;
      const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);

      setIsDrawing(true);
      setCurrentStroke({
        id: crypto.randomUUID(),
        author: 'user',
        tool: activeTool as any,
        path: [worldP],
        color: activeColor,
        width: activeTool === 'eraser' ? 40 : 3
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDrawing || e.touches.length > 1) return;

      // 🛡️ LOCK SCROLLING: Crucial for drawing stability
      if (activeTool !== 'pointer') {
        console.log('[DS][TouchMove] PREVENT DEFAULT (Drawing)');
        e.preventDefault();
      } else {
        console.log('[DS][TouchMove] ALLOW DEFAULT (Scrolling)');
      }

      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;
      const worldP = BoardEngine.screenToWorld(screenX, screenY, viewport);

      setCurrentStroke(prev => prev ? { ...prev, path: [...prev.path, worldP] } : null);
    };

    const onTouchEnd = () => {
      setCurrentStroke(prev => {
        if (prev && prev.path.length > 1) {
          addStroke(prev);
          setTimeout(() => captureFrame({ captureReason: 'student_drawing' }), 0);
        }
        return null;
      });
      setIsDrawing(false);
    };

    // Attach with passive: false to allow preventDefault()
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeTool, lifecycle, viewport, activeColor, isDrawing, addStroke, captureFrame]);

  // --- Stale Touch Handlers Removed ---

  return (
    <div className="relative w-full h-full bg-slate-50">

      {!isActive && (
        <WakeUpScreen onStart={onStartSession || (() => { })} />
      )}

      <div
        ref={containerRef}
        className="relative w-full h-full overflow-auto bg-white border border-slate-200 rounded-lg flex justify-start md:justify-center"
        style={{ touchAction: activeTool === 'pointer' ? 'auto' : 'none' }}
      >
        {/* THE BOARD SURFACE */}
        {/* THE BOARD SURFACE */}
        <div
          ref={contentRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative transition-transform duration-300 ease-out origin-top-left"
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

          {/* ... PDF Logic (Implicitly covered by existing code) ... */}

          {/* 📝 Text Input Overlay */}
          {textInput && (
            <textarea
              ref={textInputRef}
              className="absolute z-[60] bg-transparent border border-blue-400/30 rounded p-1 outline-none resize-none overflow-hidden font-sans font-bold shadow-lg"
              style={{
                left: textInput.worldP.x,
                top: textInput.worldP.y,
                width: 'auto',
                minWidth: '120px',
                maxWidth: `${textInput.maxWidth}px`,
                fontSize: '24px',
                lineHeight: '1.2',
                color: activeColor,
                backgroundColor: 'rgba(255,255,255,0.05)'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
              autoFocus
              onBlur={(e) => {
                if (e.target.value.trim()) {
                  const newStroke: Stroke = {
                    id: crypto.randomUUID(),
                    author: 'user',
                    tool: 'text',
                    path: [{ x: textInput.worldP.x, y: textInput.worldP.y, p: 0.5 }],
                    color: activeColor,
                    width: 24,
                    text: e.target.value.trim(),
                    textMaxWidth: textInput.maxWidth
                  };
                  addStroke(newStroke);
                  setTimeout(() => captureFrame({ captureReason: 'text_input' }), 100);
                }
                setTextInput(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          )}

          {state.source === 'pdf' && !imageUrl && (
            <div ref={pdfContainerRef} className="w-full flex flex-col items-center">
              {Array.from({ length: pageCount }).map((_, i) => {
                const pageNum = i + 1;
                // 🎯 Phase 43: Virtualization / Lazy Loading
                // Only render pages that are known to be visible (or neighbors) 
                // We use a +/- 2 page buffer around the currently visible set to allow smooth scrolling
                let shouldRender = false;

                if (renderedPages.size === 0) {
                  // Initial load: render first 3 pages
                  shouldRender = pageNum <= 3;
                } else {
                  // Check if page is in visible set or adjacent
                  for (const visiblePage of renderedPages) {
                    if (Math.abs(pageNum - visiblePage) <= 2) {
                      shouldRender = true;
                      break;
                    }
                  }
                }

                return (
                  <PdfPage
                    key={pageNum}
                    pageNum={pageNum}
                    doc={pdfDoc}
                    isVisible={shouldRender}
                  />
                );
              })}
            </div>
          )}



          {state.source === 'pdf' && imageUrl && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Document"
                className="max-w-full max-h-full object-contain shadow-lg"
                onLoad={(e) => {
                  // 🎯 Phase 42: Auto-fit image once loaded
                  const img = e.currentTarget;
                  if (containerRef.current) {
                    const containerWidth = containerRef.current.clientWidth;
                    // Use natural dimensions but cap scale to fit
                    const scale = Math.min(1, (containerWidth - 40) / img.naturalWidth);
                    setViewport({
                      scale: scale,
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      offsetX: 0,
                      offsetY: 0
                    });

                    // 🎯 Phase 52: Trigger immediate capture now that image is ready
                    console.log('[DS][image] Load complete - triggering capture');
                    setTimeout(() => captureFrame({ forceSend: true }), 200);
                  }
                }}
              />
            </div>
          )}

          {/* 🎨 DRAWING LAYER - MUST BE CHILD OF contentRef FOR CAPTURE */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <TeacherOverlay
              actions={currentStroke ? [...strokes, currentStroke] : strokes}
              width={state.source === 'pdf' ? (contentRef.current?.offsetWidth || viewport.width) : viewport.width}
              height={state.source === 'pdf' ? (contentRef.current?.offsetHeight || viewport.height) : viewport.height}
            />
          </div>
        </div>
        {/* END contentRef */}
      </div>

      {/* SNAPSHOT UTILITY (Hidden) */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* CONTROLS (Only visible when ACTIVE) */}
      {isActive && (
        <div className="absolute top-4 right-4 z-[70] flex flex-col space-y-2">
          <div className="flex items-center space-x-2 bg-slate-800/80 backdrop-blur rounded-lg p-1.5 border border-slate-700 shadow-lg">
            <button onClick={zoomOut} className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 rounded transition-colors">-</button>
            <span className="text-white text-xs font-mono min-w-[3ch] text-center">{Math.round(viewport.scale * 100)}%</span>
            <button onClick={zoomIn} className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 rounded transition-colors">+</button>
          </div>
        </div>
      )}

      {/* STATUS OVERLAYS */}
      {lifecycle === 'loading' && isActive && (
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