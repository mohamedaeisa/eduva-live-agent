import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LiveSessionService } from './services/liveSessionService';
import DocumentStage from './components/DocumentStage';
import CompactSidebar from './components/CompactSidebar';
import BottomToolbar from './components/BottomToolbar';
import RichNotebook from './components/RichNotebook';
import FloatingMoreFAB from './components/FloatingMoreFAB';
import MobileSourceFAB from './components/MobileSourceFAB';
import MobileDrawingPanel from './components/MobileDrawingPanel';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { SessionStatus } from './components/SessionStatus';
import { Atom, DrawingAction, TeacherState, SessionConfig, NoteData, QuickAction, Stroke } from './types';
import { MODELS, API_KEY, API_KEY_NAME, VOICE_OPTIONS } from './constants';
import { GoogleGenAI } from '@google/genai';
import { BoardProvider, useBoard } from './context/BoardProvider';
import { WakeUpTeacherLoader } from './components/WakeUpTeacherLoader';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import sleepingTeacherImg from './components/images/sleeping_teacher.png';

// Icons
const Icons = {
  Mic: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
  MicOff: (props: any) => <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>,
  Wifi: (props: any) => <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>,
  Stop: (props: any) => <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Note: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Export: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
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
  Camera: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
};


const NOTES_STORAGE_KEY = 'eduva_notes';



interface AppProps {
  user?: { firstName?: string; displayName?: string; name?: string };
}

