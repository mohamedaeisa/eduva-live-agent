/**
 * LiveSessionService.ts
 * Refactored for Edusync Compliance (Streaming Audio + Continuous Input)
 */

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
  FunctionDeclaration,
  StartSensitivity,
  EndSensitivity,
} from '@google/genai';

// Extend Window interface for webkitAudioContext support
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

import { MODELS, GET_SYSTEM_INSTRUCTION } from '../constants';
// --- Turn Authority Enum ---
export enum TurnState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  GENERATING = 'GENERATING',
  SPEAKING = 'SPEAKING'
}

/* --- Transport Strategy --- */
export type TransportState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'RECONNECTING';

import { DrawingAction, NoteData, SessionConfig, QuickAction, BoardSource } from '../types';

/* =========================
   Tool Declarations
========================= */

const drawOnScreenTool: FunctionDeclaration = {
  name: 'drawOnScreen',
  description: 'Draw annotations on the student screen for any mode (Board, PDF, or Screen Share). Use 0-1000 normalized coordinates for precision.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: { 
        type: Type.STRING, 
        description: "The type of drawing: 'circle' to highlight, 'arrow' to point, 'highlight' for text blocks, 'freehand' for custom lines/shapes, or 'text' for labels." 
      },
      x: { type: Type.NUMBER, description: "X coordinate (0-1000 normalized)" },
      y: { type: Type.NUMBER, description: "Y coordinate (0-1000 normalized)" },
      width: { type: Type.NUMBER, description: "Width or radius (normalized 0-1000)" },
      height: { type: Type.NUMBER, description: "Height (normalized 0-1000)" },
      color: { type: Type.STRING, description: "Hex color (e.g., #ff0000)" },
      label: { type: Type.STRING, description: "Text to display near the drawing or inside the text box" },
      points: { 
        type: Type.ARRAY, 
        items: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
          required: ['x', 'y'],
        },
        description: "List of points for 'freehand' drawings. Coordinates 0-1000."
      }
    },
    required: ['actionType', 'x', 'y', 'color'],
  },
};

const updateNotebookTool: FunctionDeclaration = {
  name: 'updateNotebook',
  description: 'Update student notebook with rich text notes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      content: { type: Type.STRING, description: "Markdown content. Supports GFM tables, KaTeX math ($ E=mc^2 $), and bold/italics." },
      colorTheme: { type: Type.STRING },
    },
    required: ['title', 'content'],
  },
};

const suggestActionsTool: FunctionDeclaration = {
  name: 'suggestActions',
  description: 'Suggest quick actions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      actions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            prompt: { type: Type.STRING },
          },
          required: ['label', 'prompt'],
        },
      },
    },
    required: ['actions'],
  },
};

/* =========================
   Live Session Service
========================= */

export class LiveSessionService {
  private ai!: GoogleGenAI;
  private session: any = null;

  /* ---------- Audio Contexts ---------- */
  private inputCtx!: AudioContext;
  private playbackCtx: AudioContext | null = null; // Dedicated playback context (24kHz)
  private micStream!: MediaStream | null;
  private workletNode!: AudioWorkletNode;

  /* ---------- Streaming Audio State ---------- */
  private nextPlaybackTime = 0;
  private audioParts: string[] = []; // Buffer for incoming Gemini audio chunks
  private speakingTimeout: any = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private isAISpeaking = false;
  private isInterrupted = false; // Flag to ignore zombie audio after hard interrupt

  /* ---------- Visualizer State ---------- */
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  /* ---------- Queue & Connection ---------- */
  private messageQueue: LiveServerMessage[] = [];
  private isProcessingQueue = false;
  private connected = false;
  private muted = false;
  private deadlockTriggered = false;
  private manualDisconnect = false;
  private lastConnectionAttempt = 0;

  private sessionResumptionHandle: string | null = null;
  private hasReceivedAnyAIOutput = false;
  private currentConfig: SessionConfig | null = null; // Phase 12.2: Store config for greeting
  private _audioSuppressed = false; // 🔒 Phase 12.3: Explicit audio suppression
  private hasReceivedAudioForCurrentTurn = false; // 🔒 Phase 12.7: Track turn audio

  private _sessionReady = false; // 🧊 Phase 15: Warm-up guard
  private _lastTurnStartTime = 0; // 🧊 Phase 15: Barge-in debounce
  private _lastVisionTimestamp = 0; // 🧊 Phase 15: Vision binding
  private _lastVisionFrameId = 0; // 📊 Phase 17: Correlation ID
  private _hasSentVisionForThisTurn = false; // 🤝 Phase 16: Coordination
  private _isFirstPayloadOfTurn = false; // ⚛️ Phase 19: Atomic Latch
  private _rescueInProgress = false; // 🔒 Phase 18: Rescue Latch
  private _pendingVisionReason: string | null = null; // ⚖️ Phase 16.2: Vision queue
  private _source: BoardSource = 'none'; // 🧊 Phase 15: Board source tracking
  private activeSources: Set<AudioBufferSourceNode> = new Set(); // 🔒 Barge-In: Track all active audio nodes

  // 🔄 Reconnection State
  private _storedApiKey: string | null = null;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 5;
  private _reconnectTimer: any = null;

  public set source(s: BoardSource) { this._source = s; }
  public get source(): BoardSource { return this._source; }


