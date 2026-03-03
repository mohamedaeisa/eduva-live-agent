import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LiveSessionService } from './services/liveSessionService';
import DocumentStage from './components/DocumentStage';
import CompactSidebar from './components/CompactSidebar';
import RichNotebook from './components/RichNotebook';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { SessionStatus } from './components/SessionStatus';
import { Atom, DrawingAction, TeacherState, SessionConfig, NoteData, QuickAction, Stroke } from './types';
import { MODELS, API_KEY, VOICE_OPTIONS } from './constants';
import { GoogleGenAI } from '@google/genai';
import { BoardProvider, useBoard } from './context/BoardProvider';

// Icons
const Icons = {
  Mic: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
  MicOff: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>,
  Stop: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Note: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Export: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Plus: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Minus: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>,
  Close: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  // Drawing Tools Icons
  Pointer: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
  Pen: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
  Circle: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>, // Shield for circle for now or just circle
  Arrow: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
  Eraser: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Screen: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  PDF: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
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
  const [activeTool, setActiveTool] = useState<'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser'>('pointer');
  const [activeColor, setActiveColor] = useState('#ef4444'); // Default red

  // Dynamic Actions State
  const [quickActions, setQuickActions] = useState<QuickAction[]>(DEFAULT_ACTIONS);

  // Notebook UI State
  const [isNotebookOpen, setIsNotebookOpen] = useState(true);
  const [notebookWidth, setNotebookWidth] = useState(320);
  const [fontSize, setFontSize] = useState(14);
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

  useEffect(() => {
    console.debug("App: Component Mounted");
    liveService.current.setCallbacks(
      (action: DrawingAction) => {
        console.debug(`[APP][onDraw] type=${action.type} turnState=${state} ts=${Date.now()}`);
        const newStroke: Stroke = {
          id: action.id || crypto.randomUUID(),
          author: 'ai',
          tool: (action.type === 'freehand' || action.type === 'rect') ? 'pen' : (action.type as any),
          color: action.color || '#ff0000',
          width: 4,
          path: [{ x: action.x, y: action.y }]
        };

        if (action.type === 'circle') {
          const radius = action.width || 50;
          const centerX = action.x;
          const centerY = action.y;
          const points = [];
          for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            points.push({
              x: centerX + Math.cos(angle) * radius,
              y: centerY + Math.sin(angle) * radius
            });
          }
          newStroke.path = points;
          newStroke.tool = 'circle';
        } else if (action.type === 'arrow') {
          newStroke.path.push({ x: action.x + 100, y: action.y + 100 });
        } else if (action.type === 'rect' || action.type === 'highlight') {
          newStroke.path.push({ x: action.x + (action.width || 100), y: action.y + (action.height || 50) });
        } else {
          newStroke.path.push({ x: action.x + 1, y: action.y + 1 });
        }
        addStroke(newStroke);
      },
      (note: NoteData) => {
        console.debug(`[APP][onNote] title=${note.title} ts=${Date.now()}`);
        setNotes(prev => [note, ...prev]);
      },
      (nextState: string) => {
        // Use functional setState to get the most accurate 'current' state if needed,
        // but for logging we just trust the new state being passed in.
        setState(prev => {
          console.log(`[APP][onState] transition=${prev} -> ${nextState} ts=${Date.now()}`);
          return nextState as TeacherState;
        });
        // Sync vision state trace
        if (liveService.current) setVState(liveService.current.visionState);
      },
      (newActions) => {
        console.debug(`[APP][onActions] count=${newActions.length} ts=${Date.now()}`);
        setQuickActions(prev => [...DEFAULT_ACTIONS, ...newActions]);
      },
      () => {
        console.log(`[APP][onVisionRequest] rescueTrigger triggered ts=${Date.now()}`);
        setVisionRescueTrigger(prev => prev + 1);
      }
    );
    liveService.current.onGeneration = setIsGenerating;

    // 🧊 Phase 15: Sync Source State
    liveService.current.source = boardState.source;

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
    liveService.current.source = boardState.source;
  }, [boardState.source]);

  const effectiveActions = useMemo(() => {
    let actions = [...quickActions];
    if (!pdfFile && !screenStream && state !== TeacherState.IDLE) {
      if (!actions.some(a => a.label === "Positive Quote")) {
        actions.push({ label: "Positive Quote", prompt: "Give me a short positive quote to motivate me before we start studying." });
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

  const handleFrameCapture = (base64: string, metadata?: any) => {
    if (liveService.current) {
      console.debug(`[APP][handleFrameCapture] id=${metadata?.frameId} len=${base64.length} rescue=${metadata?.isRescue} ts=${Date.now()}`);
      liveService.current.bufferVision(base64, metadata);
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.debug("App: handlePdfUpload");
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.debug(`App: PDF Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      setPdfFile(file);
      setSource('pdf');
    }
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
    clearStrokes();
    setNotes([]);
    setActiveTool('pointer');
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
          onOpenSettings={handleOpenSettings}
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
              { id: 'freehand', icon: Icons.Pen },
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
            <button onClick={handleClearDrawings} className="text-red-400 text-xs font-bold uppercase hover:text-red-300 px-2 py-1">Clear Canvas</button>
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
            <h2 className="text-lg font-medium text-slate-200 truncate max-w-[200px]">
              {boardState.source === 'screen' ? (screenStream ? 'Live Analysis' : 'Voice Mode') : 'Study Mode'}
            </h2>
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
              />
            </div>

            {/* Quick Actions (Desktop & Mobile) */}
            {state !== TeacherState.IDLE && (
              <div className="absolute bottom-4 md:bottom-12 left-1/2 transform -translate-x-1/2 flex space-x-2 bg-eduva-800/90 backdrop-blur border border-eduva-600 p-2 rounded-2xl shadow-2xl z-[30] animate-fade-in-up max-w-[90%] overflow-x-auto pointer-events-auto hide-scrollbar">
                {effectiveActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      const btn = e.currentTarget;
                      btn.style.transform = 'scale(0.95)';
                      setTimeout(() => btn.style.transform = 'scale(1)', 100);
                      handleQuickAction(action.prompt);
                    }}
                    className="px-3 md:px-4 py-2 bg-eduva-700 hover:bg-eduva-600 active:bg-blue-600 text-xs font-medium rounded-xl transition-all duration-100 whitespace-nowrap shrink-0 border border-transparent hover:border-eduva-500 shadow-sm"
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
              <button onClick={() => setMobileMenuState('none')} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300">
                <Icons.Close />
              </button>
            </div>

            {/* Desktop Resizer */}
            <div className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-50 bg-transparent" onMouseDown={startResizing} />

            <div className="p-4 border-b border-slate-200 bg-white hidden md:flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2 text-slate-800">
                <Icons.Note />
                <span className="font-bold whitespace-nowrap">Live Notebook</span>
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Minus /></button>
                <button onClick={() => setFontSize(s => Math.min(24, s + 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Plus /></button>
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

          {state === TeacherState.EXPLAINING && (
            <div className="absolute bottom-20 right-4 md:bottom-8 md:right-96 pointer-events-none z-30">
              <div className="bg-blue-600 text-white px-4 py-2 md:px-6 md:py-3 rounded-full shadow-xl animate-bounce flex items-center space-x-2 text-sm md:text-base">
                <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                <span>Explaining...</span>
              </div>
            </div>
          )}
        </div>

        {/* --- MOBILE FAB MENU (Floating Speed Dial) --- */}
        <div className="md:hidden fixed bottom-24 right-4 z-[60] flex flex-col items-end space-y-4">

          {/* Expanded Menu Actions */}
          <div className={`flex flex-col items-end space-y-3 transition-all duration-300 origin-bottom ${mobileMenuState === 'none' ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'}`}>

            {/* 1. Upload PDF */}
            <div className="flex items-center space-x-2">
              <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm bg-opacity-80">Upload PDF</span>
              <button
                onClick={() => {
                  handleUploadPdf();
                  setMobileMenuState('none');
                }}
                className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-indigo-500 transition-colors"
              >
                <Icons.PDF /> {/* Assuming PDF icon exists or similar */}
              </button>
            </div>

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
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-eduva-800 p-6 md:p-8 rounded-2xl shadow-2xl max-w-md w-full border border-eduva-600 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-6 text-white">Customize Your Tutor</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-2">Voice & Gender</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOICE_OPTIONS.map((v) => (
                      <button key={v.name} onClick={() => setSessionConfig({ ...sessionConfig, voiceName: v.name })} className={`p-3 rounded-lg border text-left transition-all ${sessionConfig.voiceName === v.name ? 'bg-blue-600 border-blue-500 text-white' : 'bg-eduva-700 border-eduva-600 text-slate-300 hover:bg-eduva-600'}`}>
                        <div className="font-bold">{v.name}</div>
                        <div className="text-xs opacity-70">{v.gender} • {v.style}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-2">Language</label>
                  <div className="flex space-x-2">
                    {['English', 'Arabic'].map((lang) => (
                      <button key={lang} onClick={() => setSessionConfig({ ...sessionConfig, language: lang as any })} className={`flex-1 p-3 rounded-lg border font-medium ${sessionConfig.language === lang ? 'bg-green-600 border-green-500 text-white' : 'bg-eduva-700 border-eduva-600 text-slate-300 hover:bg-eduva-600'}`}>{lang}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-2">Teaching Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Funny', 'Strict', 'Supportive'].map((p) => (
                      <button key={p} onClick={() => setSessionConfig({ ...sessionConfig, persona: p as any })} className={`p-2 text-sm rounded-lg border font-medium ${sessionConfig.persona === p ? 'bg-purple-600 border-purple-500 text-white' : 'bg-eduva-700 border-eduva-600 text-slate-300 hover:bg-eduva-600'}`}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button onClick={() => setShowSettings(false)} className="px-4 py-3 rounded-xl font-medium text-slate-300 hover:bg-eduva-700 transition-colors">Cancel</button>
                {state === TeacherState.IDLE ? (
                  <button onClick={handleStartSession} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex-1 shadow-lg">Start Learning</button>
                ) : (
                  <button onClick={() => setShowSettings(false)} className="bg-eduva-700 hover:bg-eduva-600 text-white px-6 py-3 rounded-xl font-bold flex-1">Close</button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 📊 Phase 24: Visual Trace Overlay */}
      <VisionAck state={vState} />
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