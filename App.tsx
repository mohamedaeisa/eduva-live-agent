import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LiveSessionService } from './services/liveSessionService';
import DocumentStage from './components/DocumentStage';
import CompactSidebar from './components/CompactSidebar';
import RichNotebook from './components/RichNotebook';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { SessionStatus } from './components/SessionStatus';
import { Atom, DrawingAction, TeacherState, SessionConfig, NoteData, QuickAction, Stroke } from './types';
import { API_KEY, MODELS, VOICE_OPTIONS, GET_SYSTEM_INSTRUCTION, SUPPORTED_LANGUAGES } from './constants';
import { GoogleGenAI } from '@google/genai';
import { BoardProvider, useBoard } from './context/BoardProvider';

// Icons
const Icons = {
  Mic: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
  MicOff: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>,
  Stop: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Note: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Export: ({ className }: { className?: string }) => <svg className={className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  Settings: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Plus: ({ className }: { className?: string }) => <svg className={className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Minus: ({ className }: { className?: string }) => <svg className={className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>,
  Close: ({ className }: { className?: string }) => <svg className={className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  // Drawing Tools Icons
  Pointer: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
  Pen: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
  Circle: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>, // Shield for circle for now or just circle
  Arrow: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
  Eraser: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}><path d="M11 11L15.5 15.5M20 14L14 20M4 14L14 4M7 17L17 7M20 7L17 4M7 20L4 17" /></svg>,
  Trash: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Screen: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  PDF: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Board: ({ className }: { className?: string }) => <svg className={className || "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v2m-3-2v1m6-1v1" /></svg>,
  Text: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>,
  Home: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  Zap: ({ isAmber, className }: { isAmber?: boolean; className?: string }) => (
    <svg className={className || `w-8 h-8 ${isAmber ? 'text-amber-500' : 'text-blue-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Play: ({ className }: { className?: string }) => <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "Could you repeat?", prompt: "Please repeat that last part." },
  { label: "Explain simpler", prompt: "Explain that again, but simpler." },
];

const NOTES_STORAGE_KEY = 'eduva_notes';

// 📊 Phase 25: Vision Mode Trace Overlay
const VisionAck = ({ state }: { state: string }) => {
  const isVisual = state === 'VISUAL_MODE';
  const isClosed = state === 'SESSION_CLOSED';
  const label = state === 'VISUAL_MODE' ? 'VISUAL MODE' : state === 'CONVERSATION_MODE' ? 'CONVERSATION MODE' : 'SESSION CLOSED';
  const bg = isVisual ? '#16a34a' : isClosed ? '#334155' : '#ffffff';
  const color = (isVisual || isClosed) ? 'white' : '#0f172a';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: '8px 14px',
        background: bg,
        color: color,
        fontSize: '11px',
        fontWeight: 'bold',
        borderRadius: '8px',
        zIndex: 9999,
        fontFamily: 'monospace',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        border: isClosed ? '1px solid rgba(255,255,255,0.1)' : 'none',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isClosed ? '#94a3b8' : isVisual ? '#4ade80' : '#3b82f6' }} />
      {label}
    </div>
  );
};

interface AppProps {
  user?: { firstName?: string; displayName?: string; name?: string };
}

function AppContent({ user }: AppProps) {
  const { state: boardState, setSource, setLifecycle, addStroke, clearStrokes } = useBoard();
  const [state, setState] = useState<TeacherState>(TeacherState.IDLE);
  const [screenStream, setScreenStream] = useState<MediaStream | undefined>(undefined);
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [notes, setNotes] = useState<NoteData[]>([]);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(API_KEY);
  const [vState, setVState] = useState<string>('SESSION_CLOSED'); // 📊 Phase 24
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
    voiceName: 'Zephyr',
    language: 'English',
    persona: 'Supportive',
    studentName: user?.firstName || user?.displayName || user?.name // Injected Name
  });

  // Tools State
  const [activeTool, setActiveTool] = useState<'pointer' | 'pen' | 'circle' | 'arrow' | 'eraser' | 'text'>('pointer');
  const [activeColor, setActiveColor] = useState('#ef4444'); // Default red

  // Dynamic Actions State
  const [quickActions, setQuickActions] = useState<QuickAction[]>(DEFAULT_ACTIONS);

  // Notebook UI State
  const [isNotebookOpen, setIsNotebookOpen] = useState(true);
  const [notebookWidth, setNotebookWidth] = useState(320);
  const [fontSize, setFontSize] = useState(14);
  const [showClearConfirm, setShowClearConfirm] = useState(false); // 💎 Custom Modal State
  const notebookScrollRef = useRef<HTMLDivElement>(null);
  const isResizingNotebook = useRef(false);

  // Runtime State
  const [isMuted, setIsMuted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  /* --- Authority Phase 10: Single Service Owner --- */
  const liveService = useRef<LiveSessionService | null>(null);
  const [visionRescueTrigger, setVisionRescueTrigger] = useState(0); // 🛟 Phase 16.1
  if (!liveService.current) {
    liveService.current = new LiveSessionService();
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef({ top: 0, left: 0 });
  const isConnectingRef = useRef(false); // 🔒 Phase 14: StrictMode Guard
  const onStateChange = useCallback((nextState: string) => {
    setState(prev => {
      if (prev === nextState) return prev; // 🛡️ Stability: Prevent redundant state triggers
      console.log(`[APP][onState] transition=${prev} -> ${nextState} ts=${Date.now()}`);
      // 🔄 Handle non-enum transitions gracefully
      if (nextState === 'CLOSED' || nextState === 'DISCONNECTED') return TeacherState.IDLE;
      return nextState as TeacherState;
    });
    if (liveService.current) setVState(liveService.current.visionState);
  }, []);

  // 🧊 Phase 27.2: Use Refs to avoid stale closures in drawing callbacks
  const viewportRef = useRef(boardState.viewport);
  const metadataRef = useRef<any>(null);
  
  useEffect(() => {
    viewportRef.current = boardState.viewport;
    metadataRef.current = liveService.current?.getLatestVisionMetadata();
  }, [boardState.viewport]);

    const handleDrawAction = useCallback((action: DrawingAction) => {
    const v = viewportRef.current; 
    
    // 🎯 Step 1: Resolve Viewport Context (Always fetch latest to avoid stale scrollY)
    const latestMetadata = liveService.current?.getLatestVisionMetadata();
    const refV = latestMetadata?.viewport || v;
    
    // 🎯 Step 2: Translation Function (Normalized 0-1000 -> Screen -> World)
    const toWorld = (p: { x: number, y: number }) => {
      // 1. Normalized to Screen Pixels (Relative to the visible CONTAINER)
      const visibleWidth = refV.containerWidth || refV.width;
      
      // 📐 Rule: If in PDF mode, 'height' is the total document length. 
      // 0-1000 must scale against the VIEWPORT (containerHeight).
      const visibleHeight = refV.containerHeight || (refV.height > 2000 ? 800 : refV.height);

      const screenX = (p.x / 1000) * visibleWidth;
      const screenY = (p.y / 1000) * visibleHeight;
      
      // 2. Screen to World (World = (PageRelative / Scale) + Scroll - (Offset / Scale))
      const worldX = (screenX / refV.scale) + (refV.scrollX || 0) - (refV.offsetX / refV.scale);
      const worldY = (screenY / refV.scale) + (refV.scrollY || 0) - (refV.offsetY / refV.scale);
      return { x: worldX, y: worldY };
    };

    // 🎯 Step 3: Construct Path
    let path = [];
    if (action.points && action.points.length > 0) {
      path = action.points.map(toWorld);
    } else {
      path = [toWorld({ x: action.x, y: action.y })];
    }

    const newStroke: Stroke = {
      id: action.id || crypto.randomUUID(),
      author: 'ai',
      tool: (action.type === 'freehand' || action.type === 'rect') ? 'pen' : (action.type as any),
      color: action.color || '#ff0000',
      width: 4,
      path: path,
      text: action.label || (action as any).text // 🛡️ Handle 'text' field hallucination
    };

    // Handle specific shapes
    if (action.type === 'circle' && (!action.points || action.points.length === 0)) {
      const center = toWorld({ x: action.x, y: action.y });
      const radius = (action.width || 50) / 1000 * refV.width / refV.scale;
      const points = [];
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        });
      }
      newStroke.path = points;
      newStroke.tool = 'circle';
    } else if (action.type === 'arrow' && (!action.points || action.points.length <= 1)) {
      const start = toWorld({ x: action.x, y: action.y });
      const dx = (action.width || 100) / 1000 * refV.width / refV.scale;
      const dy = (action.height || 100) / 1000 * refV.height / refV.scale;
      newStroke.path = [start, { x: start.x + dx, y: start.y + dy }];
    } else if ((action.type === 'rect' || action.type === 'highlight') && (!action.points || action.points.length <= 1)) {
      const start = toWorld({ x: action.x, y: action.y });
      const dw = (action.width || 100) / 1000 * refV.width / refV.scale;
      const dh = (action.height || 50) / 1000 * refV.height / refV.scale;
      newStroke.path = [start, { x: start.x + dw, y: start.y + dh }];
    }

    addStroke(newStroke);
  }, [addStroke]);

  const handleNoteUpdate = useCallback((note: NoteData) => {
    console.debug(`[APP][onNote] title=${note.title} ts=${Date.now()}`);
    setNotes(prev => [note, ...prev]);
  }, []);

  const handleActionsUpdate = useCallback((newActions: QuickAction[]) => {
    console.log(`[APP][onActions] RECEIVED: count=${newActions.length} ts=${Date.now()}`, newActions);
    setQuickActions([...newActions, ...DEFAULT_ACTIONS]);
  }, []);

  const handleVisionRequest = useCallback(() => {
    console.log(`[APP][onVisionRequest] rescueTrigger triggered ts=${Date.now()}`);
    setVisionRescueTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    console.debug("App: Registering Service Callbacks");
    liveService.current.setCallbacks(
      handleDrawAction,
      handleNoteUpdate,
      onStateChange,
      handleActionsUpdate,
      handleVisionRequest
    );
    liveService.current.onGeneration = setIsGenerating;
  }, [handleDrawAction, handleNoteUpdate, onStateChange, handleActionsUpdate, handleVisionRequest]);

  useEffect(() => {
    // 🧊 Phase 15: Sync Source State
    liveService.current.source = boardState.source;
  }, [boardState.source]);

  // Separate effect for cleanup to avoid re-running it every time callbacks change
  useEffect(() => {
    return () => {
      const ts = liveService.current?.transportState;
      console.debug(`App: Component Unmounting (Cleanup) [Transport: ${ts}]`);
      if (ts && ts !== 'IDLE' && ts !== 'CLOSED') {
        liveService.current?.shutdown();
        setLifecycle('idle');
        setState(TeacherState.IDLE);
        setVState('SESSION_CLOSED');
      }
    };
  }, []);

  useEffect(() => {
    if (boardState.source !== 'screen' && screenStream) {
      console.debug("App: Cleaning up orphan screen stream");
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(undefined);
    }
    liveService.current.source = boardState.source;
  }, [boardState.source, screenStream]);

  const effectiveActions = useMemo(() => {
    // The list starts with AI actions (if any) followed by defaults
    let actions = [...quickActions];
    
    // Remove duplicates by label and filter out invalid actions
    const seen = new Set();
    actions = actions.filter(a => {
      if (!a || !a.label) return false;
      const label = a.label.trim();
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });

    if (!pdfFile && !screenStream && state !== TeacherState.IDLE) {
      if (!actions.some(a => a.label && a.label.includes("Quote"))) {
        actions.push({ label: "✨ Motivation", prompt: "Give me a short positive quote to motivate me before we start studying." });
      }
    }
    return actions;
  }, [quickActions, pdfFile, screenStream, state]);

  useEffect(() => {
    if (notebookScrollRef.current) {
      notebookScrollRef.current.scrollTop = notebookScrollRef.current.scrollHeight;
    }
  }, [notes, isNotebookOpen]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingNotebook.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setNotebookWidth(Math.max(250, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      isResizingNotebook.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingNotebook.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const handleStartSession = async () => {
    const now = Date.now();
    console.log(`[APP][handleStartSession] ENTER studentName=${sessionConfig.studentName} language=${sessionConfig.language} ts=${now}`);

    if (!userApiKey) {
      console.warn(`[APP][handleStartSession] ABORT: Missing API Key ts=${now}`);
      setShowSettings(true);
      return;
    }
    if (isConnectingRef.current) {
      console.warn(`[APP][handleStartSession] ABORT: Already connecting ts=${now}`);
      return;
    }
    isConnectingRef.current = true;

    try {
      console.log(`[APP][handleStartSession] Connecting to Live Service ts=${now}`);
      await liveService.current!.connect(sessionConfig, userApiKey);
      setLifecycle('ready');
      console.log(`[APP][handleStartSession] SUCCESS ts=${Date.now()}`);
    } catch (error) {
      console.error("[APP][handleStartSession] FAILED:", error);
      alert((error as Error).message || "Failed to start session");
      setState(TeacherState.IDLE);
    } finally {
      isConnectingRef.current = false;
    }
  };

  const handleToggleScreenShare = async () => {
    console.debug("App: handleToggleScreenShare", { currentStream: !!screenStream });
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(undefined);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        console.debug("App: Screen Share Stream Acquired:", stream.id);
        setScreenStream(stream);
        setSource('screen');
        setQuickActions(DEFAULT_ACTIONS); // Reset actions for new source
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(undefined);
        };
      } catch (e: any) {
        if (e.name !== 'NotAllowedError' && e.message !== 'Permission denied') {
          console.error("Screen Share cancelled", e);
          alert("Could not share screen: " + e.message);
        }
      }
    }
  };

  const handleStopSession = async () => {
    console.debug("App: handleStopSession");
    await liveService.current.shutdown();
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(undefined);
    }
    setState(TeacherState.IDLE);
    setQuickActions(DEFAULT_ACTIONS);
    setIsMuted(false);
  };

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    liveService.current.toggleMute(newMuteState);
  };

  const handleQuickAction = (prompt: string) => {
    console.debug("App: handleQuickAction", prompt);
    if (state === TeacherState.IDLE) return;
    liveService.current.sendText(prompt);
  };

  const handleExportNotes = () => {
    if (notes.length === 0) return;
    const textContent = notes.map(n =>
      `${n.title.toUpperCase()}\n${n.content}\n`
    ).join('\n-------------------\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EDUVA_Notes_${new Date().toLocaleDateString()}.txt`;
    a.click();
  };

  const handleFrameCapture = useCallback((base64: string, metadata?: any) => {
    if (liveService.current) {
      console.debug(`[APP][handleFrameCapture] id=${metadata?.frameId} len=${base64.length} rescue=${metadata?.isRescue} ts=${Date.now()}`);
      liveService.current.bufferVision(base64, metadata);
    }
  }, []);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.debug("App: handlePdfUpload");
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.debug(`App: PDF Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      setPdfFile(file);
      setSource('pdf');
      setQuickActions(DEFAULT_ACTIONS); // Reset actions for new source
    }
    // 🛡️ Reset value so re-selecting the same file triggers onChange again
    if (e.target) e.target.value = '';
  };

  const handleStageScroll = useCallback((top: number, left: number) => {
    scrollRef.current = { top, left };
  }, []);

  const handleUserDraw = (action: DrawingAction) => {
    // Legacy: unused for strokes, but kept for compatibility if needed elsewhere temporarily
  };

  const handleUploadPdf = () => {
    fileInputRef.current?.click();
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleClearDrawings = () => {
    setShowClearConfirm(true);
  };

  const performActualClear = () => {
    clearStrokes();
    setNotes([]);
    setActiveTool('pointer');
    setShowClearConfirm(false);
  };

  // Mobile State
  const [mobileMenuState, setMobileMenuState] = useState<'none' | 'tools' | 'notebook'>('none');

  // Helper to toggle mobile states exclusively
  const toggleMobileState = (target: 'tools' | 'notebook') => {
    setMobileMenuState(prev => prev === target ? 'none' : target);
  };

  const activeMobileToolColor = mobileMenuState === 'tools' ? 'text-blue-400' : 'text-slate-400';
  const activeMobileNotebookColor = mobileMenuState === 'notebook' ? 'text-blue-400' : 'text-slate-400';

  return (
    <div className="flex flex-col md:flex-row h-screen bg-eduva-900 text-white overflow-hidden font-sans">

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <div className="hidden md:block">
        <CompactSidebar
          mode={boardState.source}
          setMode={setSource}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          activeColor={activeColor}
          setActiveColor={setActiveColor}
          screenStream={screenStream}
          pdfFile={pdfFile}
          state={state}
          onToggleScreenShare={() => { if (state === TeacherState.IDLE) setSource('screen'); else handleToggleScreenShare(); }}
          onUploadPdf={handleUploadPdf}
          onClearDrawings={handleClearDrawings}
        />
      </div>

      {/* Mobile Tools Sheet (Reusing CompactSidebar with mobile styles) */}
      <div className={`md:hidden fixed bottom-16 left-0 right-0 z-40 transform transition-transform duration-300 ease-in-out bg-eduva-800 rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.5)] border-t border-eduva-700 ${mobileMenuState === 'tools' ? 'translate-y-0' : 'translate-y-[150%]'}`}>
        <div className="p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">Drawing Tools</h3>
          <div className="flex justify-around items-center">
            {/* Quick Access to Tools in Horizontal Layout */}
            {[
              { id: 'pointer', icon: Icons.Pointer },
              { id: 'pen', icon: Icons.Pen },
              { id: 'text', icon: Icons.Text },
              { id: 'circle', icon: Icons.Circle },
              { id: 'arrow', icon: Icons.Arrow },
              { id: 'eraser', icon: Icons.Eraser }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id as any)}
                className={`p-3 rounded-xl transition-all ${activeTool === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-eduva-700/50 text-slate-400'}`}
              >
                <t.icon />
              </button>
            ))}
            {/* Color Picker Minimal */}
            <input
              type="color"
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-600"
            />
          </div>
          <div className="mt-6 flex justify-between border-t border-eduva-700 pt-4">
            <button
              onClick={handleClearDrawings}
              className="flex items-center space-x-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-200 border border-red-500/20 shadow-lg shadow-red-950/10"
            >
              <Icons.Trash />
              <span>Clear Canvas</span>
            </button>
            <button onClick={() => setMobileMenuState('none')} className="text-slate-400 text-xs font-bold uppercase hover:text-white px-2 py-1">Close</button>
          </div>
        </div>
      </div>

      {/* Hidden File Input for Upload */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handlePdfUpload} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 order-first md:order-last pb-16 md:pb-0">
        <header className="h-12 border-b border-eduva-700 flex items-center justify-between px-4 bg-eduva-800/80 backdrop-blur-md z-10 relative shrink-0">
          <div className="flex items-center">
            {/* Mobile: Upload triggers from header for easy access */}
            <button onClick={handleUploadPdf} className="md:hidden mr-3 text-slate-400 hover:text-white">
              <Icons.Plus />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium text-slate-200 truncate max-w-[200px]">
                {boardState.source === 'screen' ? (screenStream ? 'Live Analysis' : 'Voice Mode') : 
                 boardState.source === 'board' ? 'Whiteboard Mode' : 'Study Mode'}
              </h2>
              <button                      onClick={() => {
                        setSource('none');
                        setQuickActions(DEFAULT_ACTIONS); // Reset actions
                      }}
                title="Go Home"
                className="p-1.5 rounded-lg bg-eduva-700/50 hover:bg-eduva-600 text-white transition-all duration-200 border border-eduva-600/50 hover:border-eduva-500 active:scale-95 flex items-center gap-1.5 group shadow-sm"
              >
                <Icons.Home />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Home</span>
              </button>
            </div>
          </div>

          {/* Centered Session Status Visualizer */}
          {state !== TeacherState.IDLE && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
              <SessionStatus serviceRef={liveService} state={state} onStop={handleStopSession} />
            </div>
          )}

          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Desktop Notebook Toggle */}
            <button
              onClick={() => setIsNotebookOpen(true)}
              className={`hidden md:flex items-center space-x-2 bg-eduva-700 hover:bg-eduva-600 text-slate-200 px-3 py-2 rounded-lg text-sm transition-colors border border-eduva-600 ${isNotebookOpen ? 'opacity-0 pointer-events-none' : ''}`}
            >
              <Icons.Note />
              <span>Show Notebook</span>
            </button>

            {/* Primary Action Button Logic */}
            {state === TeacherState.IDLE ? (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 md:px-6 py-1.5 md:py-2 rounded-full font-semibold shadow-lg shadow-blue-900/20 transition-all hover:scale-105 text-sm md:text-base"
              >
                <Icons.Mic />
                <span className="hidden md:inline">Start Session</span>
                <span className="md:hidden">Start</span>
              </button>
            ) : (
              // Mute button handled in control bar for mobile
              <button
                onClick={toggleMute}
                className={`hidden md:flex items-center space-x-2 px-6 py-2 rounded-full font-semibold shadow-lg transition-all hover:scale-105 ${isMuted ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/20' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}`}
              >
                {isMuted ? <Icons.MicOff /> : <Icons.Mic />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
            )}

            {/* Mobile Settings Icon */}
            <button onClick={() => setShowSettings(true)} className="md:hidden p-2 text-slate-400 hover:text-white">
              <Icons.Settings />
            </button>
          </div>
        </header>

        <div className="flex-1 flex relative bg-slate-950 overflow-hidden">
          {/* 🔄 Stability Banner (Center Viewport Overlay) */}
          {state === TeacherState.RECONNECTING && (
            <div className="absolute inset-0 flex items-center justify-center z-[100] bg-slate-950/40 backdrop-blur-sm animate-fade-in">
              <div className="bg-eduva-800 border-2 border-amber-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center transform transition-all animate-scale-in">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping"></div>
                  <Icons.Zap isAmber />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Internet is not stable</h3>
                <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                  Lost connection to the AI tutor. We're attempting to reconnect silently...
                </p>
                <div className="flex items-center gap-2 text-amber-500 font-medium">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <span className="ml-1 uppercase text-xs tracking-widest">Reconnecting</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 p-0 md:p-2 flex flex-col items-center justify-center relative min-w-0">
            <div className="w-full h-full max-w-6xl flex flex-col">
              <DocumentStage
                stream={screenStream}
                pdfFile={pdfFile}
                onFrameCapture={handleFrameCapture}
                isActive={state !== TeacherState.IDLE}
                activeTool={activeTool}
                activeColor={activeColor}
                aiState={state}
                isGenerating={isGenerating}
                rescueTrigger={visionRescueTrigger}
                onUploadClick={handleUploadPdf}
              />
            </div>


            {/* Quick Actions (Desktop & Mobile) */}
            {state !== TeacherState.IDLE && (
              <div className="absolute bottom-4 md:bottom-12 left-1/2 -translate-x-1/2 flex space-x-2 bg-eduva-800/90 backdrop-blur border border-eduva-600 p-2 rounded-2xl shadow-2xl z-[30] animate-fade-in max-w-[90%] overflow-x-auto pointer-events-auto hide-scrollbar">
                {effectiveActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      const btn = e.currentTarget;
                      btn.style.transform = 'scale(0.92)';
                      setTimeout(() => btn.style.transform = 'scale(1)', 100);
                      handleQuickAction(action.prompt);
                    }}
                    className={`
                      px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all duration-200 
                      whitespace-nowrap shrink-0 shadow-lg border flex items-center gap-2
                       ${i < effectiveActions.length - (DEFAULT_ACTIONS.length + (!pdfFile && !screenStream ? 1 : 0))
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 ring-1 ring-blue-300 animate-pulse-subtle shadow-blue-900/40' 
                        : 'bg-eduva-700 hover:bg-eduva-600 text-slate-200 border-eduva-600'}
                    `}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notebook Container - Responsive Overlay on Mobile */}
          <div className={`
                fixed inset-0 z-50 bg-white md:static md:z-20 md:bg-slate-50 md:border md:border-slate-200 md:text-slate-900 md:shadow-xl md:m-2 md:rounded-2xl md:flex md:flex-col
                transition-transform duration-300 ease-in-out
                ${isNotebookOpen ? 'md:visible' : 'md:hidden'}
                ${mobileMenuState === 'notebook' ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
            `}
            style={{ width: window.innerWidth >= 768 ? notebookWidth : '100%' }} // Only apply width on desktop
          >
            {/* Mobile Notebook Header */}
            <div className="md:hidden flex items-center justify-between p-4 border-b bg-slate-50 text-slate-800">
              <h3 className="font-bold text-lg flex items-center gap-2"><Icons.Note /> Notebook</h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => setNotes([])} className="p-2 text-red-500 hover:bg-red-50 rounded-full" title="Clear All">
                  <Icons.Trash />
                </button>
                <button onClick={() => setMobileMenuState('none')} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300">
                  <Icons.Close />
                </button>
              </div>
            </div>

            {/* Desktop Resizer */}
            <div className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-50 bg-transparent" onMouseDown={startResizing} />

            <div className="p-4 border-b border-slate-200 bg-white hidden md:flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2 text-slate-800">
                <Icons.Note />
                <span className="font-bold whitespace-nowrap">Live Notebook</span>
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="Decrease Font"><Icons.Minus /></button>
                <button onClick={() => setNotes([])} className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors" title="Clear All Notes"><Icons.Trash /></button>
                <button onClick={() => setFontSize(s => Math.min(24, s + 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="Increase Font"><Icons.Plus /></button>
                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                <button onClick={handleExportNotes} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Export /></button>
                <button onClick={() => setIsNotebookOpen(false)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Close /></button>
              </div>
            </div>
            <div ref={notebookScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 h-[calc(100vh-60px)] md:h-auto pb-24 md:pb-4">
              {notes.length === 0 && <div className="text-center text-slate-400 mt-10 text-sm px-4">Notes and summaries from your teacher will appear here automatically.</div>}
              {notes.map((note, idx) => (
                <RichNotebook
                  key={idx}
                  title={note.title}
                  content={note.content}
                  colorTheme={note.colorTheme}
                  fontSize={fontSize}
                />
              ))}
            </div>
          </div>

          {(state === TeacherState.SPEAKING || state === TeacherState.THINKING || state === TeacherState.GENERATING) && (
            <div className="absolute bottom-20 right-4 md:bottom-8 md:right-96 pointer-events-none z-30">
              <div className="bg-blue-600 text-white px-4 py-2 md:px-6 md:py-3 rounded-full shadow-xl animate-bounce flex items-center space-x-2 text-sm md:text-base">
                <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                <span>{state === TeacherState.SPEAKING ? 'Explaining...' : 'Thinking...'}</span>
              </div>
            </div>
          )}
        </div>

        {/* --- MOBILE FAB MENU (Floating Speed Dial) --- */}
        <div className="md:hidden fixed bottom-24 right-4 z-[60] flex flex-col items-end space-y-4">

          {/* Expanded Menu Actions */}
          <div className={`flex flex-col items-end space-y-3 transition-all duration-300 origin-bottom ${mobileMenuState === 'none' ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'}`}>

            {/* 1. Whiteboard */}
            <div className="flex items-center space-x-2">
              <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm bg-opacity-80">Whiteboard</span>
              <button
                onClick={() => {
                  setSource('board');
                  setMobileMenuState('none');
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg text-white transition-colors ${boardState.source === 'board' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                <Icons.Board />
              </button>
            </div>

            {/* 2. Upload PDF */}

            {/* 2. Screen Share */}
            <div className="flex items-center space-x-2">
              <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm bg-opacity-80">Share Screen</span>
              <button
                onClick={() => {
                  if (state === TeacherState.IDLE) setSource('screen'); else handleToggleScreenShare();
                  setMobileMenuState('none');
                }}
                className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-blue-400 transition-colors"
              >
                <Icons.Screen />
              </button>
            </div>

            {/* 3. Notebook */}
            <div className="flex items-center space-x-2">
              <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm bg-opacity-80">Notes</span>
              <button
                onClick={() => toggleMobileState('notebook')}
                className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-amber-400 transition-colors"
              >
                <Icons.Note />
              </button>
            </div>

            {/* 4. Drawing Tools */}
            <div className="flex items-center space-x-2">
              <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm bg-opacity-80">Draw</span>
              <button
                onClick={() => toggleMobileState('tools')}
                className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-pink-400 transition-colors"
              >
                <Icons.Pen />
              </button>
            </div>
          </div>

          {/* Primary FAB Trigger */}
          <button
            onClick={() => setMobileMenuState(prev => prev === 'none' ? 'tools' : 'none')} // Default to opening menu context
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-all duration-300 z-[70] ${mobileMenuState !== 'none' ? 'bg-slate-700 rotate-45 text-slate-300' : 'bg-blue-600 text-white hover:scale-105'}`}
          >
            <Icons.Plus />
          </button>
        </div>

        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900/90 backdrop-blur-xl p-6 md:p-8 rounded-[2rem] shadow-2xl max-w-md w-full border border-white/10 max-h-[90vh] overflow-y-auto ring-1 ring-white/20">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">Customize Tutor</h2>
                  <p className="text-slate-500 text-sm mt-1">Configure your global learning experience</p>
                </div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-500/20">
                  <Icons.Settings />
                </div>
              </div>

              <div className="space-y-8">
                {/* 🌍 Language Dropdown */}
                <div>
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    <span>Target Language</span>
                  </label>
                  <div className="relative group">
                    <select 
                      value={sessionConfig.language}
                      onChange={(e) => setSessionConfig({ ...sessionConfig, language: e.target.value })}
                      className="w-full bg-slate-800/50 border border-white/5 rounded-2xl p-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-slate-800/80 transition-all cursor-pointer font-medium"
                    >
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <option key={lang.value} value={lang.value} className="bg-slate-900 text-white">
                          {lang.flag} {lang.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                {/* 🎙️ Voice Dropdown */}
                <div>
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">
                    <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                    <span>Voice Persona</span>
                  </label>
                  <div className="relative group">
                    <select 
                      value={sessionConfig.voiceName}
                      onChange={(e) => setSessionConfig({ ...sessionConfig, voiceName: e.target.value })}
                      className="w-full bg-slate-800/50 border border-white/5 rounded-2xl p-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-slate-800/80 transition-all cursor-pointer font-medium"
                    >
                      {VOICE_OPTIONS.map(v => (
                        <option key={v.name} value={v.name} className="bg-slate-900 text-white">
                          {v.name} ({v.gender}) — {v.style}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                {/* 🎭 Teaching Style */}
                <div>
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">
                    <span className="w-1 h-1 bg-purple-500 rounded-full"></span>
                    <span>Teaching Style</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-800/40 rounded-2xl border border-white/5">
                    {['Funny', 'Strict', 'Supportive'].map((p) => (
                      <button 
                        key={p} 
                        onClick={() => setSessionConfig({ ...sessionConfig, persona: p as any })} 
                        className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                          sessionConfig.persona === p 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center space-x-3">
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="px-6 py-4 rounded-2xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all text-sm"
                >
                  Cancel
                </button>
                {state === TeacherState.IDLE ? (
                  <button 
                    onClick={handleStartSession} 
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-blue-900/40 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                  >
                    <span>Start Learning</span>
                    <Icons.Play className="w-4 h-4" />
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowSettings(false)} 
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black transition-all"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 📊 Phase 24: Visual Trace Overlay */}
      <VisionAck state={vState} />
      {/* 💎 Premium Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-eduva-800 border border-eduva-700 rounded-3xl p-8 max-w-sm w-full shadow-2xl transform animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                <Icons.Trash />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Clear Canvas?</h3>
                <p className="text-slate-400">This will permanently delete all your drawings on the current stage.</p>
              </div>
              <div className="flex w-full space-x-3 mt-2">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-4 px-6 rounded-2xl bg-eduva-700 text-slate-300 font-bold hover:bg-eduva-650 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={performActualClear}
                  className="flex-1 py-4 px-6 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-900/50 transition-all active:scale-95"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    <BoardProvider>
      <AppContent {...props} />
    </BoardProvider>
  );
}