  /* --- Transport Lifecycle (Phase 10) --- */
  private _transportState: TransportState = 'IDLE';
  private setTransportState(state: TransportState) {
    if (this._transportState === state) return;
    console.log(`[TRANSPORT] ${this._transportState} -> ${state}`);
    this._transportState = state;
    // 🔄 Notify App of critical transport transitions (RECONNECTING / CLOSED)
    if (state === 'RECONNECTING' || state === 'CLOSED') {
      if (this.onState) this.onState(state);
    }
  }
  get transportState() { return this._transportState; }
  get isConnected() { return this._transportState === 'OPEN'; }

  /**
   * 📊 Phase 24: Vision State Traceability
   */
  get visionState(): string {
    if (this._transportState === 'IDLE' || this._transportState === 'CLOSED') return 'SESSION_CLOSED';
    if (this.lastIdleVisionFrame && this._source !== 'none') return 'VISUAL_MODE';
    return 'CONVERSATION_MODE';
  }

  public getLatestVisionMetadata() {
    return this.lastIdleVisionMetadata;
  }

  /* --- Dual Guard (Phase 10.1 / Final) --- */
  /* --- Dual Guard (Phase 10.1 / Final) --- */
  private safeSend(fn: () => void) {
    if (this._transportState !== 'OPEN' || !this.session) return;
    
    // 🔒 Phase 28: Explicit WebSocket ReadyState Check (Robust)
    const ws = (this.session as any).ws || (this.session as any)._ws || (this.session as any).socket || (this.session as any).controller?._ws;
    if (ws && ws.readyState !== WebSocket.OPEN) {
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        console.debug("[TRANSPORT] Socket detected as CLOSED during safeSend");
        this.setTransportState('CLOSED');
      }
      return;
    }

