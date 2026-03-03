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
import { MODULE_CONFIGS } from '../../../services/ai/constants';
// --- Turn Authority Enum ---
export enum TurnState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  GENERATING = 'GENERATING',
  SPEAKING = 'SPEAKING'
}

/* --- Transport Strategy --- */
export type TransportState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

import { DrawingAction, NoteData, SessionConfig, QuickAction, BoardSource } from '../types';

/* =========================
   Tool Declarations
========================= */

const drawOnScreenTool: FunctionDeclaration = {
  name: 'drawOnScreen',
  description: 'Draw a visual annotation on the student\'s screen. Coordinates are in IMAGE PIXELS of the screenshot you see (0,0 = top-left corner of the image). Draw exactly on the element you are describing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: { type: Type.STRING, description: 'Annotation type: circle (highlight item), arrow (point to item), highlight (shade area), text (label), freehand (custom shapes/lines)' },
      x: { type: Type.NUMBER, description: 'X position in IMAGE PIXELS from the left edge of the screenshot. Must be within the image bounds.' },
      y: { type: Type.NUMBER, description: 'Y position in IMAGE PIXELS from the top edge of the screenshot. Must be within the image bounds.' },
      width: { type: Type.NUMBER, description: 'Width in image pixels. For circle: radius. For arrow: length. For highlight: box width.' },
      height: { type: Type.NUMBER, description: 'Height in image pixels. For highlight/box: box height. For circle/arrow: can be same as width.' },
      color: { type: Type.STRING, description: 'Hex color. Use #ff6b6b (errors), #4ecdc4 (correct/important), #ffe66d (highlight), #a855f7 (emphasis)' },
      label: { type: Type.STRING, description: 'Optional text label to show alongside the annotation' },
      points: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          }
        },
        description: 'Optional array of {x, y} coordinate objects used ONLY when actionType is "freehand". Used to draw custom shapes, lines, waves, or stars by connecting the dots.'
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
  private _noiseGateOpenUntil: number = 0; // 🛑 enh21: Hold timer for the Audio Soft-Gate
  private _serverTurnCompleteReceived: boolean = false; // 🛑 enh22b: Server's turnComplete signal

  /* ---------- 🔍 Round 12: Debug Flags ---------- */
  private _DEBUG_DISABLE_METADATA = false; // Set to true to test if metadata causes Code 1008






















  /* ---------- 🛡️ Round 13: Interruption & Noise Suppression ---------- */
  private _consecutive_loud_frames = 0; // Track consecutive loud audio frames
  private readonly BARGE_IN_REQUIRED_FRAMES = 2; // Require 2 consecutive loud frames (about 120ms) - Snappier than 3
  private _interruptionConfidence = 0; // 🎯 Phase 100: Weighted confidence score
  private readonly CONFIDENCE_THRESHOLD = 3; // 🛑 enh16: Lowered from 6→3 for faster real-time barge-in response.
  private readonly BARGE_IN_VOLUME_FLOOR = 0.09; // 🎯 enh31: Lowered from 0.08 to catch even more user speech
  private _rollingMinVolume = 0.04; // 🎯 Phase 100: Adaptive noise floor (multiplied by 2 for threshold)
  private _voiceActivationStreak = 0; // enh40: Consecutive loud chunks for turn triggering
  private _lastNoiseFloorUpdate = 0;
  private _serverCooldownUntil = 0; // 🛑 enh10: Cooldown after server-interrupted. Blocks new turns until server stabilizes.
  private _monologueTimer: ReturnType<typeof setTimeout> | null = null; // 🛑 enh14: Max AI speaking duration guard.
  private _falseTriggerRecoveryTimer: ReturnType<typeof setTimeout> | null = null; // ⚡ enh18: Resumes AI if interrupted by noise.




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
  private hasReceivedToolCallForCurrentTurn = false;

  private _sessionReady = false; // 🧊 Phase 15: Warm-up guard
  private _lastTurnStartTime = 0; // 🧊 Phase 15: Barge-in debounce
  private _speakingStartTime = 0; // 🎯 Phase 34: Track when audio ACTUALLY starts playing
  private _isGreetingTurn = false; // 🎯 Phase 35: Protect greeting from echo interrupts
  private _lastVisionTimestamp = 0; // 🧊 Phase 15: Vision binding
  private _lastSentVisionTimestamp = 0; // 🛡️ Phase 45: Network send throttle
  private _lastVisionFrameId = 0; // 📊 Phase 17: Correlation ID
  private _playbackGenerationId = 0; // 🎯 Fix: Generation counter to invalidate stale audio chunks
  private _hasSentVisionForThisTurn = false; // 🤝 Phase 16: Coordination
  private _isFirstPayloadOfTurn = false; // ⚛️ Phase 19: Atomic Latch
  private _rescueInProgress = false; // 🔒 Phase 18: Rescue Latch

  // 🛡️ [BUFFERED TURN START] Safety Mode
  private _isWaitingForInterruptAck = false;
  private _interruptSentTimestamp = 0;
  private _lastInterruptTurnId: number | null = null; // 🛑 Safe Interrupt Tagging
  private _bufferedAudioTokens: Float32Array[] = [];
  private readonly INTERRUPT_ACK_TIMEOUT_MS = 600; // 600ms safety window

  private _pendingVisionReason: string | null = null; // ⚖️ Phase 16.2: Vision queue
  private _source: BoardSource = 'board'; // 🧊 Phase 15 & 38: Default to board
  private _lastFrameFingerprint: string | null = null; // 🎯 Phase 31: Frame deduplication
  private _lastSentFingerprint: string | null = null; // 🎯 Phase 45: Track what we actually sent to AI

  // 🎯 Fix: Track ALL active audio sources to prevent Zombie Audio
  private _activeAudioSources: AudioBufferSourceNode[] = [];

  // 🎯 Phase 39: Audio batching to prevent flood
  private _audioBatchBuffer: Int16Array[] = []; // Raw PCM chunks (not base64 yet)
  private _audioBatchTimer: number | null = null;
  private readonly AUDIO_BATCH_INTERVAL_MS = 200; // Batch every 200ms (Safe for Code 1011)
  private readonly AUDIO_BATCH_SIZE = 24; // 24 chunks (approx 192ms) -> ~5 sends/sec (Stable)

  // 🎯 Phase 39: Send rate monitoring
  private _sendTimestamps: number[] = [];
  private readonly MAX_SENDS_PER_SECOND = 15; // Warning threshold

  // 🎯 Phase 39: Circuit breaker for WebSocket errors
  private _circuitBreakerOpen = false;
  private _circuitBreakerOpenUntil: number | null = null;

  // 🎙️ PTT (Walkie-Talkie) Mode — completely isolated from normal VAD path
  private _pttMode = false;                    // Is PTT mode active?
  private _pttButtonHeld = false;              // Is the button/space currently held?
  private _pttBatchBuffer: Int16Array[] = [];  // Raw PCM — no gate, no zero-fill
  private _pttBatchTimer: number | null = null;
  private readonly PTT_FLUSH_INTERVAL_MS = 80; // 80ms → ~12 sends/sec, ultra-low latency
  private _pttNudgeSent = false;               // True after a no-audio nudge is sent (reset each turn)

  // 📊 Diagnostic Data
  private _sentMessageHistory: { type: string; reason: string; size: number; ts: number }[] = [];
  private readonly HISTORY_SIZE = 10;
  private _totalBytesSent = 0;

  // 🎯 Added: WebSocket reference for direct sending
  // The 'session' object from GoogleGenAI usually abstracts this, but if we need raw control,
  // we might need to rely on the library's send method.
  // However, the error 'Property send does not exist' suggests I was calling 'this.send' which didn't exist.
  // And the 'ws' property doesn't exist on 'this'. 
  // I need to look at how other methods send data.
  // Searching for existing 'send' calls in the file...

  public set source(s: BoardSource) {
    // 🎯 Phase 38: Clear fingerprint when source changes (mode transitions)
    if (this._source !== s) {
      console.log(`[SOURCE_CHANGE] ${this._source} → ${s}, clearing fingerprint cache`);
      this._lastFrameFingerprint = null; // Force next frame to be sent
    }
    this._source = s;
  }
  public get source(): BoardSource { return this._source; }


  /* --- Transport Lifecycle (Phase 10) --- */
  private _transportState: TransportState = 'IDLE';
  private setTransportState(state: TransportState) {
    if (this._transportState === state) return;
    console.log(`[TRANSPORT] ${this._transportState} -> ${state}`);
    this._transportState = state;
  }
  get transportState() { return this._transportState; }
  get isConnected() { return this._transportState === 'OPEN'; }

  /**
   * 📊 Phase 24: Vision State Traceability
   */
  get visionState(): string {
    if (this._transportState === 'IDLE' || this._transportState === 'CLOSED') return 'SESSION_CLOSED';
    if (this.lastIdleVisionFrame && this._source !== 'board') return 'VISUAL_MODE';
    return 'CONVERSATION_MODE';
  }

  /* --- Dual Guard (Phase 10.1 / Final) --- */
  /* --- Dual Guard (Phase 10.1 / Final) --- */
  private safeSend(fn: () => void) {
    if (this._transportState !== 'OPEN' || !this.session) {
      console.error(`🚨 [SAFE_SEND] BLOCKED: transport=${this._transportState} session=${!!this.session}`);
      return;
    }
    try {
      fn();
    } catch (e: any) {
      console.error("🚨 [TRANSPORT] send failed:", e);
      // 🛡️ Fix Loop: If send fails with socket state error, force close immediately
      if (e?.message?.includes('CLOSING') || e?.message?.includes('CLOSED')) {
        console.warn("🚨 [TRANSPORT] Marking CLOSED due to send failure.");
        this.markTransportClosed('send-error');
      }
    }
  }

  private safeSendRealtimeInput(input: any, reason: string = 'unknown') {
    // 🎯 Phase 39: Circuit breaker check
    if (!this.checkCircuitBreaker()) {
      console.warn(`⛔ [CIRCUIT_BREAKER] Blocked send [${reason}] while breaker open`);
      return; // Don't send if circuit breaker is open
    }

    // 🎯 Phase 39: Send rate monitoring
    const now = Date.now();
    this._sendTimestamps.push(now);
    // Clean old timestamps (>1 second ago)
    this._sendTimestamps = this._sendTimestamps.filter(ts => now - ts < 1000);

    // Check rate
    if (this._sendTimestamps.length > this.MAX_SENDS_PER_SECOND) {
      console.warn(`⚠️ [RATE_LIMIT] Exceeded ${this.MAX_SENDS_PER_SECOND} sends/sec. Current: ${this._sendTimestamps.length}`);
    }

    // 🔍 bandwidth & Protocol Logging
    let payloadSize = 0;
    try {
      const json = JSON.stringify(input);
      payloadSize = json.length;
    } catch { }

    const inputType = input?.media ? (input.media.mimeType.includes('audio') ? 'audio' : 'vision') : input?.content ? 'text/metadata' : 'unknown';

    // Log history
    this._sentMessageHistory.push({ type: inputType, reason, size: payloadSize, ts: now });
    if (this._sentMessageHistory.length > this.HISTORY_SIZE) this._sentMessageHistory.shift();
    this._totalBytesSent += payloadSize;

    console.log(`📤 [SEND][${reason}] type=${inputType} size=${(payloadSize / 1024).toFixed(1)}KB total=${(this._totalBytesSent / 1024).toFixed(1)}KB`);

    this.safeSend(() => this.session.sendRealtimeInput(input));
  }

  private safeSendClientContent(input: any, reason: string = 'client-update') {
    // 🔍 bandwidth & Protocol Logging
    const now = Date.now();
    let payloadSize = 0;
    try {
      const json = JSON.stringify(input);
      payloadSize = json.length;
    } catch { }

    console.log(`📤 [SEND][${reason}] type=client_content size=${(payloadSize / 1024).toFixed(1)}KB total=${(this._totalBytesSent / 1024).toFixed(1)}KB`);
    this._totalBytesSent += payloadSize;

    this.safeSend(() => this.session.sendClientContent(input));
  }

  private safeSendToolResponse(response: any, reason: string = 'tool-response') {
    this.safeSend(() => this.session.sendToolResponse(response));
  }
  /* ---------- Turn Authority ---------- */
  private _turnState: TurnState = TurnState.IDLE;
  private _currentTurnReason: string | null = null;
  private currentTurnId: number | null = null;
  private turnCounter = 0;
  private lastIdleVisionFrame: string | null = null; // Phase 5 Buffer
  private lastIdleVisionMetadata: any | null = null; // Phase 9 Metadata
  private _isAudioRestricted: boolean = false;
  onTurnReady?: () => void;
  // onGeneration?: (g: boolean) => void; // This line was removed

  /* ---------- Noise Control (Feature 1 & 2) ---------- */
  private _currentAdaptiveThreshold: number = 0.05;
  private _useAdaptiveNoise: boolean = true;
  private _fixedNoiseThreshold: number = 0.05;
  // _lastCaptureHeight: tracks the pixel height of the last vision screenshot for coordinate mapping
  private _lastCaptureHeight: number = 576;

  /* ---------- Callback Hooks ---------- */
  public onDraw?: (a: DrawingAction) => void;
  public onNote?: (n: NoteData) => void;
  public onState?: (s: string) => void;
  public onVisionRequest?: (reason: string) => void;
  public onDisconnect?: (reason: string) => void;

  public onAiStatusChange?: (status: 'speaking' | 'listening') => void;
  public onGeneration?: (isGenerating: boolean) => void;
  public onVisionModeStart?: () => void;
  public onVisionModeEnd?: () => void;

  /* =========================
     Public API
  ========================= */

  setCallbacks(
    onDraw: (a: DrawingAction) => void,
    onNote: (n: NoteData) => void,
    onState: (s: string) => void,
    onVisionRequest?: (reason: string) => void,
    onDisconnect?: (reason: string) => void
  ) {
    this.onDraw = onDraw;
    this.onNote = onNote;
    this.onState = onState;
    this.onVisionRequest = onVisionRequest;
    this.onDisconnect = onDisconnect;
  }

  /* ---------- Noise Control Public API ---------- */
  get noiseThreshold(): number { return this._currentAdaptiveThreshold; }
  get rollingNoiseFloor(): number { return this._rollingMinVolume; }
  get isAdaptiveMode(): boolean { return this._useAdaptiveNoise; }
  get fixedNoiseThreshold(): number { return this._fixedNoiseThreshold; }

  setAdaptiveMode(adaptive: boolean) {
    this._useAdaptiveNoise = adaptive;
    console.log(`[NOISE] Mode set to ${adaptive ? 'ADAPTIVE' : 'FIXED'} threshold=${this._fixedNoiseThreshold}`);
  }

  setFixedNoiseThreshold(value: number) {
    this._fixedNoiseThreshold = Math.max(0.01, Math.min(0.8, value));
    console.log(`[NOISE] Fixed threshold set to ${this._fixedNoiseThreshold}`);
  }

  /** Called by DocumentStage so we know the capture canvas height for coordinate mapping */
  setCaptureHeight(h: number) {
    if (h > 0 && h < 10000) this._lastCaptureHeight = h;
  }

  /* ---------- PTT (Walkie-Talkie) Public API ---------- */

  /**
   * 🎙️ Toggle PTT mode on/off.
   * Called by BottomToolbar when user clicks the walkie-talkie icon.
   * Enabling: VAD path in processAudioChunk is bypassed entirely.
   * Disabling: PTT state is cleaned up; any in-flight turn completes naturally.
   */
  setWalkieTalkieMode(enabled: boolean) {
    this._pttMode = enabled;
    console.log(`[PTT] Mode ${enabled ? 'ENABLED' : 'DISABLED'}`);

    if (!enabled) {
      // Graceful exit: stop sending PTT audio, cancel pending flush timer
      this._pttButtonHeld = false;
      this._pttBatchBuffer = [];
      if (this._pttBatchTimer !== null) {
        clearTimeout(this._pttBatchTimer);
        this._pttBatchTimer = null;
      }
      // NOTE: We do NOT kill an active turn. Let it complete naturally so the AI
      // finishes its response and state returns to LISTENING on its own.
    }
  }

  /**
   * 🎙️ Called on PTT button press (true) or release (false) — including Space key.
   *
   * PRESS:  Interrupt AI immediately (if speaking), then start collecting raw audio.
   * RELEASE: Flush remaining audio, send turn_complete so Gemini knows user is done.
   */
  setPttActive(pressed: boolean) {
    console.log(`[PTT_DEBUG] setPttActive(${pressed}) called. _pttMode=${this._pttMode}, _pttButtonHeld=${this._pttButtonHeld}, currentTurnId=${this.currentTurnId}, isAISpeaking=${this.isAISpeaking}`);
    if (!this._pttMode) return; // Safety: ignore if not in PTT mode

    if (pressed) {
      if (this._pttButtonHeld) {
        console.log('[PTT_DEBUG] Button PRESSED — ignored (already held)');
        return; // Debounce: ignore repeated presses
      }
      this._pttButtonHeld = true;
      console.log(`[PTT_DEBUG] Button PRESSED — preparing to talk. _isWaitingForInterruptAck=${this._isWaitingForInterruptAck}`);

      // Interrupt AI immediately if it is generating or speaking
      const aiIsActive =
        this.isAISpeaking ||
        this._turnState === TurnState.SPEAKING ||
        this._turnState === TurnState.GENERATING;

      if (aiIsActive) {
        console.log(`[PTT_DEBUG] Interrupting AI to take the floor... (TurnState=${this._turnState})`);
        this.requestTurnEnd('ptt-barge-in');
        // requestTurnEnd sets _isWaitingForInterruptAck = true.
        // processAudioChunk will hold startTurn until the server acks.
      }
    } else {
      // Button Released — signal end of user speech via silence stream
      if (!this._pttButtonHeld) {
        console.log('[PTT_DEBUG] Button RELEASED — ignored (was not held)');
        return; // Debounce: ignore repeated releases
      }
      this._pttButtonHeld = false;
      console.log(`[PTT_DEBUG] Button RELEASED — stopping voice capture. currentTurnId=${this.currentTurnId}`);

      // Flush any remaining buffered audio first
      this._flushPttBatch();

      const capturedTurnId = this.currentTurnId;
      if (capturedTurnId === null) {
        console.warn('[PTT_DEBUG] Button RELEASED but currentTurnId is null (turn never started). No silence stream needed.');
        return;
      }

      // ─── SILENCE STREAM: matches normal mode VAD behavior ────────────────
      // The native audio model rejects clientContent while realtimeInput is active (1007).
      // Normal mode closes turns by zero-filling silence → server VAD detects it and fires
      // turnComplete automatically after ~700ms. We do the same here.
      //
      // We send N chunks of perfect silence (zero PCM) at 80ms intervals.
      // Server VAD will recognize silence → close the turn → AI responds.
      // ──────────────────────────────────────────────────────────────────────────
      const SILENCE_CHUNK_SAMPLES = 1280; // 16000Hz × 0.08s (80ms per chunk)
      const SILENCE_DURATION_MS = 800;    // Stream silence for 800ms total
      const SILENCE_INTERVAL_MS = 80;     // Match PTT flush interval
      const silenceChunk = new Int16Array(SILENCE_CHUNK_SAMPLES); // Already zeroed
      const silenceU8 = new Uint8Array(silenceChunk.buffer);
      let silenceBin = '';
      for (let i = 0; i < silenceU8.byteLength; i++) silenceBin += String.fromCharCode(silenceU8[i]);
      const silenceBase64 = btoa(silenceBin);

      let silenceSent = 0;
      const totalChunks = Math.ceil(SILENCE_DURATION_MS / SILENCE_INTERVAL_MS); // 10 chunks

      console.log(`[PTT] Button RELEASED — streaming ${totalChunks} silence chunks (${SILENCE_DURATION_MS}ms) → server VAD will close turn ${capturedTurnId}`);

      const silenceInterval = window.setInterval(() => {
        silenceSent++;
        if (this.currentTurnId !== capturedTurnId || this._transportState !== 'OPEN') {
          // Turn already ended (AI interrupted, reconnect, etc.) — stop streaming
          window.clearInterval(silenceInterval);
          return;
        }
        this.safeSendRealtimeInput(
          { media: { mimeType: 'audio/pcm;rate=16000', data: silenceBase64 } },
          `PTT_SILENCE_${silenceSent}`
        );
        if (silenceSent >= totalChunks) {
          window.clearInterval(silenceInterval);
          console.log(`[PTT] Silence stream complete — server VAD should close turn ${capturedTurnId} shortly`);
          // Note: We do NOT set currentTurnId to null here. We wait for the server to transition to SPEAKING.
        }
      }, SILENCE_INTERVAL_MS);
    }
  }

  /**
   * 🎙️ Internal: flush _pttBatchBuffer → single sendRealtimeInput call (raw audio, no gate).
   * Splits at 15KB to match normal mode's WebSocket safety limit.
   */
  private _flushPttBatch() {
    if (this._pttBatchTimer !== null) {
      clearTimeout(this._pttBatchTimer);
      this._pttBatchTimer = null;
    }

    const chunkCount = this._pttBatchBuffer.length;
    if (chunkCount === 0) return;

    // Guard: must have an active turn to send audio
    if (!this.isConnected || this.currentTurnId === null) {
      // 🛡️ PTT Recovery: If the turn was closed externally (e.g. cooldown, server interrupt, timeout)
      // but the user is STILL holding the button, automatically restart the turn!
      if (this._pttButtonHeld && this.isConnected) {
        console.warn(`[PTT][RECOVERY] Turn was closed while button held. Attempting to restart turn.`);
        this.startTurn("ptt-voice-recovery");
      }

      if (!this.isConnected || this.currentTurnId === null) {
        console.warn(`[PTT][DROP] ${chunkCount} chunks dropped — no active turn`);
        this._pttBatchBuffer = [];
        return;
      }
    }

    // Merge all queued PCM chunks into one contiguous array
    const totalLength = this._pttBatchBuffer.reduce((s, c) => s + c.length, 0);
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of this._pttBatchBuffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this._pttBatchBuffer = []; // Clear early

    // Encode and send, splitting at 15KB to avoid WebSocket flooding
    const uint8 = new Uint8Array(combined.buffer);
    const MAX_CHUNK_BYTES = 15360; // 15KB — same as flushAudioBatch

    for (let off = 0; off < uint8.byteLength; off += MAX_CHUNK_BYTES) {
      const sub = uint8.subarray(off, Math.min(off + MAX_CHUNK_BYTES, uint8.byteLength));
      let binary = '';
      const STEP = 0x8000;
      for (let j = 0; j < sub.byteLength; j += STEP) {
        binary += String.fromCharCode.apply(null, Array.from(sub.subarray(j, j + STEP)));
      }
      this.safeSendRealtimeInput(
        { media: { mimeType: 'audio/pcm;rate=16000', data: btoa(binary) } },
        'PTT_AUDIO'
      );
    }
    console.log(`🎙️ [PTT][FLUSH] Sent ${chunkCount} raw audio chunks (~${(Math.round(totalLength * 2 / 102.4) / 10).toFixed(1)} KB) to server`);
  }



  private setTurnState(state: TurnState) {
    if (this._turnState === state) return;

    // 🛡️ Fix Loop: Block state updates if transport is dead (unless resetting to IDLE)
    if (this._transportState !== 'OPEN' && state !== TurnState.IDLE) {
      console.warn(`[TURN AUTHORITY] Blocked state transition to ${state} because transport is ${this._transportState}`);
      return;
    }

    console.log(`[TURN AUTHORITY] State Transition: ${this._turnState} -> ${state} (Turn: ${this.currentTurnId})`);

    // 🛑 enh36: Ghost Loop Fix.
    // If we are returning to LISTENING from a previous turn, we MUST sever the 1500ms gate hold timer.
    // Otherwise, the very next 40ms audio chunk will see "GateOpen=true" and instantly trigger a massive silent 20s ghost turn.
    if (state === TurnState.LISTENING) {
      this._noiseGateOpenUntil = 0;
    }

    this._turnState = state;
    this.onState?.(state);

    if (state === TurnState.GENERATING) {
      const turnIdForWatchdog = this.currentTurnId;
      // 🛡️ enh18: Increased watchdog from 8s to 12s. 8s was too aggressive for 
      // multimodal/vision processing, causing many valid turns to be force-ended.
      setTimeout(() => {
        if (this._turnState === TurnState.GENERATING && this.currentTurnId === turnIdForWatchdog) {
          if (this._transportState === 'OPEN') {
            console.warn(`[TURN AUTHORITY] Watchdog: GENERATING stuck > 12s for Turn ${turnIdForWatchdog}. Force ending.`);
            this.requestTurnEnd("watchdog-timeout");
          } else {
            console.warn(`[TURN AUTHORITY] Watchdog: Silent cleanup for Turn ${turnIdForWatchdog} (transport=${this._transportState}).`);
            this.endTurnOnce("watchdog-cleanup");
          }
        }
      }, 20000);  // 20,000 milliseconds = 20 seconds
    }
  }

  get turnState() {
    return this._turnState;
  }

  private startTurn(reason: string): number | null {
    const now = Date.now();
    console.log(`[TURN AUTHORITY] startTurn reason=${reason} nextTurnId=${this.turnCounter + 1} currentId=${this.currentTurnId} isInterrupted=${this.isInterrupted} pttMode=${this._pttMode} pttHeld=${this._pttButtonHeld} transport=${this._transportState} ts=${now}`);

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

    //  enh10: Server cooldown guard.
    // After a failed/interrupted turn (no AI audio response), the server needs time to
    // flush its internal state. Reject new user-voice-activity turns during this window
    // to prevent the noise floor VAD creating an infinite silent-turn loop.
    if ((reason === 'user-voice-activity' || reason === 'ptt-voice') && now < this._serverCooldownUntil) {
      const remaining = (this._serverCooldownUntil - now).toFixed(0);
      console.debug(`[TURN][DENY] reason=SERVER_COOLDOWN(${reason}) remaining=${remaining}ms ts=${now}`);
      return null;
    }


    this._currentTurnReason = reason;

    this.turnCounter++;
    this.currentTurnId = this.turnCounter;
    this._lastTurnStartTime = now;
    this._playbackGenerationId++; // 🎯 Fix: Generation counter to invalidate stale audio chunks
    this._hasSentVisionForThisTurn = false;
    this._isFirstPayloadOfTurn = true; // ⚛️ Rule: Next input carries vision
    this.hasReceivedAudioForCurrentTurn = false;
    this.hasReceivedToolCallForCurrentTurn = false;
    this.hasReceivedAnyAIOutput = false;      // 🛑 Stale Turn Protection Fix: Must reset per turn!
    this._serverTurnCompleteReceived = false; // 🛑 enh22b: Reset server signal
    this._pttNudgeSent = false;               // 🛑 PTT Fix: Reset nudge flag for new turn

    // ⚡ enh18: Clear recovery timer if a new turn starts manually
    if (this._falseTriggerRecoveryTimer) {
      clearTimeout(this._falseTriggerRecoveryTimer);
      this._falseTriggerRecoveryTimer = null;
    }

    const vAge = now - this._lastVisionTimestamp;
    const visionAvailable = this.lastIdleVisionFrame ? "true" : "false";

    // 📊 Phase 22 Trace: Logperception state per turn start
    console.log(`[VISION][STATE] hasFrame=${visionAvailable} session=${this._transportState} turn=${this.turnCounter} ts=${now}`);
    console.log(`[TURN][ALLOW] id=${this.currentTurnId} reason=${reason} visionAvailable=${visionAvailable} visionAge=${vAge} ts=${now}`);

    this.setTurnState(TurnState.GENERATING);
    this.onGeneration?.(true);
    return this.currentTurnId;
  }



  private stopAudioPlayback(reason: string) {
    this._playbackGenerationId++; // 🎯 Fix: Invalidate all pending/decoding chunks
    this.audioParts = [];

    // 🛑 enh14: Clear monologue limiter timer on any playback stop
    if (this._monologueTimer) {
      clearTimeout(this._monologueTimer);
      this._monologueTimer = null;
    }

    // 🛡️ Phase 101: Buffer Preservation during Barge-in
    // If user interrupts, we KEEP the buffer so it's sent in the next turn start.
    if (reason !== 'client-side-barge-in') {
      this._audioBatchBuffer = []; // Clear pending uploads for other reasons (e.g., natural end)
    }

    if (this._audioBatchTimer) {
      clearTimeout(this._audioBatchTimer);
      this._audioBatchTimer = null;
    }

    // 🎯 Fix: Stop ALL active sources, not just the last one
    this._activeAudioSources.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    this._activeAudioSources = [];
    this.currentAudioSource = null;
    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this.isAISpeaking = false;
    this._speakingStartTime = 0; // Reset for next speaking turn
    this.nextPlaybackTime = this.playbackCtx?.currentTime || 0;

    // 🛑 enh14: Hard-flush the WebAudio hardware output queue on barge-in.
    // Calling source.stop() removes nodes from the graph but buffers already
    // submitted to the OS audio subsystem keep playing (zombie audio for 10-15s).
    // suspend() + resume() causes the AudioContext to immediately silence the
    // hardware ring-buffer and restart it clean — no more zombie audio.
    if (reason === 'client-side-barge-in' && this.playbackCtx) {
      this.playbackCtx.suspend().then(() => {
        this.playbackCtx?.resume();
        console.log('🔇 [BARGE-IN] AudioContext flushed (suspend+resume). Zombie audio cleared.');
      }).catch(() => { this.playbackCtx?.resume(); });
    }

    this.endTurnOnce(reason);
  }

  private endTurnOnce(reason: string) {
    const id = this.currentTurnId;
    const now = Date.now();

    // Guard: Don't duplicate turn end logic
    if (id === null) return;

    console.log(`[LS][endTurnOnce][ENTER] id=${this.currentTurnId} reason=${reason} state=${this._turnState} hasAudio=${this.hasReceivedAudioForCurrentTurn} ts=${Date.now()}`);

    // BUG FIX 1: Reset Adaptive Threshold to allow user to speak again
    // Only do this if we are not forcibly barging in (during barge-in, we keep the threshold to avoid double-trigger)
    if (reason !== "client-side-barge-in" && reason !== "ptt-barge-in") {
      const oldThresh = this._rollingMinVolume;
      this._rollingMinVolume = 0.04; // Standard low baseline
      console.log(`[NOISE GATE] Reset rolling min volume from ${oldThresh.toFixed(3)} to 0.040 after turn end (${reason})`);
    }

    this.isInterrupted = false; // 🛡️ Fix: Clear interruption flag so new turns can start
    this._isWaitingForInterruptAck = false; // 🔓 Iteration 5 Fix: Universally release stuck interrupt locks when a turn dies
    // 🛑 enh18: Capture prevState BEFORE transition so we know if AI was generating or speaking
    const prevState = this._turnState;
    this.setTurnState(TurnState.LISTENING);
    this._audioSuppressed = false; // Ensure unmuted when turn ends
    this.onTurnReady?.();

    console.log(`[LS][endTurnOnce][SUCCESS] id=${id} reason=${reason} ts=${now}`);
    this.currentTurnId = null;
    this._currentTurnReason = null;
    this.hasReceivedToolCallForCurrentTurn = false;
    this.onGeneration?.(false);

    // 🛑 enh10: Apply server cooldown when a turn ends with NO audio response.
    // This happens when the server sends "server-interrupted" without replying.
    // Without a cooldown, the noise floor VAD immediately re-triggers a new turn,
    // which gets server-interrupted again, creating an infinite deaf loop.
    const wasGreeting = this._isGreetingTurn;
    this._isGreetingTurn = false; // Reset greeting flag for next turn

    if (!this.hasReceivedAudioForCurrentTurn && !this.hasReceivedToolCallForCurrentTurn) {
      // 🛑 enh18: Zero cooldown when interrupted during GENERATING (AI never spoke).
      // If the AI was still thinking when interrupted, the server is already idle —
      // no need to block the user. Only apply 500ms for SPEAKING interruptions.
      const wasGenerating = prevState === TurnState.GENERATING;
      const COOLDOWN_MS = reason === 'natural-audio-end' ? 0
        : ((reason === 'server-interrupted' || reason === 'turn-complete-no-audio') && wasGenerating) ? 0   // 🛑 enh20: AI aborted before speaking
          : (reason === 'watchdog-timeout' || reason === 'watchdog-cleanup') ? 0 // ⚡ enh18: No penalty for timeout
            : (reason === 'ptt-barge-in' || reason === 'ptt-silence-timeout') ? 0 // 🎙️ PTT: intentional interrupts need no cooldown
              : reason === 'server-interrupted' ? 500                    // AI was mid-speech
                : (reason === 'turn-complete-no-audio') ? 0              // 🛑 enh20: Zero penalty for dropped empty turns
                  : 2000;
      if (COOLDOWN_MS > 0) {
        this._serverCooldownUntil = now + COOLDOWN_MS;
        console.warn(`⏳ [COOLDOWN] No AI response for turn ${id} (${reason}). Blocking new user turns for ${COOLDOWN_MS}ms.`);
      } else {
        console.debug(`⚡ [COOLDOWN] Zero cooldown for ${reason} (wasGenerating=${wasGenerating}) — user can speak immediately.`);
      }

      // ⚡ enh18: False Trigger Recovery
      // If the AI was interrupted by the server, but we don't detection valid speech,
      // wait 1.5s and then automatically tell the AI to continue.
      if (reason === 'server-interrupted' && !wasGenerating) {
        if (this._falseTriggerRecoveryTimer) clearTimeout(this._falseTriggerRecoveryTimer);
        this._falseTriggerRecoveryTimer = setTimeout(() => {
          if (this.currentTurnId === null && this._turnState === TurnState.LISTENING) {
            console.log("🔄 [RECOVERY] No user speech detected after interrupt. Resuming AI...");
            this.sendFirstTurnPayload({
              text: "I didn't say anything, it was just background noise. Please continue exactly where you left off."
            });
            this.setTurnState(TurnState.GENERATING);
          }
        }, 2000); // 2s window to catch user speech
      }
    } else if (wasGreeting) {
      // After greeting ends successfully, give server 1.5s to flush state
      this._serverCooldownUntil = now + 1500;
      console.log(`⏳ [COOLDOWN] Greeting ended. Cooldown 1500ms before user turns allowed.`);
    }

    // ⚖️ Phase 16.2: Flush pending vision once turn is dead
    if (this._pendingVisionReason) {
      console.log(`[LS][endTurnOnce][FLUSH] pendingReason=${this._pendingVisionReason} ts=${now}`);
      this.onVisionRequest?.(this._pendingVisionReason);
      this._pendingVisionReason = null;
    }
  }

  get inputAnalyserNode() { return this.inputAnalyser; }
  get outputAnalyserNode() { return this.outputAnalyser; }

  async connect(config: SessionConfig, apiKey: string, apiKeyName: string = 'API_KEY_UNKNOWN', forcedModel?: string, isReconnecting: boolean = false) {
    const model = forcedModel || MODULE_CONFIGS.privateteacher.defaultModel;
    console.log(`[TRANSPORT] 🚀 Initiating connection...`);
    console.log(`[TRANSPORT] 🤖 Model: ${model}`);
    console.log(`[TRANSPORT] 🔑 Key: ${apiKeyName}`);

    this.manualDisconnect = false;
    this._sessionReady = false;
    this._lastVisionTimestamp = 0;
    this.currentConfig = config;

    if (this._transportState === 'CONNECTING' || this._transportState === 'OPEN' || this._transportState === 'CLOSING') {
      console.warn(`[TRANSPORT] connect() ignored - already ${this._transportState}`);
      return;
    }

    const now = Date.now();
    if (now - this.lastConnectionAttempt < 2500) {
      throw new Error("Please wait a moment before reconnecting.");
    }
    this.lastConnectionAttempt = now;

    this.setTransportState('CONNECTING');
    this.markTransportClosed("connect-start");

    this._turnState = TurnState.IDLE;
    this.currentTurnId = null;
    this.messageQueue = [];

    this.connected = true;

    // 🛡️ Phase 100: Fresh Resumption Check
    if (this.sessionResumptionHandle) {
      console.log(`📡 [RESUMPTION] Attempting to resume session with handle: ${this.sessionResumptionHandle.substring(0, 10)}...`);
    } else {
      console.log(`📡 [CONNECT] Starting new session (No resumption handle).`);
    }

    const genAI = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta'
    });

    // 1. Input Audio Setup
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.inputCtx = new AudioContextClass({ sampleRate: 16000 });
    this.playbackCtx = new AudioContextClass({ sampleRate: 24000 });
    this.nextPlaybackTime = this.playbackCtx.currentTime;

    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.outputAnalyser = this.playbackCtx.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.connect(this.playbackCtx.destination);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is not supported.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    const micSource = this.inputCtx.createMediaStreamSource(this.micStream);
    micSource.connect(this.inputAnalyser);

    try {
      const workletUrl = new URL('/audio-processor.js', window.location.origin).href;
      await this.inputCtx.audioWorklet.addModule(workletUrl);
    } catch (e) {
      console.error("Failed to load audio-processor.js", e);
    }

    this.workletNode = new AudioWorkletNode(this.inputCtx, 'audio-stream-processor');
    this.workletNode.port.onmessage = (event) => {
      if (!this.inputCtx || this.inputCtx.state === 'closed') return;
      this.processAudioChunk(event.data.data);
    };

    this.inputAnalyser.connect(this.workletNode);
    this.workletNode.connect(this.inputCtx.destination);

    // Inject reconnection context into the session config
    const sessionConfig = { ...config, isReconnecting };

    const sessionPromise = genAI.live.connect({
      model: model,
      config: {
        systemInstruction: GET_SYSTEM_INSTRUCTION(sessionConfig),
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        tools: [{ functionDeclarations: [drawOnScreenTool, updateNotebookTool] }],
        ...(this.sessionResumptionHandle ? { sessionResumptionHandle: this.sessionResumptionHandle } : {})
      } as any,
      callbacks: {
        onopen: async () => {
          console.log("LiveSessionService: Connected");
          this.setTransportState('OPEN');
          this.setTurnState(TurnState.LISTENING);
          if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
            await this.playbackCtx.resume();
          }

          // Await the session to be truly set before proceeding with greeting
          let retries = 0;
          while (!this.session && retries < 10) {
            await new Promise(r => setTimeout(r, 50));
            retries++;
          }

          this._sessionReady = true;

          // 🛑 enh25: Skip greeting if we are resuming an active session!
          if (this.sessionResumptionHandle || isReconnecting) {
            console.log("LiveSessionService: Resuming session - skipping greeting turn (isReconnecting=" + isReconnecting + ")");
          } else {
            this.sendGreetingTurn();
          }
        },
        onmessage: (m) => this.enqueueMessage(m),
        onerror: (e) => {
          console.error("🚨 [WEBSOCKET] ERROR EVENT:", e);
          this.handleError(e);
        },
        onclose: (event: any) => {
          console.log(`🚨 [WEBSOCKET] CLOSE EVENT:`, { code: event.code, reason: event.reason });

          // 🛡️ Phase 100: Hard Purge on 1011 or Unknown Failure
          this.hardPurgeState(true);

          if (event.code === 1011) {
            console.warn(`⚠️ [CODE_1011] Internal Error. Diagnostic: Triggering fresh resumption.`);
            this.onDisconnect?.(`Connection lost (Code 1011): Internal error occurred. Retrying...`);
            this.openCircuitBreaker(2000);
          } else if (event.code !== 1000 && event.code !== 1005) {
            this.onDisconnect?.(`Connection lost (Code ${event.code})`);
          }

          this.markTransportClosed("onclose");
        }
      }
    });

    try {
      this.session = await sessionPromise;
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
    // 🎙️ PTT cleanup — prevent phantom sends if disconnected mid-PTT
    if (this._pttBatchTimer !== null) {
      clearTimeout(this._pttBatchTimer);
      this._pttBatchTimer = null;
    }
    this._pttBatchBuffer = [];
    this._pttButtonHeld = false;

    // 🛑 enh26: Deep Audio Node Annihilation
    // A phantom worklet pushing zeros causes 100% deafness upon reconnect. We MUST dismantle everything.
    try {
      if (this.workletNode) {
        this.workletNode.port.onmessage = null; // Unbind dangling listener immediately
        this.workletNode.port.close();
        this.workletNode.disconnect();
        this.workletNode = null as any;
      }
    } catch (e) { console.error("Error dismantling workletNode:", e); }

    try { this.inputAnalyser?.disconnect(); } catch (e) { }
    try { this.outputAnalyser?.disconnect(); } catch (e) { }
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
    this.micStream = null as any;

    // DO NOT clear resumption handle here.
    // DO NOT emit 'DISCONNECTED' here (User Panic Button).
    // We are simply "Not Connected" anymore, waiting for a new connect().
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
    if (!config || !this._sessionReady) {
      console.warn("[GREETING] Skipped - session not ready or no config");
      return;
    }

    let greetingPrompt = "";
    const studentName = config.studentName || "Student";

    if (config.language === 'Arabic') {
      if (config.persona === 'Funny') {
        greetingPrompt = `IMMEDIATE AUDIO RESPONSE REQUIRED. User just connected. You are "Ibn Balad" (Funny Egyptian Tutor). BE SUPER ENERGETIC! Start with a LOUD, WARM greeting in Masri slang, saying "Ahlan Ya ${studentName} Ya Basha! Nawarret el Donia!" Then ask: "Yalla, share your screen or upload a PDF so we can crush this!"`;
      } else {
        greetingPrompt = `IMMEDIATE AUDIO RESPONSE REQUIRED. User just connected. You are ${config.persona}. BE ENERGETIC! Say a warm hello in Egyptian Arabic to ${studentName}. Then ask them to share their screen or upload a PDF to start.`;
      }
    } else {
      greetingPrompt = `IMMEDIATE AUDIO RESPONSE REQUIRED. User just connected. You are ${config.persona}. Say a warm, energetic hello to ${studentName}. Then ask them to share their screen or upload a PDF so we can start studying together.`;
    }

    console.log("🔥 [GREETING] Sending greeting turn with prompt:", greetingPrompt);
    this._isGreetingTurn = true; // 🎯 Phase 35: Mark as greeting to prevent barge-in
    const tid = this.startTurn("initial-handshake-greeting");
    if (tid !== null) {
      console.log(`🔥 [GREETING] Turn ${tid} started, sending first payload...`);
      this.sendFirstTurnPayload({ text: greetingPrompt });
    } else {
      console.error("[GREETING] FAILED - startTurn returned null!");
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
    const contextParts: any[] = [];

    // 🔍 Round 12: Diagnostic logging for Code 1008 investigation
    console.warn('[DEBUG][ROUND_12] sendFirstTurnPayload ENTER', {
      turnId: this.currentTurnId,
      hasText: !!payload.text,
      hasAudio: !!payload.audioBase64,
      audioSize: payload.audioBase64?.length || 0,
      hasBufferedVision: !!this.lastIdleVisionFrame,
      visionSize: this.lastIdleVisionFrame?.length || 0
    });

    // 🛡️ Phase 46: Priority-Aware Bandwidth Safety
    const framePriority = this.lastIdleVisionMetadata?.priority || 'NORMAL';
    const THROTTLE_MS = framePriority === 'HIGH' ? 500 : 1000;

    const TIME_SINCE_LAST_SEND = now - this._lastSentVisionTimestamp;
    const IS_THROTTLED = TIME_SINCE_LAST_SEND < THROTTLE_MS && !this._isFirstPayloadOfTurn;

    const currentFingerprint = this.lastIdleVisionFrame
      ? this.computeFingerprint(this.lastIdleVisionFrame)
      : null;

    const HAS_VISUAL_CHANGE = currentFingerprint !== this._lastSentFingerprint;
    const FORCE_PULSE = TIME_SINCE_LAST_SEND > 60000;
    const IS_VERY_FRESH = TIME_SINCE_LAST_SEND < 2000;
    const SHOULD_SEND_VISION = this.lastIdleVisionFrame && (HAS_VISUAL_CHANGE || (FORCE_PULSE && !IS_VERY_FRESH));

    // 1. Send Vision (Media Stream Only - Atomic)
    if (SHOULD_SEND_VISION) {
      console.log(`[VISION][TURN_START] Sending frame id=${this._lastVisionFrameId} priority=${framePriority} change=${HAS_VISUAL_CHANGE}`);
      this.sendVisionPayload();
    } else if (this.lastIdleVisionFrame) {
      if (!HAS_VISUAL_CHANGE) {
        console.log(`[MULTIMODAL][SKIP] Vision identical to last sent (${currentFingerprint?.substring(0, 8)}).`);
      } else {
        console.log(`[MULTIMODAL][SKIP] Vision sent too recently (${TIME_SINCE_LAST_SEND}ms < ${THROTTLE_MS}ms).`);
      }
    }

    // 2. Send Main Input (Text or Audio start)
    if (payload.text) {
      console.warn('[DEBUG][ROUND_12] Sending TEXT payload', { textLength: payload.text.length });

      // Build text turn parts
      const parts: any[] = [{ text: payload.text }];

      // ⚛️ Send text-turn via ClientContent (Discrete update)
      this.safeSendClientContent({
        turns: [{ role: 'user', parts }],
        turnComplete: true
      }, `TURN_${this.currentTurnId}_TEXT`);
      console.log(`[MULTIMODAL][FIRST_PAYLOAD] RE-PROTOCOL (ClientContent) sent turnId=${this.currentTurnId} ts=${now}`);
    } else {
      // 🧱 Audio Turn: ONLY send Audio via RealtimeInput. 
      // Metadata is handled by sendVisionPayload (proactive or turn-start)
      if (payload.audioBase64) {
        console.warn('[DEBUG][ROUND_12] Sending AUDIO payload', { audioSize: payload.audioBase64.length });

        // ⚛️ Send audio chunk via RealtimeInput (Media stream)
        this.safeSendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: payload.audioBase64
          }
        }, `TURN_${this.currentTurnId}_AUDIO`);
        console.log(`[MULTIMODAL][FIRST_PAYLOAD] RE-PROTOCOL (Realtime/Audio) sent turnId=${this.currentTurnId} ts=${now}`);
      }
    }

    this._hasSentVisionForThisTurn = true;
    this._isFirstPayloadOfTurn = false;
  }

  sendText(text: string) {
    if (this._transportState !== 'OPEN' || !this.session) return;
    const now = Date.now();

    const tid = this.startTurn("user-text-input");
    if (tid === null) return;

    // ⚛️ Phase 20: Use ClientContent for user text turns
    // 🎯 Fix: Send text WITH turnComplete: true so AI responds immediately
    this.safeSendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true
    }, 'USER_TEXT_CHAT');
    console.log(`[TEXT_INPUT] Sent text="${text}" with turnComplete=true`);
  }

  // private sendInitialGreeting() { REMOVED }

  async bufferVision(base64Image: string, metadata?: any) {
    const now = Date.now();
    const isRescue = metadata?.isRescue === true;
    const frameId = metadata?.frameId || 0;
    // 🔍 Debug: Log raw metadata keys to see why 'reason' might be missing
    if (metadata) {
      // console.log(`[DEBUG] bufferVision metadata keys: ${Object.keys(metadata).join(', ')}`);
    }
    const captureReason = metadata?.reason || 'unknown';

    // 🧱 Rule: Vision is ONLY a buffer update. NEVER a transport event.
    // 🔒 Phase 22: Hard Gate - Never buffer frames if session is not OPEN
    if (this._transportState !== 'OPEN') {
      console.warn(`[VISION][DROPPED] id=${frameId} reason=SESSION_NOT_OPEN ts=${now}`);
      return;
    }

    // 🛡️ Fix (Voice Cuts): Prevent vision updates during AI speech
    // Sending vision (or even buffering it for the pulse loop) signals "Input" to Gemini,
    // which causes the server to interrupt the current audio response ("server-interrupted").
    // We drop these frames. Next pulse or stroke will catch up when AI is IDLE.
    // 🛡️ Optimizing: REMOVED suppression during speech to allow real-time vision processing.
    // We now rely on fingerprinting and throttling to prevent connection noise.
    // if (this._turnState === TurnState.SPEAKING || this._turnState === TurnState.GENERATING) ...

    if (!base64Image || base64Image.length < 100) return;

    const cleanBase64 = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;

    // 🎯 Phase 46: Priority-Based Buffering System
    // Student drawings get HIGH priority to prevent overwrites from STATE_CHANGE
    const isStudentDrawing = captureReason === 'student_drawing';
    const priority = isStudentDrawing ? 'HIGH' : 'NORMAL';

    // 🛡️ Priority Protection: Don't let NORMAL priority frames overwrite HIGH priority frames
    const currentPriority = this.lastIdleVisionMetadata?.priority || 'NORMAL';
    if (priority === 'NORMAL' && currentPriority === 'HIGH') {
      console.log(`[VISION][PRIORITY_BLOCK] id=${frameId} (NORMAL) blocked from overwriting HIGH priority frame ts=${now}`);
      return; // Don't overwrite a drawing with a state-change frame!
    }

    if (!isStudentDrawing) {
      // Only dedupe interval/state-change frames
      const fingerprint = this.computeFingerprint(cleanBase64);

      console.log(`📸 [VISION] Frame id=${frameId} source=${metadata?.source} size=${cleanBase64.length}b priority=${priority} fingerprint=${fingerprint.substring(0, 12)}...`);

      // 🛡️ Fix Stall: Force update if > 60s since last send, even if identical
      // This keeps the "Pulse" mechanism alive but reduces spam
      const TIME_SINCE_LAST_SEND = Date.now() - this._lastSentVisionTimestamp;
      const FORCE_PULSE_BYPASS = TIME_SINCE_LAST_SEND > 60000;

      if (!FORCE_PULSE_BYPASS && this._lastFrameFingerprint === fingerprint) {
        console.log(`[VISION][DEDUPE] id=${frameId} fingerprint=${fingerprint.substring(0, 12)}... SKIPPED (periodic capture) ts=${now}`);
        // Still update buffer to preserve latest state (but only if same priority or lower)
        this.lastIdleVisionFrame = cleanBase64;
        this.lastIdleVisionMetadata = { ...metadata, priority };
        return;
      }

      if (FORCE_PULSE_BYPASS && this._lastFrameFingerprint === fingerprint) {
        console.log(`[VISION][PULSE] id=${frameId} fingerprint=${fingerprint.substring(0, 12)}... FORCED (Pulse Bypass) ts=${now}`);
      }

      this._lastFrameFingerprint = fingerprint;
    } else {
      // Student drawing: ALWAYS buffer without fingerprint check
      console.log(`📸 [VISION][HIGH_PRIORITY] Frame id=${frameId} source=${metadata?.source} size=${cleanBase64.length}b reason=student_drawing → FORCE BUFFER`);
      // Don't set fingerprint for drawings - we'll compute fresh for comparison
      this._lastFrameFingerprint = null;
    }

    this.lastIdleVisionFrame = cleanBase64;
    this.lastIdleVisionMetadata = { ...metadata, priority }; // Store priority in metadata
    this._lastVisionTimestamp = now;
    this._lastVisionFrameId = frameId;

    console.log(`[VISION][BUFFERED] id=${frameId} source=${this._source} priority=${priority} rescue=${isRescue} ts=${now}`);

    // 🔒 Phase 23: Auto-ready on first frame land
    if (!this._sessionReady) {
      this.markHandshakeReady();
    }

    // 🚀 Proactive Vision: Try to send the frame immediately if it's been long enough
    // This makes vision feel "fast" and ensures the AI is always looking.
    this.maybeSendProactiveVision();
  }

  /**
   * 🚀 New: Proactive Vision Delivery
   * Sends buffered vision if it hasn't been sent recently and has changed.
   */
  private maybeSendProactiveVision() {
    if (this._transportState !== 'OPEN' || !this.lastIdleVisionFrame) return;

    const now = Date.now();
    const framePriority = this.lastIdleVisionMetadata?.priority || 'NORMAL';
    const THROTTLE_MS = framePriority === 'HIGH' ? 500 : 1000;
    const timeSinceLastSend = now - this._lastSentVisionTimestamp;

    // Check fingerprint
    const currentFingerprint = this.computeFingerprint(this.lastIdleVisionFrame);
    const hasVisualChange = currentFingerprint !== this._lastSentFingerprint;

    // 🛑 enh31: Relax vision gating — DRAWINGS (HIGH priority) can punch through the GENERATING gate.
    // During SPEAKING the AI has already processed the turn, so sending a new visual
    // context is safe and helpful (the AI can see the board while talking about it).
    // During GENERATING we still block NORMAL priority to avoid fragmenting the turn stream,
    // but we ALLOW HIGH priority (drawings) so the AI "sees" the drawing as part of the current turn's context.
    if (this._turnState === TurnState.GENERATING && framePriority !== 'HIGH') {
      if (hasVisualChange) {
        console.debug(`[VISION][PROACTIVE] GATED frame id=${this._lastVisionFrameId} because turn state is GENERATING and priority is ${framePriority}`);
      }
      return;
    }

    // Don't send if throttled UNLESS it's high priority and changed
    if (timeSinceLastSend < THROTTLE_MS && !this._isFirstPayloadOfTurn) return;

    // Only send if changed or if it's been > 60s (pulse)
    if (hasVisualChange || timeSinceLastSend > 60000) {
      console.log(`[VISION][PROACTIVE] Sending frame id=${this._lastVisionFrameId} priority=${framePriority}`);
      this.sendVisionPayload();
    }
  }

  /**
   * ⚛️ Atomic Vision Sender
   * Separated from sendFirstTurnPayload for use in proactive streaming.
   */
  private sendVisionPayload() {
    if (!this.lastIdleVisionFrame || !this.session) return;

    const now = Date.now();
    const currentFingerprint = this.computeFingerprint(this.lastIdleVisionFrame);

    // 🧱 Rule: RealtimeInput is ONLY for media blobs. NO content parts allowed (prevents 1008).
    const visionInput: any = {
      media: {
        mimeType: "image/jpeg",
        data: this.lastIdleVisionFrame
      }
    };

    const reason = this._isFirstPayloadOfTurn ? `TURN_${this.currentTurnId}_VISION` : 'PROACTIVE_VISION';
    this.safeSendRealtimeInput(visionInput, reason);

    // 2. Send Metadata (Discrete Update - Binding to the frame)
    // 🛡️ Phase 100.1: CRITICAL protocol fix.
    // ClientContent (turns) is ONLY allowed during an active turn start/message.
    // Proactive media chunks MUST be media-only. Sending context proactively causes Code 1008.
    if (this._isFirstPayloadOfTurn && this.lastIdleVisionMetadata && !this._DEBUG_DISABLE_METADATA) {
      const enrichedMeta = {
        ...this.lastIdleVisionMetadata,
        captureWidth: 1024, // Optimized standard
        captureHeight: this._lastCaptureHeight || 576,
      };

      this.safeSendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: `[VIEWPORT] ${enrichedMeta.captureWidth}x${enrichedMeta.captureHeight}` }]
        }]
      }, `${reason}_CONTEXT`);
    }

    // Update markers
    this._lastSentVisionTimestamp = now;
    this._lastSentFingerprint = currentFingerprint;
  }

  /**
   * 🎯 Phase 31: Simple Fingerprint Generator
   * Computes a hash-like fingerprint from base64 string for deduplication.
   */
  private computeFingerprint(base64: string): string {
    // 🧱 Improved Fingerprint: Sample more points to detect small drawing changes
    const len = base64.length;
    // Include length in fingerprint (high signal)
    let fingerprint = `${len}-`;

    // Sample 50 chunks (up from 10) to cover more surface area
    const sampleSize = 50;
    const step = Math.floor(len / sampleSize);

    for (let i = 0; i < sampleSize; i++) {
      // Use a non-linear step to avoid stride artifacts
      const pos = Math.floor((i * step) + (i % 2 === 0 ? 0 : step / 2));
      if (pos + 8 < len) {
        fingerprint += base64.substring(pos, pos + 8);
      }
    }
    return fingerprint;
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
      const turnId = (msg as any)._turnId;
      if (turnId !== this.currentTurnId) {
        // CONTENT PROTECTION: Drop any model output tagged with NULL or an old Turn ID
        if (msg.serverContent?.modelTurn || msg.serverContent?.turnComplete || msg.toolCall) {
          console.debug(`[TURN AUTHORITY] Dropping content message for turn ${turnId} (current: ${this.currentTurnId})`);
          continue;
        }
      }

      // Resumption Handle
      if ((msg as any).sessionResumptionUpdate?.resumable) {
        this.sessionResumptionHandle = (msg as any).sessionResumptionUpdate.newHandle;
      }

      // Interruption
      if (msg.serverContent?.interrupted) {
        // 🛑 enh18 / Trial 21 Fix: Don't rely on raw time delays. Check if we were actively
        // waiting for an ACK, OR if we previously fired an interrupt that never resolved.
        const wasWaitingForAck = this._isWaitingForInterruptAck;
        this._isWaitingForInterruptAck = false; // 🔓 Release immediately

        // 🛑 enh35 / Trial 21 Fix: Deadlock Loop!
        // Massively delayed ACKs (> 40s) from old forced turns (like Turn 10) were 
        // arriving in completely independent new turns (like Turn 11) and falsely triggering "server-initiated interruptions".
        // Instead of time, we track the LAST TURN we barged into. If the server says "interrupted"
        // and we had previously killed a past turn, this is likely an ACK for the past.
        const isFromPastBargeIn = this._lastInterruptTurnId !== null && this._lastInterruptTurnId < (this.currentTurnId || this.turnCounter);

        if (wasWaitingForAck || isFromPastBargeIn) {
          console.log(`[TURN AUTHORITY] Ignoring 'interrupted' signal because it's an ACK for a previous barge-in. (wasWaitingForAck=${wasWaitingForAck}, _lastInterruptTurnId=${this._lastInterruptTurnId})`);
          // Clear it since we've now consumed this ghost ACK
          if (!this._isWaitingForInterruptAck) this._lastInterruptTurnId = null;
        } else {
          console.warn(`[TURN AUTHORITY] Server initiated interruption. Stopping audio and requesting turn end. currentTurnId=${this.currentTurnId}`);
          this.stopAudioPlayback('server-interrupted'); // 🔇 Stop audio NOW
          this.requestTurnEnd("server-interrupted");

          // Clear any lingering audio parts — do NOT flush them (stop means stop)
          this.audioParts = [];
          // Clear queue to stop processing stale messages
          this.messageQueue = [];
          if (this.playbackCtx) {
            this.nextPlaybackTime = this.playbackCtx.currentTime;
          }
        }
        continue;
      }

      // Tool Calls
      if (msg.toolCall) {
        console.log(`🛠️ [QUEUE] Received toolCall with ${msg.toolCall.functionCalls?.length || 0} calls`);
        this.hasReceivedToolCallForCurrentTurn = true;
        this.handleTools(msg);
      }

      // Audio Data
      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        // 📥 [LOGGING] Explicit Receive Log
        const sizeKB = (audioData.length * 0.75 / 1024).toFixed(1);

        // 🛑 enh18: Zombie Audio Guard — block audio when no active turn.
        // Server sometimes sends stale audio after turn ends. Playing it as 'Turn null'
        // overloads the API and causes Code 1011 crashes.
        if (this.currentTurnId === null) {
          console.warn(`[ZOMBIE] Dropping audio (${sizeKB} KB) for turn ${turnId} — no active turn. Discarding.`);
          this.audioParts = [];
          continue;
        }

        console.log(`📥 [RECV] Audio Chunk (${sizeKB} KB) for Turn ${turnId}`);
        this.audioParts.push(audioData);
        this.hasReceivedAnyAIOutput = true;
        this.hasReceivedAudioForCurrentTurn = true;
      }

      // Streaming Flush Logic (Edusync Compliance)
      // 🎯 Fix: Flush if queue is empty (end of packet burst) to prevent silence on short responses
      const shouldFlush = this.audioParts.length >= 5 || !!msg.serverContent?.turnComplete || this.messageQueue.length === 0;

      if (shouldFlush && this.audioParts.length > 0) {
        console.log(`🔊 [PLAY] Flushing ${this.audioParts.length} audio chunks to speaker...`);
        const audioToPlay = [...this.audioParts];
        this.audioParts = [];
        this.playGeminiAudioChunks(audioToPlay, turnId);
      }

      if (msg.serverContent?.turnComplete) {
        if (this._isWaitingForInterruptAck) {
          console.log(`[TURN AUTHORITY] turnComplete received while waiting for interrupt. Releasing lock.`);
          this._isWaitingForInterruptAck = false;
          // 🛑 Code 1008 Fix: If server naturally finishes right before our interrupt arrives, 
          // our interrupt (turnComplete: false) will be misconstrued as starting a NEW text turn.
          // We MUST close this ghost turn with turnComplete: true before sending new audio!
          this.safeSendClientContent({ turnComplete: true }, "clear-hanging-interrupt");
        }

        // 🛑 PTT Delayed Complete Race Condition Fix:
        // A turnComplete from the aborted turn often follows the delayed interrupted packet.
        // If we are actively LISTENING OR recently sent an interrupt, drop this stale packet so it doesn't kill the new turn.
        const timeSinceInterrupt = Date.now() - this._interruptSentTimestamp;
        if (this._turnState === TurnState.LISTENING || (timeSinceInterrupt < 1500 && !this.hasReceivedAnyAIOutput)) {
          console.warn(`[TURN AUTHORITY] Ignoring stale turnComplete for Turn ${turnId} (_turnState=${this._turnState}, delay=${timeSinceInterrupt}ms).`);
          continue; // Safely drop it
        }

        // 🛑 enh22b: Mark that the server has confirmed it's done generating for this turn
        this._serverTurnCompleteReceived = true;
        // 🔒 Phase 12.7: Deadlock guard for text-only responses
        if (!this.hasReceivedAudioForCurrentTurn && this.audioParts.length === 0 && !this.hasReceivedToolCallForCurrentTurn) {
          console.warn(`[TURN AUTHORITY] Turn ${turnId} completed with NO audio/tools. Forcing finish.`);
          // 🛑 PTT Fix: If this was a PTT turn that got no response, the server VAD may have
          // closed the turn before enough audio context accumulated. Send one more burst of
          // silence (200ms) to retrigger VAD on the same turn. If that also produces no audio,
          // the watchdog cooldown will clean up. Do NOT end the turn here — let it remain
          // open so the delayed AI audio can still arrive.
          if (this._pttMode && turnId !== null && this.currentTurnId === turnId && !this._pttNudgeSent) {
            this._pttNudgeSent = true;
            console.log(`[PTT][NUDGE] No-audio response for PTT turn ${turnId} — sending 200ms silence re-trigger.`);
            // Reset flags so this turn can still receive audio
            this._serverTurnCompleteReceived = false;
            this.hasReceivedAudioForCurrentTurn = false;

            // Send 200ms of fresh silence to retrigger server VAD
            const NUDGE_SAMPLES = 3200; // 16kHz × 0.2s
            const nudgePcm = new Int16Array(NUDGE_SAMPLES); // already zeroed
            const nudgeU8 = new Uint8Array(nudgePcm.buffer);
            let bin = '';
            for (let i = 0; i < nudgeU8.byteLength; i++) bin += String.fromCharCode(nudgeU8[i]);
            const nudgeB64 = btoa(bin);
            this.safeSendRealtimeInput(
              { media: { mimeType: 'audio/pcm;rate=16000', data: nudgeB64 } },
              'PTT_NUDGE'
            );
          } else {
            this._pttNudgeSent = false; // reset for next turn
            this.endTurnOnce("turn-complete-no-audio");
          }
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

      // 🎯 Fix: Capture generation ID before async decode
      const currentGenId = this._playbackGenerationId;
      const audioBuffer = await this.playbackCtx.decodeAudioData(wavBuffer);

      // 🎯 Fix: Check if generation changed during decode (interruption occurred)
      if (currentGenId !== this._playbackGenerationId) {
        console.debug(`[AUDIO] Dropped chunk from stale generation ${currentGenId} (current: ${this._playbackGenerationId})`);
        return;
      }

      const source = this.playbackCtx.createBufferSource();
      source.buffer = audioBuffer;
      this.currentAudioSource = source;
      // 🛑 enh10 Fix: Track source so we can stop ALL of them instantly on barge-in
      this._activeAudioSources.push(source);

      source.onended = () => {
        // Remove from active list
        this._activeAudioSources = this._activeAudioSources.filter(s => s !== source);
        if (this.currentAudioSource === source) this.currentAudioSource = null;

        // 🛡️ Fix Loop: Abort if session is dead (prevents resurrection)
        if (!this.connected || this._transportState !== 'OPEN') {
          console.log("[AUDIO] onended ignored (Session Closed)");
          return;
        }

        // In streaming, we only set LISTENING if this was the last scheduled chunk
        // 🔒 Phase 1: Only Audio moves state
        if (this._turnState === TurnState.GENERATING && (turnId === null || this.currentTurnId === turnId)) {
          this.setTurnState(TurnState.SPEAKING);
        }

        // In streaming, we only set LISTENING if this was the last scheduled chunk
        // 🎯 Fix: Debounce/Throttle the "Natural End" to prevent state thrashing
        // If multiple small chunks end rapidly, we don't want to spam endTurnOnce.
        const REMAINING_TIME = this.nextPlaybackTime - (this.playbackCtx?.currentTime || 0);

        if (this.playbackCtx && REMAINING_TIME < 0.15) {
          // Only trigger if we are dangerously close to silence.
          setTimeout(() => {
            // Re-check after delay to see if new audio arrived
            const freshRemaining = this.nextPlaybackTime - (this.playbackCtx?.currentTime || 0);
            if ((this.currentTurnId === null || this.currentTurnId === turnId) && freshRemaining < 0.1) {
              // 🛑 enh22b: Only finish if server has confirmed turn is complete.
              // Without this check, the first audio chunk's onended fires, sees no more
              // audio scheduled (because the server hasn't sent the next burst yet),
              // and prematurely kills the turn. This caused 100+ zombie audio chunks.
              if (this._serverTurnCompleteReceived || this.currentTurnId === null) {
                console.debug("LiveSessionService: Audio Stream Finished (Natural end) - Confirmed");
                if (this.currentTurnId === null) {
                  // Ghost audio cleanup
                  this.setTurnState(TurnState.LISTENING);
                } else {
                  this.endTurnOnce("natural-audio-end");
                }
              }
            }
          }, 300); // 🛑 enh22b: Increased from 50ms to 300ms for server burst timing
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
      if (!this.isAISpeaking && (turnId === null || this.currentTurnId === turnId)) {
        this.isAISpeaking = true;
        this._speakingStartTime = Date.now(); // 🎯 Phase 34: Capture ACTUAL speaking start
        this.setTurnState(TurnState.SPEAKING);

        // 🛑 enh14: Monologue Limiter — AI may never speak for more than 45 seconds uninterrupted.
        // The system prompt already asks for short responses but the model ignores it.
        // This is a hard client-side enforcement: after 45s of continuous AI audio we
        // send a server interrupt and return control to the user. The user can always
        // barge-in earlier; this is a backstop against infinite AI monologues.
        const MAX_AI_SPEAKING_MS = 45_000;
        const monologueTurnId = this.currentTurnId;
        this._monologueTimer = setTimeout(() => {
          if (this.currentTurnId === monologueTurnId && this._turnState === TurnState.SPEAKING) {
            console.warn(`⏱️ [MONOLOGUE LIMIT] AI has been speaking for ${MAX_AI_SPEAKING_MS / 1000}s. Force-ending turn ${monologueTurnId}.`);
            this.requestTurnEnd('ai-monologue-limit');
          }
          this._monologueTimer = null;
        }, MAX_AI_SPEAKING_MS);
      }

      this.nextPlaybackTime = startAt + audioBuffer.duration;

      // Handle safety tail
      // 🛑 Fix: Only fire the tail timeout when ALL active audio sources have finished.
      // Previously this fired after each chunk's scheduled end + 500ms, which cut off
      // the AI mid-speech when the server sent audio in bursts (each chunk arms a new
      // timeout, cancelling the previous one, so the last SMALL chunk could trigger this
      // before the longer earlier chunks finished playing). Now we additionally check
      // there are no more active sources before ending the turn.
      if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
      const timeUntilEnd = (startAt + audioBuffer.duration - this.playbackCtx.currentTime) * 1000;
      this.speakingTimeout = setTimeout(() => {
        if (this.playbackCtx && this.nextPlaybackTime <= this.playbackCtx.currentTime + 0.1) {
          // Guard: don't end the turn if audio sources are still actively playing
          const stillPlaying = this._activeAudioSources.length > 0;
          if (!stillPlaying) {
            if (this.currentTurnId === turnId) {
              this.endTurnOnce("safety-tail-timeout");
            }
            this.isAISpeaking = false;
          }
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
    if (!this._sessionReady) return;

    // 🎙️ PTT Walkie-Talkie Mode Override:
    // If we're in Walkie-Talkie mode and holding the button, override UI mute
    const isPttActive = this._pttMode && this._pttButtonHeld;
    if (this.muted && !isPttActive) {
      if (Date.now() % 2000 < 50) console.log(`[AUDIO_DEBUG] processAudioChunk DROPPED - muted=${this.muted} isPttActive=${isPttActive}`);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🎙️ PTT FAST-PATH — Completely isolated from normal VAD/gate/barge-in path.
    // This block is the ONLY change to processAudioChunk. The `return` below
    // guarantees normal mode code never executes simultaneously with PTT.
    // ─────────────────────────────────────────────────────────────────────────
    if (this._pttMode) {
      // Button not held → absolute silence to server (send nothing at all)
      if (!this._pttButtonHeld) {
        if (Date.now() % 2000 < 50) console.log(`[PTT_DEBUG] processAudioChunk DROPPED - pttMode=true but button not held`);
        return;
      }

      // --- 1. Resample to 16kHz (identical logic to normal path) ---
      const pttInputRate = this.inputCtx?.sampleRate || 16000;
      let pttData = float32Data;
      if (pttInputRate !== 16000) {
        const ratio = pttInputRate / 16000;
        const newLen = Math.floor(float32Data.length / ratio);
        pttData = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) pttData[i] = float32Data[Math.round(i * ratio)];
      }

      // --- 2. Convert to Int16 PCM — RAW, no zero-fill, no noise gate ---
      const pttPcm = new Int16Array(pttData.length);
      for (let i = 0; i < pttData.length; i++) {
        const s = Math.max(-1, Math.min(1, pttData[i]));
        pttPcm[i] = s < 0 ? s * 32768 : s * 32767;
      }

      // --- 3. Start turn once the interrupt-ack window clears ---
      // If we just interrupted the AI, _isWaitingForInterruptAck is true for ~50-200ms.
      // We buffer audio during that window and startTurn when the server acks.
      if (this.currentTurnId === null && !this._isWaitingForInterruptAck) {
        const tid = this.startTurn('ptt-voice');
        if (tid === null) return; // Session cooldown or other deny; drop chunk
      }

      // If still waiting for ack, accumulate in buffer (will flush once turn starts)
      if (this.currentTurnId === null) {
        this._pttBatchBuffer.push(pttPcm);
        return;
      }

      // --- 4. First chunk: inject vision context via existing infrastructure ---
      if (this._isFirstPayloadOfTurn) {
        const u8 = new Uint8Array(pttPcm.buffer);
        let bin = '';
        for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i]);
        this.sendFirstTurnPayload({ audioBase64: btoa(bin) });

        // Flush any audio that accumulated during the ack wait
        if (this._pttBatchBuffer.length > 0) {
          const saved = this._pttBatchBuffer;
          this._pttBatchBuffer = [];
          // Re-queue for immediate flush (already have turn, just missed first-chunk flag)
          for (const c of saved) this._pttBatchBuffer.push(c);
          this._flushPttBatch();
        }
        return; // first chunk handled
      }

      // --- 5. Subsequent chunks: accumulate + fast-flush ---
      this._pttBatchBuffer.push(pttPcm);

      // Arm the flush timer if not already running
      if (this._pttBatchTimer === null) {
        this._pttBatchTimer = window.setTimeout(
          () => this._flushPttBatch(),
          this.PTT_FLUSH_INTERVAL_MS // 80ms
        );
      }

      // Force-flush if buffer is getting large (3 chunks ≈ 30ms of speech)
      if (this._pttBatchBuffer.length >= 3) {
        this._flushPttBatch();
      }

      return; // ← PTT path complete. Normal mode code below is NOT reached.
    }
    // ─────────────────────────────────────────────────────────────────────────

    // NORMAL MODE DEBUGGING: Every ~2000ms print the high-level VAD state
    if (Date.now() % 2000 < 50 && this.currentTurnId === null) {
      console.log(`[VAD_DEBUG] No Turn Active. Threshold: ${this._currentAdaptiveThreshold?.toFixed(3)}, RollingMin: ${this._rollingMinVolume?.toFixed(3)}, PTT_Mode: ${this._pttMode}`);
    }

    // 0. Resampling (Phase 55: Fix Code 1008)
    // The Gemini API requires 16000Hz. Browsers/Hardware often run at 44.1k or 48k.
    // Without resampling, we flood the server with 3x data, causing Code 1008.
    const inputSampleRate = this.inputCtx?.sampleRate || 16000;
    const targetSampleRate = 16000;
    let processedData = float32Data;

    if (inputSampleRate !== targetSampleRate) {
      const ratio = inputSampleRate / targetSampleRate;
      const newLength = Math.floor(float32Data.length / ratio);
      const resampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        resampled[i] = float32Data[Math.round(i * ratio)];
      }
      processedData = resampled;
    }

    // 1. Convert to PCM & Calculate Max Volume
    const pcmData = new Int16Array(processedData.length);
    let maxVolume = 0;
    for (let i = 0; i < processedData.length; i++) {
      const s = Math.max(-1, Math.min(1, processedData[i]));
      pcmData[i] = s < 0 ? s * 32768 : s * 32767;
      const absS = Math.abs(s);
      if (absS > maxVolume) maxVolume = absS;
    }

    // --- ADAPTIVE NOISE FLOOR (Phase 100 & enh34) ---
    const now = Date.now();
    // 🛑 enh34: Update noise floor more frequently (every 500ms) for better responsiveness
    if (now - this._lastNoiseFloorUpdate > 500) {
      // Faster drift towards current volume if current is lower (noise floor detection)
      if (maxVolume < this._rollingMinVolume) {
        this._rollingMinVolume = this._rollingMinVolume * 0.5 + maxVolume * 0.5; // Fast drop
      } else {
        // Slow rise to avoid getting stuck if room becomes slightly louder
        this._rollingMinVolume = this._rollingMinVolume * 0.99 + maxVolume * 0.01; // Moderate rise
      }
      this._lastNoiseFloorUpdate = now;
    }
    // Compute threshold (adaptive or fixed)
    const ADAPTIVE_THRESHOLD = this._useAdaptiveNoise
      // 🛑 enh41: Raised hard floor to 0.08 per user request. 
      // Multiplier remains 2.0, so initial threshold is 0.08, but adapts up if room is louder.
      ? Math.max(0.08, this._rollingMinVolume * 2.0)
      : this._fixedNoiseThreshold;                   // Fixed user-controlled mode
    // Track for UI display
    this._currentAdaptiveThreshold = ADAPTIVE_THRESHOLD;

    // 🛑 enh16: DO NOT suppress audio during GENERATING state.
    // Gemini Live API is a full-duplex WebSocket — it runs its own server-side VAD
    // and expects continuous mic audio at all times. Silencing here causes the server
    // to lose context about when the user started speaking, creating latency.
    // Silence below threshold is still zero-filled by the VAD trigger logic below.

    // --- VOICE ACTIVITY TRIGGER (Phase 5: Sync Vision) ---
    // 🛡️ enh20: We only start a turn if it beats the ACTUAL threshold (ADAPTIVE_THRESHOLD).
    // The previous logic allowed starting early (on MIN_TRIGGER_VOLUME), which sent
    // background noise as the start of the turn, causing the AI to abort prematurely
    // assuming it was just silence (turn-complete-no-audio).
    // enh40: Added a streak requirement to prevent single 10ms clicks/echoes from starting turns.
    if (!this.isAISpeaking && this.currentTurnId === null && !this.isInterrupted) {
      if (maxVolume > ADAPTIVE_THRESHOLD) {
        this._voiceActivationStreak = (this._voiceActivationStreak || 0) + 1;
        if (this._voiceActivationStreak >= 2) {
          // 🛑 Stream Corruption Fix: Do NOT start a new VAD turn if waiting for interrupt ACK.
          // This corrupts the WebSocket stream by interleaving new turn audio while server is tearing down.
          if (!this._isWaitingForInterruptAck) {
            this.startTurn("user-voice-activity");
            this._voiceActivationStreak = 0;
          }
        }
      } else {
        this._voiceActivationStreak = 0; // Reset on silence
      }
    }

    // 🔒 Phase 12.2: Silence mic chunks during greeting entirely
    // REMOVED: No more suppression.









    // --- HARD INTERRUPT (Adaptive Confidence Model) ---
    // 🛑 enh23: Determine if we should consider barge-in or zero-filling ECHO
    // Enforce a hard minimum (0.150) so speaker bleed doesn't trigger barge-in when adaptive threshold collapses to 0.010.
    const BARGE_IN_VOLUME_FLOOR = Math.max(0.150, ADAPTIVE_THRESHOLD * 1.5);
    let isBargingIn = false;

    if (this.isAISpeaking && !this._isGreetingTurn) {
      if (now % 500 < 20) {
        console.debug(`🔊 [LISTENING] Vol=${maxVolume.toFixed(3)} Threshold=${ADAPTIVE_THRESHOLD.toFixed(3)} Confidence=${this._interruptionConfidence}`);
      }

      // 🛑 enh23: 500ms Grace Period for Echo Cancellation
      const aiSpeechDuration = now - this._lastTurnStartTime;
      const enableBargeIn = aiSpeechDuration > 500;

      if (enableBargeIn && maxVolume > BARGE_IN_VOLUME_FLOOR) {
        const intensity = maxVolume / BARGE_IN_VOLUME_FLOOR;
        this._interruptionConfidence += intensity > 2 ? 2 : 1;

        if (this._interruptionConfidence >= this.CONFIDENCE_THRESHOLD) {
          console.warn(`🛑 [INTERRUPT] TRIGGERED! Vol=${maxVolume.toFixed(2)} >> Threshold=${BARGE_IN_VOLUME_FLOOR.toFixed(2)} (Conf: ${this._interruptionConfidence})`);
          this.requestTurnEnd("client-side-barge-in");
          this._interruptionConfidence = 0;
          isBargingIn = true;
        }
      } else {
        if (this._interruptionConfidence > 0) {
          this._interruptionConfidence = Math.max(0, this._interruptionConfidence - 0.5);
        }
      }
    }

    // --- TRUE AUDIO NOISE-GATE (enh24) ---
    // Zero-fill background noise/echo when the gate closes.
    // 🛑 enh24: We must NOT send continuous background noise to Gemini, or its server-side VAD
    // will hang and cause `watchdog-timeout` (Ignored AI Turns).
    // To prevent mutilating mid-sentence pauses, the hold timer is increased to 2000ms 
    // while the user is actively speaking (currentTurnId is active and AI is NOT speaking).

    // Hold 2000ms for user speech pauses, otherwise 1000ms.
    const GATE_HOLD_MS = (this.currentTurnId !== null && !this.isAISpeaking) ? 2000 : 1000;

    // 🛑 enh23: If AI is speaking, only open gate if volume beats the barge-in floor. 
    // Otherwise, normal threshold applies.
    const gateTriggerVolume = this.isAISpeaking ? BARGE_IN_VOLUME_FLOOR : ADAPTIVE_THRESHOLD;

    if (maxVolume > gateTriggerVolume) {
      this._noiseGateOpenUntil = now + GATE_HOLD_MS;
    }

    const isGateOpen = now <= this._noiseGateOpenUntil;

    // 🛑 enh33b: Restored client-side zero-filling.
    // When the user stops speaking, we MUST send explicit zeros (perfect silence) to Gemini.
    // Sending continuous background noise to Gemini prevents its VAD from ever concluding
    // the turn, causing it to hang indefinitely waiting for the user to finish.
    const willZero = !isGateOpen;

    if (willZero) {
      pcmData.fill(0); // Perfect silence tells Gemini the user is done.
    }

    // 🛑 Phase 101: Do not send audio while AI is speaking unless user is barging in.
    // Sending continuous zeroes crashes the server (Code 1011) and wastes bandwidth.
    if (this.isAISpeaking && willZero) {
      this._audioBatchBuffer = [];
      return;
    }

    // 🔍 enh22: Per-chunk diagnostic (sampled every 500ms to avoid log flood)
    if (this.currentTurnId !== null && now % 500 < 20) {
      const durationMs = now - this._lastTurnStartTime;
      console.debug(`🎙️ [AUDIO] Vol=${maxVolume.toFixed(3)} Thr=${ADAPTIVE_THRESHOLD.toFixed(3)} Gate=${isGateOpen ? 'OPEN' : 'CLOSED'} Zeroed=${willZero} Turn=${this.currentTurnId} Duration=${durationMs}ms`);
    }

    // 2. Base64 Encode
    // ⚛️ Phase 20: Atomic Multimodal Injection for first chunk
    // 🎯 Phase 39: Immediate send for first chunk (Latency opt), Batch the rest
    if (this._isFirstPayloadOfTurn) {
      const uint8 = new Uint8Array(pcmData.buffer);
      let binary = '';
      const len = uint8.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64Audio = btoa(binary);
      this.sendFirstTurnPayload({ audioBase64: base64Audio });
      return; // STOP: First chunk handled
    }

    // 🎯 Phase 39: Audio Batching to prevent WebSocket flood
    this._audioBatchBuffer.push(pcmData);

    // 🛡️ enh8 Fix: Max turn duration cap. If a single user turn exceeds 30s,
    // end it proactively. Runaway turns (45s+ seen in enh8 log) cause Code 1011.
    const MAX_TURN_DURATION_MS = 30000;
    if (this.currentTurnId !== null && this._lastTurnStartTime > 0) {
      if (Date.now() - this._lastTurnStartTime > MAX_TURN_DURATION_MS) {
        console.warn(`[TURN AUTHORITY] Max turn duration (${MAX_TURN_DURATION_MS}ms) reached for Turn ${this.currentTurnId}. Auto-ending.`);
        this.requestTurnEnd("max-duration-reached");
        return;
      }
    }

    // 🛑 enh33b: Forced Fast Audio Batching During Active Turns
    // We must send audio chunks VERY quickly (every 200ms) when there is an active turn.
    // If the gate closes and we switch to slow batching (800ms), we artificially delay 
    // sending the zero-filled silence to Gemini, causing a perceived ~1s hang.
    const hasActiveTurn = this.currentTurnId !== null;
    const currentBatchTimerMs = hasActiveTurn ? 200 : 800; // Always fast if AI is listening
    const currentBatchSizeLimit = hasActiveTurn ? 5 : 20;

    // Start timer if not running
    if (!this._audioBatchTimer) {
      this._audioBatchTimer = window.setTimeout(() => {
        this.flushAudioBatch(ADAPTIVE_THRESHOLD);
      }, currentBatchTimerMs);
    }

    if (this._audioBatchBuffer.length >= currentBatchSizeLimit) {
      this.flushAudioBatch(ADAPTIVE_THRESHOLD);
    }
  }

  /* =========================
     Utils
  ========================= */

  /* ---------- STALE METHODS REMOVED ---------- */

  // 🎯 Phase 39: Circuit Breaker Logic
  private checkCircuitBreaker(): boolean {
    if (this._circuitBreakerOpen) {
      const now = Date.now();
      if (this._circuitBreakerOpenUntil && now < this._circuitBreakerOpenUntil) {
        // Circuit breaker still open
        return false;
      } else {
        // Cooldown passed, try to close
        console.log('🔄 [CIRCUIT_BREAKER] Cooldown passed. Closing circuit.');
        this._circuitBreakerOpen = false;
        this._circuitBreakerOpenUntil = null;
      }
    }
    return true;
  }

  private openCircuitBreaker(durationMs: number = 2000) {
    console.error(`🚨 [CIRCUIT_BREAKER] OPENED for ${durationMs}ms`);
    this._circuitBreakerOpen = true;
    this._circuitBreakerOpenUntil = Date.now() + durationMs;
  }

  /**
   * 🛡️ [RECOVERY] Hard Purge State (Phase 100)
   * Wipes all transient state (buffers, IDs, timers) to ensure a truly fresh start.
   * BEWARE: Does NOT wipe sessionResumptionHandle by default to preserve context.
   */
  private hardPurgeState(preserveResumption = true) {
    if (this.currentConfig) {
      console.warn(`🚨 [RECOVERY] Hard Purging State (Preserve Context: ${preserveResumption})`);
    }

    // Stop all timers
    if (this._audioBatchTimer) {
      clearTimeout(this._audioBatchTimer);
      this._audioBatchTimer = null;
    }
    // 🎙️ PTT cleanup — cancel any in-flight flush timer and clear buffer
    if (this._pttBatchTimer !== null) {
      clearTimeout(this._pttBatchTimer);
      this._pttBatchTimer = null;
    }
    this._pttBatchBuffer = [];
    this._pttButtonHeld = false;

    // Clear all audio buffers
    this._audioBatchBuffer = [];
    this.audioParts = [];

    // Reset Turn Authority
    this.currentTurnId = null;
    this.isAISpeaking = false;
    this.isInterrupted = false;
    this.isProcessingQueue = false;
    this.messageQueue = [];

    // Reset smarts
    this._interruptionConfidence = 0;
    this._consecutive_loud_frames = 0;

    if (!preserveResumption) {
      this.sessionResumptionHandle = null;
    }

    // 🎯 Phase 12: Reset State
    this.setTurnState(TurnState.LISTENING);
  }

  async requestTurnEnd(reason: string = "unknown") {
    // 🛡️ Phase 12: Loop Prevention for Code 1011
    // If the server says "interrupted", it means THE TURN IS OVER.
    // If we send ANOTHER interrupt signal, the server will reply "interrupted" AGAIN.
    // This creates an infinite loop: Server(Int) -> Client(Stop) -> Server(Int) -> Client(Stop)...
    if (!this.currentTurnId && reason === 'server-interrupted') {
      console.warn(`[TURN AUTHORITY] Ignoring redundant interrupt check (No active turn).`);
      return;
    }
    const targetTurnId = this.currentTurnId;
    console.log(`[TURN AUTHORITY] requestTurnEnd reason=${reason} turnId=${targetTurnId}`);

    // 1. Stop Local Audio
    this.stopAudioPlayback(reason);

    // 🛡️ Phase 102: Clear incoming message queue on interrupt
    // This prevents "Zombie" chunks from re-triggering SPEAKING state after we asked to stop.
    this.messageQueue = [];
    this.isProcessingQueue = false;

    // 2. Logic to notify server
    if (this._sessionReady && this.session) {
      // Only send interrupt if we actually have a turn to interrupt AND we didn't get interrupted by the server.
      // If we send an interrupt because the server interrupted us, we enter an infinite feedback loop.
      if (targetTurnId && reason !== "server-interrupted") {
        // Fix for Code 1007: Empty clientContent with turns: [] acts as a safe barge-in signal for Gemini.
        // DO NOT send turnComplete: true by itself during server generation or it crashes.
        // The @google/genai SDK defaults turnComplete to `true` if omitted. We must explicitly set it to false.
        this.safeSendClientContent({ turnComplete: false }, "barge-in-interrupt"); // Flush/Interrupt
        this.stopAudioPlayback('client-side-barge-in'); // Instantly stop local audio
        console.log(`[TURN AUTHORITY] Sent clientContent interrupt signal to server and stopped local playback.`);

        // BUG FIX 2: Watchdog Recovery -> If watchdog fired, clear server audio to stop Zombies
        if (reason === "watchdog-timeout") {
          console.log(`[TURN AUTHORITY] Watchdog recovery triggered. Purging audio buffers and resetting noise floor.`);
          // Flush server queue and reset thresholds so user can speak
          this.messageQueue = [];
          this.audioParts = [];
          this._rollingMinVolume = 0.04;
        }

        // 🛡️ [SAFETY] Enter Buffered Mode to prevent Code 1008
        // We must wait for the server to Ack this interrupt before sending new audio.
        this._isWaitingForInterruptAck = true;
        this._interruptSentTimestamp = Date.now();
        this._bufferedAudioTokens = [];

        setTimeout(() => {
          if (this._isWaitingForInterruptAck) {
            console.warn(`[PTT_WATCHDOG] ${this.INTERRUPT_ACK_TIMEOUT_MS}ms passed without server interrupt ACK. Forcing lock release!`);
            this._isWaitingForInterruptAck = false;
          }
        }, this.INTERRUPT_ACK_TIMEOUT_MS);
      }
    }

    // 3. Reset State
    this.currentTurnId = null;
    this.hasReceivedAudioForCurrentTurn = false;
    this.setTurnState(TurnState.LISTENING);
  }

  // 🎯 Phase 39: Audio Batching Logic
  private flushAudioBatch(currentThreshold?: number) {
    if (this._audioBatchTimer) {
      clearTimeout(this._audioBatchTimer);
      this._audioBatchTimer = null;
    }

    const chunkCount = this._audioBatchBuffer.length;
    if (chunkCount === 0) return;

    // 🛡️ [PROTOCOL GUARD] Send Gating (Phase 100)
    // Never send audio if we aren't in an active turn. This is the #1 cause of 1011 errors.
    const canSend = this.isConnected && this._transportState === 'OPEN' && this.currentTurnId !== null;

    if (!canSend) {
      if (this.currentTurnId === null) {
        console.warn(`[GUARD][DROP] ${chunkCount} chunks. No turn. Threshold=${currentThreshold?.toFixed(3)}`);
      }
      this._audioBatchBuffer = [];
      return;
    }

    // 🛑 enh16: Removed full mic silence gate during AI speech.
    // Gemini Live is a bidirectional WebSocket — the server's own VAD handles echo
    // cancellation and detects real speech vs. echo. Silencing mic here is what causes
    // the 'full turn then wait' pattern. We now stream continuously in BOTH directions.
    // The barge-in confidence model above handles false triggers from quiet room noise.












    // ✅ Log SEND status with gate diagnostics (enh22)
    const gateOpen = Date.now() <= this._noiseGateOpenUntil;
    console.debug(`[GUARD][SEND] ${chunkCount} chunks. Turn=${this.currentTurnId} Threshold=${currentThreshold?.toFixed(3)} GateOpen=${gateOpen}`);

    // 1. Calculate total length
    const totalLength = this._audioBatchBuffer.reduce((sum, chunk: Int16Array) => sum + chunk.length, 0);
    const combined = new Int16Array(totalLength);

    // 2. Merge chunks
    let offset = 0;
    for (const chunk of this._audioBatchBuffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // 3. Clear buffer early
    this._audioBatchBuffer = [];

    // 4. Encode to Base64 (Manual approach since Buffer unavailable)
    const uint8 = new Uint8Array(combined.buffer);
    const len = uint8.byteLength;

    // 🎯 Phase 44: Audio Batch Splitting (Max 15KB per WebSocket message)
    // Large audio chunks (seen up to 42KB) can clog the pipe and cause 1011 errors.
    const MAX_CHUNK_BYTES = 15360; // 15KB

    for (let offsetArr = 0; offsetArr < len; offsetArr += MAX_CHUNK_BYTES) {
      const end = Math.min(offsetArr + MAX_CHUNK_BYTES, len);
      const sub = uint8.subarray(offsetArr, end);

      let binary = '';
      const subLen = sub.byteLength;
      // Internal chunking for String.fromCharCode to avoid stack overflow
      const sub_internal_chunk = 0x8000;
      for (let j = 0; j < subLen; j += sub_internal_chunk) {
        binary += String.fromCharCode.apply(null, Array.from(sub.subarray(j, j + sub_internal_chunk)));
      }
      const base64Audio = btoa(binary);

      // 5. Send combined payload with Structural Reason
      this.safeSendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio,
        },
      }, 'AUDIO_STREAM');
    }
  }

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
    for (const fc of msg.toolCall.functionCalls) {
      try {
        console.log(`🛠️ [TOOLS] Received Function Call: ${fc.name}`, fc.args);

        // Validate Tool Existence - Prevent Code 1008 from unknown tools
        const validTools = ['drawOnScreen', 'updateNotebook'];
        if (!validTools.includes(fc.name)) {
          console.warn(`⚠️ [TOOLS] Unknown tool called: ${fc.name} - Ignoring.`);
          continue; // Don't send 'ok' for unknown tools
        }

        if (fc.name === 'drawOnScreen') {
          const args = fc.args as any;

          // ✅ Phase Draw-Fix: Convert AI screenshot-pixel coords → world coords
          // The AI sees a scaled JPEG (captureWidth=1100) and outputs pixel coords.
          // TeacherOverlay renders in world coords tracked by the BoardEngine.
          // We need to reverse-map: world = (pixelCoord / captureSize) * worldSize + worldOffset
          const CAPTURE_W = this.lastIdleVisionMetadata?.captureWidth || 1100;
          const CAPTURE_H = this.lastIdleVisionMetadata?.captureHeight || this._lastCaptureHeight || 720;
          const viewport = this.lastIdleVisionMetadata?.viewport;

          let worldX: number;
          let worldY: number;
          let worldW: number;
          let worldH: number;

          if (viewport && viewport.width > 0 && viewport.height > 0) {
            const scaleX = viewport.width / CAPTURE_W;
            const scaleY = viewport.height / CAPTURE_H;
            worldX = (args.x * scaleX) + (viewport.offsetX || 0);
            worldY = (args.y * scaleY) + (viewport.offsetY || 0);
            worldW = ((args.width || 50) * scaleX);
            worldH = ((args.height || args.width || 50) * scaleY);
          } else {
            // Fallback: use pixel coords directly (1:1 mapping for board mode default)
            worldX = args.x;
            worldY = args.y;
            worldW = args.width || 50;
            worldH = args.height || args.width || 50;
          }

          const logX = worldX !== undefined && !isNaN(worldX) ? worldX.toFixed(0) : 'N/A';
          const logY = worldY !== undefined && !isNaN(worldY) ? worldY.toFixed(0) : 'N/A';
          console.log(`🎨 [DRAW] Mapped AI coords (${args.x},${args.y}) → world (${logX},${logY}) type=${args.actionType}`);

          // ✅ Map "freehand" points if present
          let scaledPoints: { x: number, y: number }[] | undefined = undefined;
          console.log(`🎨 [DRAW][TOOL_CALL] AI invoked 'drawOnScreen'`);
          console.log(`🎨 [DRAW][TOOL_CALL] Raw Args:`, JSON.stringify(args, null, 2));
          console.log(`🎨 [DRAW][MAPPING] Viewport State: offsetX=${viewport?.offsetX} offsetY=${viewport?.offsetY} scale=${viewport?.scale} captureW=${CAPTURE_W} captureH=${CAPTURE_H}`);

          if (args.points && Array.isArray(args.points)) {
            console.log(`🎨 [DRAW][POINTS_RAW] AI provided ${args.points.length} points.`);
            const scaleX = (viewport && viewport.width > 0) ? viewport.width / CAPTURE_W : 1;
            const scaleY = (viewport && viewport.height > 0) ? viewport.height / CAPTURE_H : 1;
            console.log(`🎨 [DRAW][POINTS_SCALE] scaleX=${scaleX.toFixed(4)}, scaleY=${scaleY.toFixed(4)}`);
            scaledPoints = args.points.map((pt: any) => {
              // 🎯 Fix: AI sometimes returns points as an array of JSON strings, 
              // or objects with literally quoted keys like "\"x\"" because of over-escaping.
              let cleanPt = pt;
              if (typeof pt === 'string') {
                try { cleanPt = JSON.parse(pt); } catch (e) { /* ignore */ }
              }

              // Extract X and Y defensively (covers: pt.x, pt['"x"'], pt['\"x\"'], pt[0])
              let x = cleanPt.x;
              let y = cleanPt.y;

              // If x/y are missing, search for literally quoted keys (hallucinated by some models)
              if (x === undefined || x === null) {
                // Check for keys like "\"x\"" or '"x"'
                for (const k of Object.keys(cleanPt)) {
                  const cleanK = k.replace(/[\"\\\']/g, '').toLowerCase();
                  if (cleanK === 'x') x = cleanPt[k];
                  if (cleanK === 'y') y = cleanPt[k];
                }
              }

              // Final fallback if still undefined/null
              const finalX = Number(x);
              const finalY = Number(y);

              return {
                x: isNaN(finalX) ? 0 : (finalX * scaleX) + (viewport?.offsetX || 0),
                y: isNaN(finalY) ? 0 : (finalY * scaleY) + (viewport?.offsetY || 0)
              };
            });
            console.log(`🎨 [DRAW][POINTS_SCALED] Scaled points sample (first 3):`, JSON.stringify(scaledPoints.slice(0, 3)));
          } else if (args.actionType === 'freehand') {
            console.warn(`⚠️ [DRAW][WARNING] AI requested 'freehand' but provided NO 'points' array! args=${JSON.stringify(args)}`);
          }

          this.onDraw?.({
            id: crypto.randomUUID(),
            type: args.actionType,
            x: worldX,
            y: worldY,
            width: worldW,
            height: worldH,
            color: args.color || '#ff6b6b',
            label: args.label,
            points: scaledPoints,
            timestamp: Date.now()
          });
        }
        if (fc.name === 'updateNotebook') {
          // 🛡️ Logging
          console.log(`📝 [NOTEBOOK] Updating logic with title: ${(fc.args as any).title}`);
          this.onNote?.(fc.args as unknown as NoteData);
        }

        if (this.isConnected && this.session) {
          // 🎯 Fix: Direct payload structure or ensure ID is string
          // Based on common issue: Code 1011 often means "Invalid Argument" or "Schema Mismatch"
          // We wrap it in the expected top-level object.
          this.safeSendToolResponse({
            functionResponses: [{
              id: fc.id,
              name: fc.name,
              response: { result: { status: 'ok', txn: crypto.randomUUID() } } // 🛡️ Fix: Return object, not string
            }],
          });
        }
      } catch (e) {
        console.error("Tool Error", e);
      }
    }
  }

  private handleError(err: any) {
    const msg = err?.message || '';
    if (this.onDisconnect) {
      this.onDisconnect(msg || "Unknown connection error");
    }
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