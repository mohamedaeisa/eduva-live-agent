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

import { DrawingAction, NoteData, SessionConfig, QuickAction } from '../types';

/* =========================
   Tool Declarations
========================= */

const drawOnScreenTool: FunctionDeclaration = {
  name: 'drawOnScreen',
  description: 'Draw annotations on the student screen.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: { type: Type.STRING },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
      width: { type: Type.NUMBER },
      height: { type: Type.NUMBER },
      color: { type: Type.STRING },
      label: { type: Type.STRING },
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
  private isStartupMuted = false;
  private personaLocked = false;

  /* ---------- Session State ---------- */
  private sessionResumptionHandle: string | null = null;
  private manualDisconnect = false;
  private lastConnectionAttempt = 0;
  private deadlockTriggered = false;
  private hasReceivedAnyAIOutput = false;
  /* ---------- Turn Authority ---------- */
  private _turnState: TurnState = TurnState.IDLE;
  private currentTurnId: number | null = null;
  private turnCounter = 0;
  private lastIdleVisionFrame: string | null = null; // Phase 5 Buffer
  onTurnReady?: () => void;
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
    draw: (a: DrawingAction) => void,
    note: (n: NoteData) => void,
    state: (s: string) => void,
    actions: (a: QuickAction[]) => void
  ) {
    this.onDraw = draw;
    this.onNote = note;
    this.onState = state;
    this.onActions = actions;
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
    // 🔒 Phase 2: One Turn = One Token
    if (this.currentTurnId !== null) {
      console.warn(`[TURN AUTHORITY] Denied startTurn(${reason}): Turn ${this.currentTurnId} is still active.`);
      return null;
    }

    this.turnCounter++;
    this.currentTurnId = this.turnCounter;
    console.log(`[TURN AUTHORITY] startTurn(id: ${this.currentTurnId}, reason: ${reason})`);

    // 🔒 Phase 5: Commit Buffered Vision Snapshot
    if (this.lastIdleVisionFrame && this.session) {
      console.log(`[VISION] snapshot-sent (reason: ${reason})`);
      this.session.sendRealtimeInput({
        media: { mimeType: "image/jpeg", data: this.lastIdleVisionFrame }
      });
      this.lastIdleVisionFrame = null; // Clear after use
    }

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
    this.stopAudioPlayback(reason);
  }

  private stopAudioPlayback(reason: string) {
    this.audioParts = [];
    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop(); } catch (e) { }
      this.currentAudioSource = null;
    }
    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this.isAISpeaking = false;
    this.nextPlaybackTime = this.playbackCtx?.currentTime || 0;

    this.endTurnOnce(reason);
  }

  private finishTurn(id: number, reason: string) {
    if (this.currentTurnId !== id) {
      console.debug(`[TURN AUTHORITY] Ignoring finishTurn for mismatched id: ${id} (current: ${this.currentTurnId}, reason: ${reason})`);
      return;
    }

    console.log(`[TURN AUTHORITY] finishTurn(id: ${id}, reason: ${reason})`);
    this.currentTurnId = null;
    this.onGeneration?.(false);
    this.isInterrupted = false; // 🛡️ Fix: Clear interruption flag so new turns can start
    this.setTurnState(TurnState.LISTENING);
    this.onTurnReady?.();
  }

  get inputAnalyserNode() { return this.inputAnalyser; }
  get outputAnalyserNode() { return this.outputAnalyser; }

  async connect(config: SessionConfig, apiKey: string) {
    console.debug("LiveSessionService: connect called");

    this.manualDisconnect = false;
    const now = Date.now();
    if (now - this.lastConnectionAttempt < 2500) {
      throw new Error("Please wait a moment before reconnecting.");
    }
    this.lastConnectionAttempt = now;

    this.markTransportClosed("connect-start");

    // � Phase 1 & 2: Authority State Reset
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
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
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
          this.onState?.('LISTENING');

          // Startup Mute logic
          this.isStartupMuted = true;
          this.personaLocked = false; // Lock audio 

          setTimeout(() => {
            this.personaLocked = true; // Unlock after 1.2s
            console.log("🔓 PERSONA AUDIO UNLOCKED");
          }, 1200);

          setTimeout(() => {
            this.isStartupMuted = false;
          }, 3000);
        },
        onmessage: (m) => {
          this.enqueueMessage(m);
        },
        onerror: (e) => {
          console.error("LiveSessionService: Error", e);
          this.handleError(e);
        },
        onclose: () => {
          console.log("LiveSessionService: Closed");
          this.markTransportClosed("onclose");
        },
      },
    });

    try {
      this.session = await sessionPromise;

      // 7. Send Initial Greeting (EXACTLY ONCE)
      if (this.connected && this.session) {
        const tid = this.startTurn("initial-greeting");
        if (tid !== null) {
          console.log(`[TURN AUTHORITY] Greeting started (id: ${tid})`);
          let greetingPrompt = "";
          const name = config.studentName ? `, addressing the student as "${config.studentName}"` : "";

          if (config.language === 'Arabic') {
            if (config.persona === 'Funny') {
              greetingPrompt = `User connected. You are "Ibn Balad" (Funny Egyptian Tutor). BE SUPER ENERGETIC! Start with a LOUD, WARM, HILARIOUS greeting in Masri slang${name} (e.g., "Ahlan Ya [Name] Ya Basha! Nawarret el Donia!"). Hype me up! Then, IMMEDIATELY say: "Yalla, share your screen or upload a PDF so we can crush this!"`;
            } else {
              greetingPrompt = `User connected. You are ${config.persona}. BE ENERGETIC! Say a warm, encouraging hello in Egyptian Arabic${name}. Then, IMMEDIATELY ask me to share my screen or upload a PDF to start.`;
            }
          } else {
            greetingPrompt = `User connected. You are ${config.persona}. BE SUPER ENERGETIC! Give me a POSITIVE, HYPE welcome${name}. Make me feel like a champion! Then, IMMEDIATELY guide me: "Let's go! Share your screen or upload a PDF to get started!"`;
          }
          const fullPrompt = greetingPrompt;
          console.log("🐛 INITIAL GREETING PROMPT:", fullPrompt);

          // this.isStartupMuted = false; // Unmute for response - handled by audio pipeline
          // this.hasGreeted = true; // MARK GREETED - not needed with turn authority
          await this.session.sendRealtimeInput({
            content: [{ parts: [{ text: fullPrompt }] }]
          });
        }
      }

      // NO DEADLOCK BREAKER.

    } catch (e) {
      this.handleError(e);
    }
  }

  /**
   * RECOVERABLE: Mark transport as closed but keep session state alive.
   */
  private markTransportClosed(reason: string) {
    console.warn(`LiveSessionService: Transport Closed (${reason})`);
    this.connected = false;

    // Stop Tracks / Audio Cleanups (But keep Resumption Handle)
    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
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

    // DO NOT clear resumption handle here.
    // DO NOT emit 'DISCONNECTED' here (User Panic Button).
    // We are simply "Not Connected" anymore, waiting for a new connect().
  }

  /**
   * FATAL: Explicit Shutdown (User Action or Fatal Error).
   */
  async shutdown() {
    console.debug("LiveSessionService: shutdown called (FATAL)");

    // 1. Kill Resumption
    this.sessionResumptionHandle = null;

    // 2. Clear Queues
    this.messageQueue = [];
    this.audioParts = [];
    this.hasReceivedAnyAIOutput = false;

    // 3. Close Transport
    this.markTransportClosed("shutdown");

    // 4. Notify App (Reset UI)
    this.requestTurnEnd("shutdown");
    this.onState?.('DISCONNECTED');
  }

  toggleMute(m: boolean) {
    this.muted = m;
  }

  sendText(text: string) {
    if (!this.connected || !this.session) return;
    const tid = this.startTurn("user-text-input"); // Rule 2 — LOCK BEFORE TEXT
    if (tid === null) return; // Denied
    this.session.sendRealtimeInput({
      content: [{ parts: [{ text }] }],
    });
  }

  async sendVideoFrame(base64Image: string, metadata?: any) {
    // 🔒 Phase 4/5: Hard Vision Gate + Buffering
    // Allow buffering in IDLE (before session start) or LISTENING (between turns)
    if (this._turnState === TurnState.GENERATING || this._turnState === TurnState.SPEAKING || this.currentTurnId !== null) {
      console.debug('[VISION] dropped — system not idle');
      return;
    }

    const cleanBase64 = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
    this.lastIdleVisionFrame = cleanBase64;
    console.log('[VISION] snapshot-saved');
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
        console.debug(`[TURN AUTHORITY] Dropping stale message for turn ${(msg as any)._turnId} (current: ${this.currentTurnId})`);
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
      }

      // Streaming Flush Logic (Edusync Compliance)
      const shouldFlush = this.audioParts.length >= 10 || !!msg.serverContent?.turnComplete;

      if (shouldFlush && this.audioParts.length > 0) {
        const audioToPlay = [...this.audioParts];
        this.audioParts = [];
        this.playGeminiAudioChunks(audioToPlay, turnId);
      }

      if (msg.serverContent?.turnComplete) {
        // No auto-finish here. Audio playback or end-of-audio will trigger it.
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
        this.currentAudioSource = null;
        // 🔒 Phase 1: Only Audio moves state
        this.setTurnState(TurnState.SPEAKING);

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
    if (!this.connected || this.muted || this.isStartupMuted) return;

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
      this.startTurn("user-voice-activity");
    }

    // --- HARD INTERRUPT (Client-Side VAD) ---
    // If AI is speaking and user makes significant noise
    if (this.isAISpeaking && maxVolume > 0.15) {
      console.warn('[TURN] User interrupted AI (Client-Side Barge-In)');
      this.requestTurnEnd("client-side-barge-in");
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
    if (this.connected && this.session) {
      try {
        this.session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio,
          },
        });
      } catch (e: any) {
        // Swallow WebSocket closure errors to keep logs clean during disconnect
        if (!e.message?.includes("CLOSING") && !e.message?.includes("CLOSED")) {
          console.error("LiveSessionService: Audio send error", e);
        }
      }
    }
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
    for (const fc of msg.toolCall.functionCalls) {
      try {
        if (fc.name === 'drawOnScreen') {
          this.onDraw?.({ id: crypto.randomUUID(), type: (fc.args as any).actionType, ...(fc.args as any), timestamp: Date.now() });
        }
        if (fc.name === 'updateNotebook') {
          this.onNote?.(fc.args as unknown as NoteData);
        }
        if (fc.name === 'suggestActions') {
          this.onActions?.((fc.args as any).actions);
        }

        this.session?.sendToolResponse({
          functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'ok' } }],
        });
      } catch (e) {
        console.error("Tool Error", e);
      }
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