    try {
      fn();
    } catch (e) {
      console.warn("[TRANSPORT] send failed (suppressed):", e);
    }
  }

  private safeSendRealtimeInput(input: any) {
    this.safeSend(() => {
      // ⚛️ Standard SDK Field: media (SDK handles chunks/arrays internally)
      this.session.sendRealtimeInput(input);
    });
  }

  private safeSendClientContent(input: any) {
    this.safeSend(() => this.session.sendClientContent(input));
  }

  private safeSendToolResponse(response: any) {
    this.safeSend(() => {
      console.log(`[TRANSPORT] sendToolResponse count=${response.functionResponses?.length} ts=${Date.now()}`);
      if (typeof this.session.sendToolResponse === 'function') {
        this.session.sendToolResponse(response);
      } else {
        console.warn("[TRANSPORT] sendToolResponse method missing, falling back to generic send");
        this.session.send({ toolResponse: response });
      }
    });
  }
  /* ---------- Turn Authority ---------- */
  private _turnState: TurnState = TurnState.IDLE;
  private _currentTurnReason: string | null = null;
  private currentTurnId: number | null = null;
  private turnCounter = 0;
  private lastIdleVisionFrame: string | null = null; // Phase 5 Buffer
  private lastIdleVisionMetadata: any | null = null; // Phase 9 Metadata
  onTurnReady?: () => void;
  private onVisionRequest?: (reason: string) => void; // 🛟 Phase 16.1: Rescue Trigger
  onGeneration?: (g: boolean) => void;

  /* ---------- Callback Hooks ---------- */
  private onDraw?: (a: DrawingAction) => void;
  private onNote?: (n: NoteData) => void;
  private onActions?: (a: QuickAction[]) => void;
  private onState?: (s: string) => void;

  /* =========================
     Public API
  ========================= */

  setCallbacks(
    onDraw: (a: DrawingAction) => void,
    onNote: (n: NoteData) => void,
    onState: (s: string) => void,
    onActions: (a: QuickAction[]) => void,
    onVisionRequest?: (reason: string) => void
  ) {
    this.onDraw = onDraw;
    this.onNote = onNote;
    this.onState = onState;
    this.onActions = onActions;
    this.onVisionRequest = onVisionRequest;
  }

  /* ---------- TURN AUTHORITY LOGIC ---------- */

  private setTurnState(state: TurnState) {
    if (this._turnState === state) return;
    console.log(`[TURN AUTHORITY] State Transition: ${this._turnState} -> ${state}`);
    this._turnState = state;
    this.onState?.(state);
  }

  get turnState() {
    return this._turnState;
  }

  private startTurn(reason: string): number | null {
    const now = Date.now();
    console.debug(`[LS][startTurn][ENTER] reason=${reason} turnState=${this._turnState} turnId=${this.currentTurnId} transport=${this._transportState} ts=${now}`);

    // 🔒 Phase 24: Hard Gate #1 - No turn unless session is READY
    if (!this._sessionReady) {
      console.warn(`[TURN][DENY] reason=SESSION_NOT_READY ts=${now}`);
      return null;
    }

    // 🔊 Phase 26: Resonant Voice Recovery
    // Ensure the audio output context is awake before we start generating.
    if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().then(() => console.debug("🔊 [LS] Audio Output Resumed (startTurn)"));
    }

    // 🔒 Phase 2: One Turn = One Token
    if (this.currentTurnId !== null) {
      console.warn(`[TURN][DENY] id=null reason=TURN_ACTIVE currentId=${this.currentTurnId} ts=${now}`);
      return null;
    }

    // 🔒 Phase 12.2: Set reason BEFORE any activity or send
    this._currentTurnReason = reason;

    this.turnCounter++;
    this.currentTurnId = this.turnCounter;
    this._lastTurnStartTime = now;
    this._hasSentVisionForThisTurn = false;
    this._isFirstPayloadOfTurn = true; // ⚛️ Rule: Next input carries vision
    this.hasReceivedAudioForCurrentTurn = false;

    const vAge = now - this._lastVisionTimestamp;
    const visionAvailable = this.lastIdleVisionFrame ? "true" : "false";

    // 📊 Phase 22 Trace: Logperception state per turn start
    console.log(`[VISION][STATE] hasFrame=${visionAvailable} session=${this._transportState} turn=${this.turnCounter} ts=${now}`);
    console.log(`[TURN][ALLOW] id=${this.currentTurnId} reason=${reason} visionAvailable=${visionAvailable} visionAge=${vAge} ts=${now}`);

    this.setTurnState(TurnState.GENERATING);
    this.onGeneration?.(true);
    return this.currentTurnId;
  }

  private endTurnOnce(reason: string) {
    if (this.currentTurnId === null) return;
    const tid = this.currentTurnId;
    this.finishTurn(tid, reason);
  }

  private requestTurnEnd(reason: string) {
    console.log(`[TURN AUTHORITY] requestTurnEnd(reason: ${reason})`);
    
    // ⚡ Phase 29: Explicit Server-Side Interruption Signal
    // Forces Gemini to stop generating and clear its internal buffers.
    // Use native turnComplete: true on realtime channel for reliable barge-in.
    if (reason === 'client-side-barge-in' || reason === 'user-interrupted' || reason === 'interrupted-by-text') {
      this.safeSendRealtimeInput({
        turnComplete: true
      });
    }

    this.stopAudioPlayback(reason);
  }

  private stopAudioPlayback(reason: string) {
    this.audioParts = [];
    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop(); } catch (e) { }
      this.currentAudioSource = null;
    }
    // 🔒 Barge-In: Kill ALL scheduled audio nodes immediately
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    this.activeSources.clear();

    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this.isAISpeaking = false;
    this.nextPlaybackTime = this.playbackCtx?.currentTime || 0;

    this.endTurnOnce(reason);
  }

  private finishTurn(id: number | null, reason: string) {
    const now = Date.now();
    console.debug(`[LS][finishTurn][ENTER] id=${id} reason=${reason} state=${this._turnState} hasAudio=${this.hasReceivedAudioForCurrentTurn} ts=${now}`);

    if (id !== null && id !== this.currentTurnId) {
      console.warn(`[LS][finishTurn][IGNORED] idMismatch: current=${this.currentTurnId} target=${id}`);
      return;
    }

    console.log(`[LS][finishTurn][SUCCESS] id=${id} reason=${reason} ts=${now}`);
    this.currentTurnId = null;
    this._currentTurnReason = null;
    this.onGeneration?.(false);
    this.isInterrupted = false; // 🛡️ Fix: Clear interruption flag so new turns can start
    this.setTurnState(TurnState.LISTENING);
    this._audioSuppressed = false; // Ensure unmuted when turn ends
    this.onTurnReady?.();

    // ⚖️ Phase 16.2: Flush pending vision once turn is dead
    if (this._pendingVisionReason) {
      console.log(`[LS][finishTurn][FLUSH] pendingReason=${this._pendingVisionReason} ts=${now}`);
      this.onVisionRequest?.(this._pendingVisionReason);
      this._pendingVisionReason = null;
    }
  }

  get inputAnalyserNode() { return this.inputAnalyser; }
  get outputAnalyserNode() { return this.outputAnalyser; }

  async connect(config: SessionConfig, apiKey: string) {
    console.debug("LiveSessionService: connect called");

    this.manualDisconnect = false;
    this._sessionReady = false;
    this._lastVisionTimestamp = 0;
    this.currentConfig = config; // Store config for greeting generation
    this._storedApiKey = apiKey; // 🔄 Store for reconnect

    const isAutoReconnect = this._transportState === 'RECONNECTING';

    // 🔒 Fix 1: Idempotent connect()
    if (this._transportState === 'CONNECTING' || this._transportState === 'OPEN' || this._transportState === 'CLOSING') {
      console.warn(`[TRANSPORT] connect() ignored - already ${this._transportState}`);
      return;
    }

    const now = Date.now();
    // Allow immediate reconnect if we are in RECONNECTING state
    if (!isAutoReconnect && now - this.lastConnectionAttempt < 2500) {
      throw new Error("Please wait a moment before reconnecting.");
    }
    this.lastConnectionAttempt = now;

    this.setTransportState('CONNECTING');
    this.markTransportClosed("connect-start");

    //  Phase 1 & 2: Authority State Reset
    this._turnState = TurnState.IDLE;
    this.currentTurnId = null;
    this.messageQueue = [];

    this.connected = true;
    this.ai = new GoogleGenAI({ apiKey });

    // 1. Input Audio Setup (16kHz for Gemini)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.inputCtx = new AudioContextClass({ sampleRate: 16000 });

    // 2. Playback Audio Setup (24kHz for Gemini output)
    this.playbackCtx = new AudioContextClass({ sampleRate: 24000 });
    this.nextPlaybackTime = this.playbackCtx.currentTime;

    // 3. Analysers
    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.8;

    this.outputAnalyser = this.playbackCtx.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.8;
    this.outputAnalyser.connect(this.playbackCtx.destination); // Wire output analyser to speakers

    // 4. Mic Stream
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is not supported. Please use HTTPS or localhost.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const micSource = this.inputCtx.createMediaStreamSource(this.micStream);
    micSource.connect(this.inputAnalyser);

    // 5. AudioWorklet for Input Capture
    try {
      const workletUrl = new URL('/audio-processor.js', window.location.origin).href;
      await this.inputCtx.audioWorklet.addModule(workletUrl);
    } catch (e) {
      console.error("LiveSessionService: Failed to load audio-processor.js", e);
      throw new Error(`Failed to load audio processor: ${(e as Error).message}`);
    }

    this.workletNode = new AudioWorkletNode(this.inputCtx, 'audio-stream-processor');
    this.workletNode.port.onmessage = (event) => {
      if (!this.inputCtx) return; // 🔒 Safety Guard: Prevents crash on sudden close
      if (this.inputCtx.state === 'suspended') this.inputCtx.resume();
      this.processAudioChunk(event.data.data); // No gating!
    };

    this.inputAnalyser.connect(this.workletNode);
    this.workletNode.connect(this.inputCtx.destination);

    // 6. Connect to Gemini Live
    const systemInstruction = GET_SYSTEM_INSTRUCTION(config);
    console.log("🐛 FULL SYSTEM INSTRUCTION:", systemInstruction);

    const sessionPromise = this.ai.live.connect({
      model: MODELS.LIVE,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseModalities: [Modality.AUDIO],
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            //startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 20,
            silenceDurationMs: 100,
          }
        },
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } },
        },
        sessionResumption: {
          handle: this.sessionResumptionHandle || undefined
        },
        tools: [
          {
            functionDeclarations: [
              drawOnScreenTool,
              updateNotebookTool,
              suggestActionsTool,
            ],
          },
        ],
      },
      callbacks: {
        onopen: () => {
          console.log("LiveSessionService: Connected");
          this.setTransportState('OPEN');
          this.onState?.('LISTENING');
          
          // 🔄 Reset reconnect state on success
          this._reconnectAttempts = 0;
          if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
          }

          //  Phase 26: Audio Output Warmup
          if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
            this.playbackCtx.resume().then(() => console.debug("🔊 [LS] Audio Output Resumed (onopen)"));
          }

          // 🔒 Phase 25: Instant Readiness - Transport is OPEN, turns are allowed.
          this._sessionReady = true;
          console.log("🚢 [ONOPEN] Handshake complete. READY for conversation.");

          // 🔥 Phase 26: Legitimate Greeting Turn
          this.sendGreetingTurn();

          setTimeout(() => {
            this.isInterrupted = false;
          }, 3000);
        },
        onmessage: (m) => {
          this.enqueueMessage(m);
        },
        onerror: (e) => {
          console.error("LiveSessionService: Error", e);
          this.handleError(e);
          // 🔄 Trigger reconnect on transport errors
          if (!this.manualDisconnect) {
            this.autoReconnect();
          }
        },
        onclose: () => {
          console.log("LiveSessionService: Closed");
          this.setTransportState('CLOSED');
          this.markTransportClosed("onclose");

          // 🔄 Trigger reconnect on sudden close
          if (!this.manualDisconnect) {
            this.autoReconnect();
          }
        },
      },
    });

    try {
      this.session = await sessionPromise;

      // 7. Send Initial Greeting (REMOVED - handled in onopen)


      // NO DEADLOCK BREAKER.
    } catch (e) {
      this.handleError(e);
    }
  }

  /**
   * RECOVERABLE: Mark transport as closed but keep session state alive.
   */
  private markTransportClosed(reason: string) {
    // 🤝 Phase 16: Turn-Transport Locking
    if (this.currentTurnId !== null) {
      console.warn(`[TRANSPORT] Sudden close while Turn ${this.currentTurnId} is active! (Reason: ${reason})`);
    }
    if (this._transportState === 'CLOSED' && reason !== 'onclose') return;
    console.warn(`LiveSessionService: Transport Closed (${reason})`);
    this.setTransportState('CLOSED');
    this.connected = false;

    // Stop Tracks / Audio Cleanups (But keep Resumption Handle)
    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this.audioParts = [];
    this.messageQueue = [];
    try { this.micStream?.getTracks().forEach(t => t.stop()); } catch (e) { }
    try { this.inputCtx?.close(); } catch (e) { }
    try { this.playbackCtx?.close(); } catch (e) { }
    try { this.session?.close?.(); } catch (e) { } // Ensure socket is really closed locally

    // Nullify runtime objects
    this.session = null;
    this.inputCtx = null as any;
    this.playbackCtx = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;

    // DO NOT emit 'DISCONNECTED' here (User Panic Button).
    // We are simply "Not Connected" anymore, waiting for a new connect().
    
    // 🔄 Cleanup reconnect timer if we are truly closing
    if (reason === 'shutdown' || reason === 'connect-start') {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
    }
  }

  private autoReconnect() {
    if (this.manualDisconnect) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error("🔄 [RECONNECT] Max attempts reached. Manual intervention required.");
      this.onState?.('DISCONNECTED');
      return;
    }

    if (this._reconnectTimer) return; // Wait for current timer

    this._reconnectAttempts++;
    this.setTransportState('RECONNECTING');
    
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 10000);
    console.log(`🔄 [RECONNECT] Attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts} in ${delay}ms...`);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._storedApiKey && this.currentConfig) {
        this.connect(this.currentConfig, this._storedApiKey).catch(err => {
          console.error("🔄 [RECONNECT] Failed to trigger connect:", err);
          // connect might fail immediately (e.g. invalid key), in which case we might want to try again
          this.autoReconnect(); 
        });
      }
    }, delay);
  }

  /**
   * FATAL: Explicit Shutdown (User Action or Fatal Error).
   */
  async shutdown() {
    // 🔒 Phase 12: Protect against StrictMode double-unmount or IDLE poisoning
    if (this._transportState === 'IDLE') {
      console.debug("LiveSessionService: shutdown ignored (IDLE/Ref-Protection)");
      return;
    }
    if (this._transportState === 'CONNECTING') {
      console.warn("LiveSessionService: shutdown ignored (Premature - currently CONNECTING)");
      return;
    }
    if (this._transportState === 'CLOSING' || this._transportState === 'CLOSED') {
      console.debug(`LiveSessionService: shutdown ignored (Already ${this._transportState})`);
      return;
    }

    console.debug("LiveSessionService: shutdown called (FATAL)");
    this.setTransportState('CLOSING');

    // 1. Kill Resumption
    this.sessionResumptionHandle = null;
    this.manualDisconnect = true; // 🔄 Prevent auto-reconnect

    // 2. Clear Queues (Radio Silence)
    this.messageQueue = [];
    this.audioParts = [];
    this.hasReceivedAnyAIOutput = false;

    // 3. Stop Audio Playback Immediately
    this.stopAudioPlayback("shutdown");

    // 4. Close Transport
    this.markTransportClosed("shutdown");

    // 5. Notify App (Reset UI)
    this.onState?.('DISCONNECTED');
  }

  toggleMute(m: boolean) {
    this.muted = m;
  }

  /**
   * 🔊 Phase 26: Resonant Greeting Turn
   * This refactors the initial greeting into a legitimate speaking turn.
   */
  private sendGreetingTurn() {
    const config = this.currentConfig;
    if (!config || !this._sessionReady) return;

    let greetingPrompt = "";
    const name = config.studentName ? `, addressing the student as "${config.studentName}"` : "";

    if (config.language === 'Arabic') {
      if (config.persona === 'Funny') {
        greetingPrompt = `User connected. You are "Ibn Balad" (Funny Egyptian Tutor). BE SUPER ENERGETIC! Start with a LOUD, WARM, HILARIOUS greeting in Masri slang${name} (e.g., "Ahlan Ya [Name] Ya Basha! Nawarret el Donia!"). Hype me up! Then, IMMEDIATELY say: "Yalla, share your screen or upload a PDF so we can crush this!"`;
      } else {
        greetingPrompt = `User connected. You are ${config.persona}. BE ENERGETIC! Say a warm, energetic hello in Egyptian Arabic${name}. Then, IMMEDIATELY ask me to share my screen or upload a PDF to start.`;
      }
    } else {
      greetingPrompt = `User connected. You are ${config.persona}. Say a warm, energetic hello${name}. Then, ask me to share my screen or upload a PDF to start.`;
    }

    console.log("🔥 [LS] Initiating Resonant Greeting Turn...");
    const tid = this.startTurn("initial-handshake-greeting");
    if (tid !== null) {
      this.sendFirstTurnPayload({ text: greetingPrompt });
    }
  }

  /**
   * 🔒 Phase 23: Explicit Handshake Readiness
   * Call this to unlock turns once PDF is rendered or user says "Ready anyway".
   */
  markHandshakeReady() {
    if (this._sessionReady) return;
    this._sessionReady = true;
    console.log("🚢 [LS] Session READY. Turns unlocked.");
  }

  private sendFirstTurnPayload(payload: { audioBase64?: string; text?: string }) {
    const now = Date.now();
    const parts: any[] = [];

    // ⚛️ Phase 40: Multimodal Atomic Payload
    // If we have text, we use sendClientContent (discrete turn)
    // If we have only audio, we use sendRealtimeInput (streamed turn)

    if (payload.text) {
      // 1. Text Part
      parts.push({ text: payload.text });

      // 2. Vision Context (Atomic)
      if (this.lastIdleVisionFrame) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: this.lastIdleVisionFrame
          }
        });
        if (this.lastIdleVisionMetadata) {
          parts.push({
            text: `[CONTEXT] ${JSON.stringify(this.lastIdleVisionMetadata)}`
          });
        }
        console.log(`[MULTIMODAL][CLIENT_CONTENT] Atomic vision included id=${this._lastVisionFrameId}`);
        this.lastIdleVisionFrame = null;
        this.lastIdleVisionMetadata = null;
      }

      // 3. Send via sendClientContent for discrete Turn Authority
      this.safeSendClientContent({
        turns: [{ role: 'user', parts: parts }],
        turnComplete: true // Revert to camelCase
      });
      console.log(`[MULTIMODAL][CLIENT_CONTENT] Sent Turn ${this.currentTurnId} ts=${now}`);
    } else if (payload.audioBase64) {
      // Realtime Audio path (Consolidated Vision + Audio)
      if (this.lastIdleVisionFrame) {
        // 👁️ Restore Vision: Send via realtimeInput for perfect sync with audio
        this.safeSendRealtimeInput({
          media: {
            mimeType: "image/jpeg",
            data: this.lastIdleVisionFrame
          }
        });
        
        if (this.lastIdleVisionMetadata) {
          // Send context as a separate message on the same channel
          this.safeSendRealtimeInput({
            content: [{ parts: [{ text: `[CONTEXT] ${JSON.stringify(this.lastIdleVisionMetadata)}` }] }]
          });
        }
        
        console.log(`[MULTIMODAL][VISION] Restored to Realtime channel id=${this._lastVisionFrameId}`);
        this.lastIdleVisionFrame = null;
        this.lastIdleVisionMetadata = null;
      }

      this.safeSendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: payload.audioBase64
        }
      });
      console.log(`[MULTIMODAL][REALTIME_INPUT] Sent Audio turnId=${this.currentTurnId} ts=${now}`);
    }

    this._hasSentVisionForThisTurn = true;
    this._isFirstPayloadOfTurn = false;
  }

  sendText(text: string) {
    if (this._transportState !== 'OPEN' || !this.session) return;
    
    // ✋ Phase 35: Interruption Authority
    // 1. Local Interruption
    console.log(`[LS][sendText] Triggering immediate action for: "${text}"`);
    this.requestTurnEnd('interrupted-by-text');

    // 2. Server-Side Barge-In (The "Instant" Trigger)
    this.safeSendRealtimeInput({
      turnComplete: true
    });

    const tid = this.startTurn("user-text-input");
    if (tid === null) return;

    // ⚛️ Phase 20: Use the multimodal injector
    this.sendFirstTurnPayload({ text });
  }

  // private sendInitialGreeting() { REMOVED }

  async bufferVision(base64Image: string, metadata?: any) {
    const now = Date.now();
    const isRescue = metadata?.isRescue === true;
    const frameId = metadata?.frameId || 0;

    // 🧱 Rule: Vision is ONLY a buffer update. NEVER a transport event.
    // 🔒 Phase 22: Hard Gate - Never buffer frames if session is not OPEN
    if (this._transportState !== 'OPEN') {
      console.warn(`[VISION][DROPPED] id=${frameId} reason=SESSION_NOT_OPEN ts=${now}`);
      return;
    }

    if (!base64Image || base64Image.length < 100) return;

    const cleanBase64 = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;

    this.lastIdleVisionFrame = cleanBase64;
    this.lastIdleVisionMetadata = metadata;
    this._lastVisionTimestamp = now;
    this._lastVisionFrameId = frameId;

    console.log(`[VISION][BUFFERED] id=${frameId} source=${this._source} rescue=${isRescue} hasFrame=true ts=${now}`);

    // 🔒 Phase 23: Auto-ready on first frame land
    if (!this._sessionReady) {
      this.markHandshakeReady();
    }
  }

  /* =========================
     Queue Processing
  ========================= */

  private enqueueMessage(msg: LiveServerMessage) {
    // 🔒 Phase 2: Tag message with the ACTIVE turn ID
    (msg as any)._turnId = this.currentTurnId;
    this.messageQueue.push(msg);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.isProcessingQueue = true;
    while (this.messageQueue.length > 0) {
      if (!this.connected) {
        this.messageQueue = [];
        break;
      }
      const msg = this.messageQueue.shift()!;
      // 🔒 Phase 2: Stale Turn Filtering
      if ((msg as any)._turnId !== this.currentTurnId) {
        // Silently drop - especially ignore 'null' turns which are just post-interruption echoes
        if ((msg as any)._turnId !== null) {
          console.debug(`[TURN AUTHORITY] Dropping stale message for turn ${(msg as any)._turnId} (current: ${this.currentTurnId})`);
        }
        continue;
      }

      // Resumption Handle
      if ((msg as any).sessionResumptionUpdate?.resumable) {
        this.sessionResumptionHandle = (msg as any).sessionResumptionUpdate.newHandle;
      }

      // Interruption
      if (msg.serverContent?.interrupted) {
        this.requestTurnEnd("server-interrupted");
        // Clear queue to stop processing stale messages
        this.messageQueue = [];
        // We will reset nextPlaybackTime to current time to stop future scheduling?
        if (this.playbackCtx) {
          // In a real 'stop', we'd need to stop the source nodes, but we don't hold references to them all.
          // Resetting the time helps.
          this.nextPlaybackTime = this.playbackCtx.currentTime;
        }
        continue;
      }

      // Tool Calls
      if (msg.toolCall) {
        this.handleTools(msg);
      }

      // 🔒 Phase 2: Tag turn with the ID it was generated for
      const turnId = (msg as any)._turnId;

      // Audio Data
      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        this.audioParts.push(audioData);
        this.hasReceivedAnyAIOutput = true;
        this.hasReceivedAudioForCurrentTurn = true;
      }

      // Streaming Flush Logic (Edusync Compliance)
      const shouldFlush = this.audioParts.length >= 10 || !!msg.serverContent?.turnComplete;

      if (shouldFlush && this.audioParts.length > 0) {
        const audioToPlay = [...this.audioParts];
        this.audioParts = [];
        this.playGeminiAudioChunks(audioToPlay, turnId);
      }

      if (msg.serverContent?.turnComplete) {
        // 🔒 Phase 12.7: Deadlock guard for text-only responses
        if (turnId !== null && !this.hasReceivedAudioForCurrentTurn && this.audioParts.length === 0) {
          console.warn(`[TURN AUTHORITY] Turn ${turnId} completed with NO audio. Forcing finish.`);
          this.endTurnOnce("turn-complete-no-audio");
        }
      }
    }
    this.isProcessingQueue = false;
  }

  /* =========================
     Audio Pipeline (Edusync Clone)
  ========================= */

  /**
   * Streaming Player
   * Decodes and schedules audio chunks immediately
   */
  private async playGeminiAudioChunks(rawData: string[], turnId: number) {
    if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
      // Should have been initialized in connect, but safety check
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.playbackCtx = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlaybackTime = this.playbackCtx.currentTime;
    }

    try {
      if (rawData.length === 0) {
        // If no audio, but turn is complete, finish the turn
        if (this.currentTurnId === turnId) {
          this.endTurnOnce("no-audio-chunk");
        }
        return;
      }
      const wavBuffer = this.convertToWav(rawData, 24000);
      const audioBuffer = await this.playbackCtx.decodeAudioData(wavBuffer);

      const source = this.playbackCtx.createBufferSource();
      source.buffer = audioBuffer;
      this.currentAudioSource = source;
      this.activeSources.add(source); // 🔒 Barge-In: Add to active set

      // Double Speech Prevention
      // If we are already logically speaking (even if between chunks), we might want to just append. 
      // But user rule: "Right before any AI audio enqueue: if (this.isAISpeaking) return"
      // Wait, playGeminiAudioChunks is called recursively or sequentially. 
      // If we are *already* playing a stream, we shouldn't block *subsequent chunks of the same stream*.
      // But the user said: "Double Speech" guard belongs at the *generation* trigger level or *new turn* level.
      // However, for this surgical fix, if `isAISpeaking` is true and we receive a *new* unrelated audio, that's bad.
      // But distinguishing stream chunks from new turns is hard here.
      // The safer bet for "Surgical Fix" is to rely on the Hard Interrupt to clear state, 
      // and ensure `isAISpeaking` accurately reflects playback.
      // We will set `isAISpeaking = true` here.

      source.onended = () => {
        this.activeSources.delete(source); // 🔒 Barge-In: Remove from active set
        this.currentAudioSource = null;

        // In streaming, we only set LISTENING if this was the last scheduled chunk
        if (this.playbackCtx && this.nextPlaybackTime <= this.playbackCtx.currentTime + 0.1) {
          console.debug("LiveSessionService: Audio Stream Finished (Natural end)");
          this.endTurnOnce("natural-audio-end");
        }
      };

      // Connect Output (Visualizer + Speakers)
      if (this.outputAnalyser) {
        source.connect(this.outputAnalyser);
      } else {
        source.connect(this.playbackCtx.destination);
      }

      // Schedule seamless playback
      const startAt = Math.max(this.nextPlaybackTime, this.playbackCtx.currentTime + 0.05);
      source.start(startAt);

      // AUDIO IS TRUTH: Only set SPEAKING when audio is about to play
      if (!this.isAISpeaking) {
        this.isAISpeaking = true;
        this.onState?.('SPEAKING');
      }

      this.nextPlaybackTime = startAt + audioBuffer.duration;

      // Handle safety tail
      if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
      const timeUntilEnd = (startAt + audioBuffer.duration - this.playbackCtx.currentTime) * 1000;
      this.speakingTimeout = setTimeout(() => {
        if (this.playbackCtx && this.nextPlaybackTime <= this.playbackCtx.currentTime + 0.1) {
          if (this.currentTurnId === turnId) {
            this.endTurnOnce("safety-tail-timeout");
          }
          this.isAISpeaking = false;
        }
      }, Math.max(0, timeUntilEnd) + 500); // 500ms safety tail

    } catch (e) {
      console.error("LiveSessionService: Playback error", e);
    }
  }

  /**
   * Input Processor
   * Continuous transmission (Edusync Compliance)
   */
  private processAudioChunk(float32Data: Float32Array) {
    if (this._transportState !== 'OPEN') return; // 🔒 Phase 14: Hard Send Guard

    // 🔒 Phase 23: Absolute Mic Mute until session is READY
    if (this.muted || !this._sessionReady) return;

    // 1. Convert to PCM
    const pcmData = new Int16Array(float32Data.length);
    let maxVolume = 0;
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]));
      pcmData[i] = s < 0 ? s * 32768 : s * 32767;
      if (Math.abs(s) > maxVolume) maxVolume = Math.abs(s);
    }

    // --- VOICE ACTIVITY TRIGGER (Phase 5: Sync Vision) ---
    // Added 0.1 threshold and isInterrupted check to prevent "Barge-In Storms"
    if (!this.isAISpeaking && this.currentTurnId === null && maxVolume > 0.1 && !this.isInterrupted) {
      // 🤝 Phase 16: Turn Settle Delay (Wait 100ms for vision to "land")
      setTimeout(() => {
        if (!this.isAISpeaking && this.currentTurnId === null && !this.isInterrupted) {
          this.startTurn("user-voice-activity");
        }
      }, 100);
    }

    // 🔒 Phase 12.2: Silence mic chunks during greeting entirely
    // REMOVED: No more suppression.


    // --- HARD INTERRUPT (Client-Side VAD) ---
    // 🧊 Phase 15: Debounce barge-in (Protect first 300ms of turn)
    if (this.isAISpeaking && maxVolume > 0.15) {
      const speechDuration = Date.now() - this._lastTurnStartTime;
      if (speechDuration > 50) { // 🔒 Barge-In: Reduced from 300ms for immediate reaction
        console.warn('[TURN] User interrupted AI (Client-Side Barge-In)');
        this.requestTurnEnd("client-side-barge-in");
      }
    }

    // 2. Base64 Encode
    const uint8 = new Uint8Array(pcmData.buffer);
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Audio = btoa(binary);

    // 3. Send (Safe check for session state)
    // 🔒 Dual Guard (Phase 10.1): Never send after close

    // ⚛️ Phase 20/28: Atomic Multimodal Injection for first chunk
    // 🔒 Fix: ONLY send multimodal first payload if the turn has LOGICALLY started.
    // Otherwise, send raw audio to keep the server's VAD alive.
    if (this._isFirstPayloadOfTurn && this.currentTurnId !== null) {
      this.sendFirstTurnPayload({ audioBase64: base64Audio });
      return; 
    }

    // Subsequent chunks (or VAD trigger chunks) using RELAY-COMPATIBLE 'media' key
    this.safeSendRealtimeInput({
      media: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Audio,
      },
    });
  }

  /* =========================
     Utils
  ========================= */

  /* ---------- STALE METHODS REMOVED ---------- */

  private convertToWav(rawData: string[], sampleRate: number): ArrayBuffer {
    // 1. Decode Base64 to Uint8Array
    const chunks: Uint8Array[] = rawData.map(data => {
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    // 2. Calculate Total Size
    const totalDataLength = chunks.reduce((acc, c) => acc + c.length, 0);

    // 3. Create Header (44 bytes)
    const header = this.createWavHeader(totalDataLength, {
      numChannels: 1,
      sampleRate: sampleRate,
      bitsPerSample: 16
    });

    // 4. Concat Header + Data
    const wavFile = new Uint8Array(header.length + totalDataLength);
    wavFile.set(header, 0);

    let offset = header.length;
    for (const chunk of chunks) {
      wavFile.set(chunk, offset);
      offset += chunk.length;
    }

    return wavFile.buffer;
  }

  private createWavHeader(dataLength: number, options: { numChannels: number; sampleRate: number; bitsPerSample: number }): Uint8Array {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // true = little-endian
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    return new Uint8Array(buffer);
  }

  private handleTools(msg: LiveServerMessage) {
    if (!msg.toolCall) return;
    const functionResponses: any[] = [];
    
    console.log(`[TOOL] Processing ${msg.toolCall.functionCalls.length} tool calls ts=${Date.now()}`);

    for (const fc of msg.toolCall.functionCalls) {
      try {
        console.log(`[TOOL] Executing: ${fc.name} id=${fc.id}`);
        
        if (fc.name === 'drawOnScreen') {
          const args = fc.args as any;
          // Normalize points if provided, otherwise fallback to x,y
          this.onDraw?.({ 
            id: crypto.randomUUID(), 
            type: args.actionType, 
            ...args, 
            points: args.points || (args.x !== undefined && args.y !== undefined ? [{ x: args.x, y: args.y }] : []),
            timestamp: Date.now() 
          });
        } else if (fc.name === 'updateNotebook') {
          this.onNote?.(fc.args as unknown as NoteData);
        } else if (fc.name === 'suggestActions') {
          const rawActions = (fc.args as any).actions;
          if (Array.isArray(rawActions)) {
            // 🛡️ Ultra-Robust Normalization: Handle string arrays, object arrays, and stringified JSON
            const normalized = rawActions.map((a: any) => {
              if (typeof a === 'string') {
                const trimmed = a.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                  try {
                    const parsed = JSON.parse(trimmed);
                    return { 
                      label: parsed.label || parsed.text || trimmed, 
                      prompt: parsed.prompt || parsed.label || trimmed 
                    };
                  } catch (e) {
                    return { label: trimmed, prompt: trimmed };
                  }
                }
                return { label: trimmed, prompt: trimmed };
              }
              // It's an object, but verify properties
              return {
                label: a.label || a.text || "Action",
                prompt: a.prompt || a.label || "Action"
              };
            });
            this.onActions?.(normalized);
          }
        } else {
          console.warn(`[TOOL] Unknown tool: ${fc.name}`);
        }

        functionResponses.push({ 
          id: fc.id, 
          name: fc.name, 
          response: { result: 'ok' } 
        });

      } catch (e) {
        console.error(`[TOOL] Error executing ${fc.name}:`, e);
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { error: (e as Error).message || "Internal error" }
        });
      }
    }

    if (functionResponses.length > 0 && this.isConnected && this.session) {
      this.safeSendToolResponse({ functionResponses });
    }
  }

  private handleError(err: any) {
    const msg = err?.message || '';
    console.error("LiveSessionService Error", err);
    if (msg.includes('429')) this.onState?.('ERROR_QUOTA');
    else if (msg.includes('403')) this.onState?.('ERROR_AUTH');
    else if (!msg.includes('Aborted') && !msg.includes('Network')) this.onState?.('ERROR');
  }

  // Visualizer Getter (Shim)
  getAudioLevels() {
    const userFreq = new Uint8Array(32);
    const aiFreq = new Uint8Array(32);
    if (this.inputAnalyser) this.inputAnalyser.getByteFrequencyData(userFreq);
    if (this.outputAnalyser) this.outputAnalyser.getByteFrequencyData(aiFreq);
    return { user: userFreq, ai: aiFreq };
  }
}