function AppContent({ user }: AppProps) {
  const { state: boardState, setSource, setLifecycle, addStroke, clearStrokes } = useBoard();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [state, setState] = useState<TeacherState>(TeacherState.IDLE);
  const [screenStream, setScreenStream] = useState<MediaStream | undefined>(undefined);
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [notes, setNotes] = useState<NoteData[]>([]);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(API_KEY);
  const [vState, setVState] = useState<string>('SESSION_CLOSED'); // 📊 Phase 24
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
    voiceName: 'Aoede',
    language: 'Arabic',
    persona: 'Funny',
    studentName: user?.firstName || user?.displayName || user?.name // Injected Name
  });

  // Tools State
  const [activeTool, setActiveToolRaw] = useState<'pointer' | 'freehand' | 'circle' | 'arrow' | 'eraser' | 'text' | 'sticky'>('pointer');

  const setActiveTool = (tool: typeof activeTool) => {
    // console.log(`[TOOL_DEBUG] Changing tool from ${activeTool} to ${tool}`);
    setActiveToolRaw(tool);
  };

  const [activeColor, setActiveColor] = useState('#ef4444'); // Default red
  const [activeWidth, setActiveWidth] = useState(4); // 🖊️ Default Pen Width (Medium)


  // Notebook UI State
  const [isNotebookOpen, setIsNotebookOpen] = useState(true);
  const [notebookWidth, setNotebookWidth] = useState(320);
  const [fontSize, setFontSize] = useState(14);
  const desktopNotebookRef = useRef<HTMLDivElement>(null);
  const mobileNotebookRef = useRef<HTMLDivElement>(null);
  const [rescueTrigger, setRescueTrigger] = useState(0);
  const visionRescueTrigger = rescueTrigger;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isResizingNotebook = useRef(false);
  const isInitialGreetingDoneRef = useRef(false);

  // 🛑 enh25: Silent Auto-Reconnection UI State
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptsRef = useRef(0);

  // Split View State (Phase 3)
  const [stageSplit, setStageSplit] = useState(0); // 🎯 Initialized to 0 (Closed)
  const [isDraggingNotes, setIsDraggingNotes] = useState(false);
  const dragStartY = useRef(0);
  const initialSplit = useRef(0);

  // Mobile Drawing Panel State (Phase 4)
  const [showDrawingPanel, setShowDrawingPanel] = useState(false);

  // Runtime State
  const [isMuted, setIsMuted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

  // 🛡️ Mobile Viewport Lock: Prevent "Whole App" scrolling
  useEffect(() => {
    // Force body and html to be fixed size, no overflow
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100dvh';
    document.body.style.touchAction = 'none'; // Prevent browser-level panning on body

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.touchAction = '';
    };
  }, []);

  /* --- Authority Phase 10: Single Service Owner --- */
  const liveService = useRef<LiveSessionService | null>(null);
  if (!liveService.current) {
    liveService.current = new LiveSessionService();
  }
  const scrollRef = useRef({ top: 0, left: 0 });
  const isConnectingRef = useRef(false); // 🔒 Phase 14: StrictMode Guard

  // Define handleStartSession here so it can be called by onDisconnect
  const handleStartSession = useCallback(async (forceIsReconnecting?: boolean) => {
    const now = Date.now();
    const activeIsReconnecting = forceIsReconnecting ?? isReconnecting;
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
    setShowSettings(false); // Close settings while waking up
    setDisconnectReason(null); // Clear any previous error
    setIsWakingUp(true);

    try {
      console.log(`[APP][handleStartSession] Connecting to Live Service ts=${now}`);
      // ⏳ Ensure the premium "Wake up" animation plays for at least 5 seconds
      const minDelay = new Promise(resolve => setTimeout(resolve, 5000));

      const connectionPromise = (async () => {
        try {
          console.log(`[APP][handleStartSession] Trying Primary Model: ${MODELS.LIVE}`);
          await liveService.current!.connect(sessionConfig, userApiKey, API_KEY_NAME, MODELS.LIVE, activeIsReconnecting);
          return true;
        } catch (error: any) {
          console.warn("[APP][handleStartSession] Primary Model Failed, trying fallback:", error);
          const errMsg = (error.message || "").toLowerCase();
          // Fallback on model-related errors
          if (errMsg.includes('1008') || errMsg.includes('not found') || errMsg.includes('bidi') || errMsg.includes('model')) {
            console.log(`[APP][handleStartSession] Retrying with Fallback Model: ${MODELS.LIVE_FALLBACK}`);
            await liveService.current!.connect(sessionConfig, userApiKey, API_KEY_NAME, MODELS.LIVE_FALLBACK, activeIsReconnecting);
            return true;
          }
          throw error;
        }
      })();

      await Promise.all([
        connectionPromise,
        minDelay
      ]);

      setLifecycle('ready');
      console.log(`[APP][handleStartSession] SUCCESS ts=${Date.now()}`);
      setIsWakingUp(false); // Success! Land in app

      // 🛑 enh25: Clear the reconnect state if we manually click or succeed
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;
    } catch (error) {
      console.error("[APP][handleStartSession] FAILED:", error);
      setIsWakingUp(false); // Fail!

      // 🛑 enh25: Fallback handling
      if (isReconnecting) {
        // We are in a silent retry loop. Don't show settings yet.
        // The outer onDisconnect handles the 3-retry limit.
      } else {
        setShowSettings(true); // Land back in Settings
        alert((error as Error).message || "Failed to start session");
        setState(TeacherState.IDLE);
      }
      throw error; // Re-throw so the silent auto-connect catch block sees it
    } finally {
      isConnectingRef.current = false;
    }
  }, [sessionConfig, userApiKey, isReconnecting, setLifecycle]);


  useEffect(() => {
    console.debug("App: Component Mounted");
    liveService.current.setCallbacks(
      (action: DrawingAction) => {
        console.debug(`[APP][onDraw] type=${action.type} x=${action.x?.toFixed(0)} y=${action.y?.toFixed(0)} ts=${Date.now()}`);

        // Coordinates are already in world space (converted by liveSessionService handleTools)
        const cx = action.x || 0;
        const cy = action.y || 0;
        const w = action.width || 80;
        const h = action.height || action.width || 80;

        const newStroke: Stroke = {
          id: action.id || crypto.randomUUID(),
          author: 'ai',
          tool: 'freehand',
          color: action.color || '#ff6b6b',
          width: 5,
          path: [{ x: cx, y: cy }],
          text: action.label
        };

        switch (action.type) {
          case 'circle': {
            // Generate 36 circle points (every 10°) for smooth rendering
            const radius = w;
            newStroke.tool = 'circle';
            newStroke.path = Array.from({ length: 37 }, (_, i) => {
              const angle = (i / 36) * Math.PI * 2;
              return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
            });
            break;
          }
          case 'arrow': {
            newStroke.tool = 'arrow';
            newStroke.width = 4;
            // Arrow: from (cx, cy) → (cx + w, cy + h)
            newStroke.path = [
              { x: cx, y: cy },
              { x: cx + w, y: cy + h }
            ];
            break;
          }
          case 'rect': {
            newStroke.tool = 'freehand';
            newStroke.width = 3;
            // Draw a rectangle outline as a path
            newStroke.path = [
              { x: cx, y: cy },
              { x: cx + w, y: cy },
              { x: cx + w, y: cy + h },
              { x: cx, y: cy + h },
              { x: cx, y: cy } // close
            ];
            break;
          }
          case 'text': {
            newStroke.tool = 'text';
            newStroke.path = [{ x: cx, y: cy }];
            break;
          }
          default: {
            if (action.type === 'freehand' && action.points && action.points.length > 0) {
              console.log(`🎨 [DRAW][APP] Rendering freehand with ${action.points.length} points`);
              newStroke.tool = 'freehand';
              newStroke.width = 4;
              newStroke.path = action.points.map(pt => ({ x: pt.x, y: pt.y, p: 0.5 }));
            } else {
              console.warn(`⚠️ [DRAW][APP] Fallback stroke triggered for freehand. action.points is:`, action.points);
              // fallback: need at least 2 points for rendering
              newStroke.path = [
                { x: cx, y: cy },
                { x: cx + 2, y: cy + 2 }
              ];
            }
          }
        }

        console.log(`🎨 [DRAW][APP] Adding new stroke to board state:`, JSON.stringify(newStroke, null, 2));
        addStroke(newStroke);
      },
      (note: NoteData) => {
        console.log(`[APP][onNote] RECEIVED: title="${note.title}" contentLen=${note.content?.length || 0}`);
        if (!note.content) console.warn(`[APP][onNote] EMPTY CONTENT for note:`, note);

        setNotes(prev => {
          if (prev.length > 0) {
            const lastNote = prev[prev.length - 1];
            // 🎯 Phase 100 Smart Merge: If same title, update the last note instead of adding a new one
            if (lastNote.title === note.title) {
              console.log(`[APP][onNote] MERGING with last note: "${note.title}"`);
              const updated = [...prev];
              updated[updated.length - 1] = { ...note };
              return updated;
            }
          }
          console.log(`[APP][onNote] ADDING new note: "${note.title}"`);
          return [...prev, note];
        });
      },
      (nextState: string) => {
        setState(prev => {
          // 🎯 Phase 100: Map TurnState to TeacherState
          let mappedState = nextState;
          if (nextState === 'GENERATING') mappedState = TeacherState.THINKING;
          if (nextState === 'SPEAKING') mappedState = TeacherState.EXPLAINING;

          if (prev !== mappedState) {
            console.log(`[APP][onState] transition=${prev} -> ${mappedState} ts=${Date.now()}`);
          }
          return mappedState as TeacherState;
        });
        // Sync vision state trace
        if (liveService.current) setVState(liveService.current.visionState);
      },
      () => {
        // 🛟 Phase 16.1 Emergency: Bump rescue counter if stuck in VISUAL_MODE for > 2s
        setRescueTrigger(r => r + 1);
      },
      // Original onDisconnect callback - this will be overridden by the direct assignment below
      (reason: string) => {
        console.warn(`[APP][onDisconnect] reason=${reason} ts=${Date.now()}`);
        setDisconnectReason(reason);
        setState(TeacherState.IDLE); // Stop session state, but keep UI context for reconnection
      }
    );
    liveService.current.onGeneration = setIsGenerating;

    // 🛑 enh25: Professional Silent Auto-Reconnection
    liveService.current.onDisconnect = (reason) => {
      console.warn(`[APP] Disconnected: ${reason}. Attempting silent reconnect...`);

      // Safety limit: Don't infinite loop if internet is truly dead (max 3 tries)
      if (reconnectAttemptsRef.current >= 3) {
        console.error("[APP] Reconnect limit reached. Showing error.");
        setDisconnectReason(reason);
        setIsReconnecting(false);
        return;
      }

      reconnectAttemptsRef.current++;
      setIsReconnecting(true);
      setDisconnectReason(null); // Hide the red crash box

      // Wait 2s to avoid hammering a downed server
      setTimeout(() => {
        if (!isConnectingRef.current) {
          handleStartSession(true).then(() => {
            // Success! The reconnect worked.
            setIsReconnecting(false);
            reconnectAttemptsRef.current = 0; // Reset counter for next time
          }).catch((err) => {
            // Failed. Loop will continue up to 3 times because handleStartSession 
            // doesn't loop itself, but it throws if strictly failed.
            console.warn("[APP] Silent reconnect attempt failed.", err);
          });
        }
      }, 2000);
    };

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


  // Auto-scroll notebook when AI writes new notes
  useEffect(() => {
    const scrollTask = () => {
      [desktopNotebookRef, mobileNotebookRef].forEach(ref => {
        if (ref.current) {
          ref.current.scrollTo({
            top: ref.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      });
    };

    if (notes.length > 0) {
      // 🎯 Phase 50: Scroll to bottom for chronological order
      // We use multiple timeouts to ensure we catch the layout shifts
      setTimeout(scrollTask, 100);
      setTimeout(scrollTask, 500);
    }
  }, [notes]);

  useEffect(() => {
    if (isNotebookOpen) {
      setTimeout(() => {
        desktopNotebookRef.current?.scrollTo({ top: desktopNotebookRef.current.scrollHeight });
      }, 50);
    }
  }, [isNotebookOpen]);

  // 🎯 Mobile Fix: Reset to 'pointer' when PDF changes or Mobile layout activates
  // This allows the user to scroll by default, but doesn't prevent them from selecting 'freehand' manually
  useEffect(() => {
    if (isMobile) {
      console.log('[MOBILE_LAYOUT] Resetting to pointer tool for scrolling');
      setActiveTool('pointer');
    }
  }, [isMobile, pdfFile]);

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

  // Split View Drag Handlers (Phase 3)
  const snapPoints = [0, 40, 60, 100];

  const findNearestSnapPoint = (percentage: number) => {
    return snapPoints.reduce((prev, curr) =>
      Math.abs(curr - percentage) < Math.abs(prev - percentage) ? curr : prev
    );
  };

  const handleNotesMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isMobile) return; // Only on mobile
    setIsDraggingNotes(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartY.current = clientY;
    initialSplit.current = stageSplit;

    // Gesture locking: disable scroll & pinch
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    // e.preventDefault(); // allow default to start touch? mostly fine to prevent
  }, [isMobile, stageSplit]);

  useEffect(() => {
    if (!isDraggingNotes) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const deltaY = dragStartY.current - clientY;
      const viewportHeight = window.innerHeight;
      const deltaPercent = (deltaY / viewportHeight) * 100;
      const newSplit = Math.max(0, Math.min(100, initialSplit.current + deltaPercent));
      setStageSplit(newSplit);
    };

    const handleMouseUp = () => {
      // Snap to nearest point on release
      setStageSplit(prev => findNearestSnapPoint(prev));
      setIsDraggingNotes(false);

      // Re-enable gestures
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleMouseMove as any, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleMouseMove as any);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDraggingNotes]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingNotebook.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const handleToggleScreenShare = async () => {
    console.log("🖥️ [SCREEN_SHARE] handleToggleScreenShare ENTER", {
      currentStream: !!screenStream,
      aiState: state,
      timestamp: Date.now()
    });

    if (screenStream) {
      console.log("🖥️ [SCREEN_SHARE] Stopping existing stream");
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(undefined);
      console.log("🖥️ [SCREEN_SHARE] Stream stopped successfully");
    } else {
      try {
        console.log("🖥️ [SCREEN_SHARE] Requesting display media...");
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        console.log("🖥️ [SCREEN_SHARE] Stream acquired:", {
          streamId: stream.id,
          videoTracks: stream.getVideoTracks().length,
          hasAudio: stream.getAudioTracks().length > 0
        });

        setScreenStream(stream);
        console.log("🖥️ [SCREEN_SHARE] setScreenStream() called");

        setSource('screen');
        console.log("🖥️ [SCREEN_SHARE] setSource('screen') called - fingerprint should clear");

        stream.getVideoTracks()[0].onended = () => {
          console.log("🖥️ [SCREEN_SHARE] Video track ended (user stopped sharing)");
          setScreenStream(undefined);
        };

        console.log("🖥️ [SCREEN_SHARE] Setup complete successfully");
      } catch (e: any) {
        console.error("🖥️ [SCREEN_SHARE] ERROR:", e);
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
    setIsMuted(false);
  };

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    liveService.current.toggleMute(newMuteState);
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
      console.log(`[MOBILE_NAV] App: PDF Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
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
    console.log('[MOBILE_NAV] handleUploadPdf triggered - clicking hidden input');
    fileInputRef.current?.click();
  };

  const handleCameraCapture = () => {
    console.log('[MOBILE_NAV] handleCameraCapture triggered - clicking hidden input');
    cameraInputRef.current?.click();
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.debug(`App: Camera Captured: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      setPdfFile(file); // Reuse pdfFile state - works for images too
      setSource('pdf'); // Switch to PDF mode to render the image
      // 🎯 Force immediate vision capture for camera snapshots
      setTimeout(() => setRescueTrigger(prev => prev + 1), 100);
    }
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleClearDrawings = () => {
    clearStrokes();
    setNotes([]);
    setActiveTool('pointer');
  };

  const handleClearPdf = useCallback(() => {
    setPdfFile(null);
    setSource('board'); // 🎯 Phase 38: Default to board instead of none
  }, [setSource]);

  const handleBoard = useCallback(() => {
    // Stop screen sharing if active
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    // Clear PDF if loaded
    setPdfFile(null);
    // Return to board mode
    setSource('board');
  }, [screenStream, setSource]);

  // 🎯 Phase 38: Removed handleWhiteboard and handleEnhancedBoard - unified to 'board'

  // Mobile State
  const [mobileMenuState, setMobileMenuState] = useState<'none' | 'tools' | 'notebook'>('none');

  // Helper to toggle mobile states exclusively
  const toggleMobileState = (target: 'tools' | 'notebook') => {
    setMobileMenuState(prev => prev === target ? 'none' : target);
  };

  const activeMobileToolColor = mobileMenuState === 'tools' ? 'text-blue-400' : 'text-slate-400';
  const activeMobileNotebookColor = mobileMenuState === 'notebook' ? 'text-blue-400' : 'text-slate-400';

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-slate-50 dark:bg-eduva-900 text-slate-900 dark:text-white overflow-hidden font-sans">

      {/* Desktop Sidebar (Floating Card Style) */}
      <div className="hidden md:block shrink-0 z-30 relative my-6 ml-4 h-[80%] rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800/50">
        <CompactSidebar
          mode={boardState.source}
          setMode={setSource}
          state={state}
          screenStream={screenStream}
          pdfFile={pdfFile}
          onToggleScreenShare={() => { if (state === TeacherState.IDLE) setSource('screen'); else handleToggleScreenShare(); }}
          onUploadPdf={handleUploadPdf}
          onClearPdf={handleClearPdf}
          onBoard={handleBoard}
          onOpenSettings={handleOpenSettings}
          visionState={vState}
        />
      </div>



      {/* Hidden File Inputs - 🎯 FIX: Removed capture="environment" for better compatibility */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handlePdfUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture onChange={handleCameraChange} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 order-first md:order-last">

        {/* Notebook Toggle (Absolute Top Right) */}
        <button
          onClick={() => setIsNotebookOpen(!isNotebookOpen)}
          className={`absolute top-4 right-4 z-40 hidden md:flex items-center space-x-2 bg-eduva-800/80 hover:bg-eduva-700 backdrop-blur text-slate-200 px-3 py-2 rounded-lg text-sm transition-colors border border-eduva-700 shadow-lg ${isNotebookOpen ? 'opacity-0 pointer-events-none' : ''}`}
        >
          <Icons.Note />
          <span>Notebook</span>
        </button>

        {/* Mobile Settings & Notes (Absolute Top Right) */}
        <div className="absolute top-4 right-4 md:hidden z-20 flex items-center gap-2">
          {/* Notes Toggle for IDLE Mode */}
          {state === TeacherState.IDLE && (
            <button
              onClick={() => setStageSplit(prev => prev > 0 ? 0 : 40)}
              className={`p-2 backdrop-blur rounded-lg border transition-all ${stageSplit > 0 ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-eduva-800/80 text-slate-200 border-eduva-700'}`}
              title="Toggle Notes"
            >
              <Icons.Note />
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="p-2 bg-eduva-800/80 backdrop-blur rounded-lg text-slate-200 border border-eduva-700">
            <Icons.Settings />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row relative bg-slate-100 dark:bg-slate-950 overflow-hidden h-full md:h-full">
          {/* Main Content Area - CENTER on Desktop | STACK on Mobile */}
          <div className="flex-1 p-0 md:p-6 flex flex-col items-center justify-start relative min-w-0 h-full md:h-full overflow-hidden">

            {/* 🆕 Phase 50: Mobile Top Control Bar (Fixed Size) - Hidden in IDLE */}
            {isMobile && state !== TeacherState.IDLE && (
              <div className="w-full shrink-0 z-50">
                {/* 🐛 DEBUG LOG: Mobile Layout State */}
                {(() => {
                  console.log(`[MOBILE_LAYOUT] Render: isMobile=${isMobile} state=${state} stageSplit=${stageSplit} notes=${notes.length} tool=${activeTool}`);
                  return null;
                })()}
                <BottomToolbar
                  isMuted={isMuted}
                  onToggleMute={toggleMute}
                  sessionActive={true}
                  onStopSession={handleStopSession}
                  serviceRef={liveService}
                  state={state}
                  position="top"
                  onToggleNotes={() => {
                    console.log('[MOBILE_LAYOUT] Notes Toggle Clicked');
                    setStageSplit(prev => prev > 0 ? 0 : 40);
                  }}
                  notesActive={stageSplit > 0}
                />
              </div>
            )}

            {/* Stage Container (Middle - Flexible) */}
            <div className={`w-full ${isMobile ? `flex-1 min-h-0 shrink rounded-none border-slate-200` : `${pdfFile ? 'h-[80%] w-full' : 'h-[80%] max-w-7xl md:rounded-2xl'} border border-slate-200 dark:border-slate-800/50`} flex flex-col shadow-2xl overflow-hidden bg-white relative`}>
              <DocumentStage
                stream={screenStream}
                pdfFile={pdfFile}
                onFrameCapture={handleFrameCapture}
                isActive={state !== TeacherState.IDLE}
                activeTool={activeTool}
                activeColor={activeColor}
                activeWidth={activeWidth} // 🖊️ Phase 51: Variable Width
                aiState={state}
                isGenerating={isGenerating}
                rescueTrigger={visionRescueTrigger}
                onStartSession={() => setShowSettings(true)}
              />
            </div>

            {/* Mobile Notebook (Bottom - Adjustable Overlay) */}
            {isMobile && stageSplit > 0 && (
              <div
                className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-slate-200 z-[100] flex flex-col transition-all duration-300 ease-out"
                style={{ height: `${stageSplit}%`, maxHeight: '85%' }}
              >
                {(() => { console.log(`[MOBILE_NOTEBOOK] Rendering height=${stageSplit}%`); return null; })()}
                {/* Mobile Drag Handle (At Top of Notes) */}
                <div
                  onMouseDown={handleNotesMouseDown}
                  onTouchStart={handleNotesMouseDown as any}
                  className={`w-full h-8 shrink-0 flex items-center justify-center cursor-ns-resize touch-none ${isDraggingNotes ? 'bg-blue-50' : 'bg-transparent'}`}
                >
                  <div className={`w-12 h-1.5 rounded-full transition-all ${isDraggingNotes ? 'bg-blue-500' : 'bg-slate-300'}`} />
                </div>

                {/* Mobile Header */}
                <div className="flex items-center justify-between px-4 pb-2 shrink-0">
                  <h3 className="font-bold text-lg flex items-center gap-2 text-slate-700 select-none"><Icons.Note /> Notebook</h3>
                  <div className="flex items-center gap-2">
                    {notes.length > 0 && (
                      <button
                        onClick={() => setNotes([])}
                        className="p-2 bg-red-100 text-red-500 rounded-full hover:bg-red-200 transition-colors"
                        title="Clear All"
                      >
                        <Icons.Trash />
                      </button>
                    )}
                    <button
                      onClick={() => setStageSplit(0)}
                      className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
                    >
                      <Icons.Close />
                    </button>
                  </div>
                </div>

                {/* Mobile Notebook Content */}
                <div ref={mobileNotebookRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                  {notes.length === 0 && <div className="text-center text-slate-400 mt-10 text-sm px-4">Notes from your session will live here.</div>}
                  {notes.map((note, idx) => (
                    <RichNotebook
                      key={idx}
                      title={note.title}
                      content={note.content}
                      colorTheme={note.colorTheme}
                      fontSize={fontSize}
                      isWriting={idx === notes.length - 1 && (state === TeacherState.THINKING || state === TeacherState.EXPLAINING)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Toolbar - DESKTOP ONLY (Already hidden on mobile by parent logic if we wanted, but let's keep it clean) */}
            {!isMobile && (
              <div className="w-full z-30 bg-white shrink-0 max-w-7xl mx-auto mt-2">
                <BottomToolbar
                  isMuted={isMuted}
                  onToggleMute={toggleMute}
                  sessionActive={state !== TeacherState.IDLE}
                  onStopSession={handleStopSession}
                  serviceRef={liveService}
                  state={state}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                  activeColor={activeColor}
                  setActiveColor={setActiveColor}
                  onClearDrawings={handleClearDrawings}
                />
              </div>
            )}
          </div>

          {/* Desktop Notebook - RIGHT SIDEBAR */}
          {!isMobile && isNotebookOpen && (
            <div
              className="md:bg-slate-50 md:border md:border-slate-200 md:my-6 md:mr-4 md:ml-0 md:rounded-3xl md:flex md:flex-col md:h-[80%] z-30"
              style={{ width: notebookWidth }}
            >
              {/* Desktop Resizer */}
              <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-50 bg-transparent" onMouseDown={startResizing} />

              {/* Desktop Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-2 text-slate-800">
                  <Icons.Note />
                  <span className="font-bold whitespace-nowrap">Live Notebook</span>
                </div>
                <div className="flex items-center space-x-2 pr-2">
                  <div className="flex items-center space-x-1">
                    {/* Delete All Button */}
                    <button
                      onClick={() => setNotes([])}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Clear All Notes"
                    >
                      <Icons.Trash />
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Minus /></button>
                    <button onClick={() => setFontSize(s => Math.min(24, s + 2))} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Plus /></button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button onClick={handleExportNotes} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Icons.Export /></button>
                  </div>
                  {/* Close Button */}
                  <button
                    onClick={() => setIsNotebookOpen(false)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200"
                  >
                    <Icons.Close />
                  </button>
                </div>
              </div>

              {/* Desktop Notebook Content */}
              <div ref={desktopNotebookRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 h-auto pb-4">
                {notes.length === 0 && <div className="text-center text-slate-400 mt-10 text-sm px-4">Notes and summaries from your teacher will appear here automatically.</div>}
                {notes.map((note, idx) => (
                  <RichNotebook
                    key={idx}
                    title={note.title}
                    content={note.content}
                    colorTheme={note.colorTheme}
                    fontSize={fontSize}
                    isWriting={idx === notes.length - 1 && (state === TeacherState.THINKING || state === TeacherState.EXPLAINING)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>



        {state === TeacherState.EXPLAINING && (
          <div className="absolute bottom-20 right-4 md:bottom-8 md:right-96 pointer-events-none z-30">
            <div className="bg-blue-600 text-white px-4 py-2 md:px-6 md:py-3 rounded-full shadow-xl animate-bounce flex items-center space-x-2 text-sm md:text-base">
              <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
              <span>Explaining...</span>
            </div>
          </div>
        )}

        {
          showSettings && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              {/* Backdrop with Animate In */}
              <div
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
                onClick={() => setShowSettings(false)}
              />

              {/* Modal Content - Ultra Compact v3 (Nano Mode) */}
              <div className="relative bg-[#0B1121] w-full max-w-sm rounded-[1.25rem] border border-slate-700/50 shadow-xl overflow-hidden animate-fade-in-up mt-16 md:mt-0">

                {/* Decorative Glow - Smaller */}
                <div className="absolute top-0 right-0 -mt-12 -mr-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="p-2.5 md:p-3 relative z-10 max-h-full overflow-hidden">
                  <h2 className="text-base md:text-lg font-bold text-white tracking-tight text-center mb-2">
                    Tutor Config
                  </h2>

                  <div className="space-y-1.5 md:space-y-2">
                    {/* Voice Section */}
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">Voice</label>
                      <div className="grid grid-cols-2 gap-2">
                        {VOICE_OPTIONS.map((v) => {
                          const isSelected = sessionConfig.voiceName === v.name;
                          return (
                            <button
                              key={v.name}
                              onClick={() => setSessionConfig({ ...sessionConfig, voiceName: v.name })}
                              className={`relative group p-1 md:p-1.5 rounded-lg border transition-all duration-200 text-left hover:scale-[1.02] active:scale-[0.98] ${isSelected
                                ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_10px_-5px_rgba(59,130,246,0.3)]'
                                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                                }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span className={`font-bold text-sm ${isSelected ? 'text-blue-400' : 'text-slate-200'}`}>{v.name}</span>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_currentColor]" />}
                              </div>
                              <div className="text-[8px] md:text-[9px] text-slate-500 font-medium truncate leading-none mt-0.5">{v.style}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Language Section */}
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">Language</label>
                      <div className="flex gap-1.5">
                        {['English', 'Arabic'].map((lang) => {
                          const isSelected = sessionConfig.language === lang;
                          return (
                            <button
                              key={lang}
                              onClick={() => setSessionConfig({ ...sessionConfig, language: lang as any })}
                              className={`flex-1 relative overflow-hidden p-1.5 rounded-lg border transition-all duration-200 font-bold text-xs ${isSelected
                                ? lang === 'English'
                                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                                  : 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                            >
                              <span className="relative z-10 flex items-center justify-center gap-1.5">
                                {lang === 'English' ? '🇬🇧' : '🇪🇬'} <span className="text-xs md:text-sm">{lang}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Teaching Style Section */}
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">Style</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'Funny', emoji: '😄', color: 'bg-amber-500', border: 'border-amber-500', shadow: 'shadow-amber-900/40' },
                          { id: 'Strict', emoji: '🧐', color: 'bg-slate-600', border: 'border-slate-500', shadow: 'shadow-slate-900/40' },
                          { id: 'Supportive', emoji: '🤗', color: 'bg-purple-600', border: 'border-purple-500', shadow: 'shadow-purple-900/40' }
                        ].map((style) => {
                          const isSelected = sessionConfig.persona === style.id;
                          return (
                            <button
                              key={style.id}
                              onClick={() => setSessionConfig({ ...sessionConfig, persona: style.id as any })}
                              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200 gap-0.5 ${isSelected
                                ? `${style.color} ${style.border} text-white shadow-md ${style.shadow} scale-105`
                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                            >
                              <span className="text-sm md:text-base">{style.emoji}</span>
                              <span className="text-[8px] font-bold">{style.id}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-2 md:mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setShowSettings(false)}
                      className="px-4 py-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors hover:bg-white/5"
                    >
                      Cancel
                    </button>

                    {state === TeacherState.IDLE ? (
                      <button
                        onClick={() => handleStartSession()}
                        className="flex-1 relative group overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:to-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                          Start Learning 🚀
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartSession()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
                      >
                        Restart Lesson 🔄
                      </button>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )
        }

        {/* 🛌 Teacher Wake-Up Loader */}
        {
          isWakingUp && !isReconnecting && ( // 🛑 enh25: Don't show full-screen loader on silent reconnect
            <WakeUpTeacherLoader imageUrl={sleepingTeacherImg} />
          )
        }

        {/* 🔄 Silent Reconnect Loader (enh25) */}
        {
          isReconnecting && !disconnectReason && (
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[60] animate-fade-in pointer-events-none">
              <div className="bg-blue-900/40 backdrop-blur-xl px-5 py-2.5 rounded-full flex items-center space-x-3 shadow-[0_0_20px_rgba(59,130,246,0.2)] border border-blue-400/20">
                <Icons.Wifi className="w-4 h-4 text-blue-300 animate-pulse" />
                <span className="text-blue-100 text-sm font-medium tracking-wide">
                  Slow connection, reconnecting...
                </span>
                <div className="flex space-x-1 ml-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                </div>
              </div>
            </div>
          )
        }

        {/* 🚨 Disconnection Alert */}
        {
          disconnectReason && !showSettings && (
            <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 animate-bounce-in">
              <div className="bg-red-500/90 backdrop-blur text-white px-6 py-4 rounded-2xl shadow-2xl border border-red-400 flex flex-col items-center space-y-3 max-w-sm">
                <div className="flex items-center space-x-3">
                  <Icons.Wifi className="w-6 h-6 animate-pulse" />
                  <span className="font-bold text-lg">Connection Lost</span>
                </div>
                <p className="text-sm text-red-100 text-center leading-relaxed">
                  {disconnectReason.length > 60 ? disconnectReason.substring(0, 60) + '...' : disconnectReason}
                </p>
                <div className="flex space-x-3 w-full pt-2">
                  <button
                    onClick={() => setDisconnectReason(null)}
                    className="flex-1 py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 transition text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleStartSession()}
                    className="flex-1 py-2 px-4 rounded-xl bg-white text-red-600 hover:bg-red-50 transition text-sm font-bold shadow-lg"
                  >
                    Reconnect
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </main>

      {/* Mobile Source FAB (Top-Left) */}
      {
        isMobile && state !== TeacherState.IDLE && (
          <>
            <MobileSourceFAB
              onCameraCapture={handleCameraCapture}
              onUploadPDF={handleUploadPdf}
              onReturnToBoard={handleBoard}
              sessionActive={true}
            />
            {/* 🎯 First-time User Hint */}
            <div className="fixed top-48 left-20 z-[101] animate-bounce pointer-events-none opacity-0 animate-fade-in-delayed" style={{ animationDelay: '2s', animationFillMode: 'forwards' }}>
              <div className="bg-blue-600/90 text-white px-3 py-2 rounded-lg text-xs shadow-xl backdrop-blur border border-blue-400 font-bold">
                ← Tap here to upload PDF or Photo
              </div>
            </div>
          </>
        )
      }

      {/* Floating More FAB - Mobile Only - Hidden in IDLE */}
      {
        isMobile && state !== TeacherState.IDLE && (
          <FloatingMoreFAB
            onToolSelect={(tool) => setActiveTool(tool)}
            onOpenNotes={() => setStageSplit(40)}
            activeTool={activeTool}
            sessionActive={true}
            stageSplit={stageSplit}
            activeColor={activeColor}
            onColorSelect={setActiveColor}
            activeWidth={activeWidth}
            onWidthSelect={setActiveWidth}
            onClearDrawings={clearStrokes}
          />
        )
      }


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