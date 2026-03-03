// ==========================================
// EDUVA v7 IMMUTABLE CORE ARCHITECTURE
// ==========================================

// 1. AtomCore: KNOWLEDGE ONLY. IMMUTABLE.
// DO NOT MODIFY THIS INTERFACE.
export interface Atom {
  readonly id: string;
  readonly content: string; // The raw concept/fact text
  readonly type: 'concept' | 'definition' | 'procedure' | 'example';
  readonly metadata: {
    readonly sourceDocumentId: string; // Hard link to source
    readonly pageNumber?: number; // Optional location metadata
  };
}

// 2. SourceDocument: Registry for files
export interface SourceDocument {
  readonly id: string;
  readonly name: string;
  readonly type: 'pdf' | 'image' | 'screen_capture';
  readonly url?: string; // For uploaded blobs
  readonly uploadedAt: number;
}

// 3. ViewModels: UI State Wrappers
// All UI-specific state must live here, NOT in Atom.
export interface AtomViewModel {
  readonly atom: Atom;
  readonly uiState: {
    isSelected: boolean;
    isHighlighted: boolean;
    explanationStatus: 'idle' | 'loading' | 'explaining' | 'completed';
  };
}

// ==========================================
// APP SPECIFIC TYPES
// ==========================================

export enum TeacherState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  EXPLAINING = 'EXPLAINING', // Speaking
  WATCHING = 'WATCHING', // Observing screen/PDF
}

// --- Board Revamp Infrastructure ---
export type BoardLifecycle = 'idle' | 'loading' | 'ready' | 'detached';
export type BoardSource = 'board' | 'pdf' | 'screen';

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface Rect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stroke {
  id: string;
  author: 'user' | 'ai';
  tool: 'pen' | 'freehand' | 'highlight' | 'arrow' | 'circle' | 'laser' | 'eraser' | 'text';
  path: { x: number; y: number; p?: number }[]; // World Coordinates (PDF pixels @ scale=1) + Pressure
  color: string;
  width: number;
  text?: string;
  textMaxWidth?: number;
}

export interface BoardState {
  lifecycle: BoardLifecycle;
  source: BoardSource;
  viewport: ViewportState;
  visibleRects: Rect[];
  strokes: Stroke[];
  snapshotBuffer: string | null; // Base64
  mode: 'study' | 'ask_ai' | 'teach_ai';
}

export interface DrawingAction {
  id: string;
  type: 'circle' | 'arrow' | 'highlight' | 'rect' | 'freehand' | 'eraser' | 'text' | 'laser';
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  label?: string;
  timestamp: number;
  // Context for persistent positioning on scrolling documents
  scrollX?: number;
  scrollY?: number;
  // For freehand/eraser paths
  points?: { x: number, y: number }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  attachments?: string[]; // base64 images
}

// Live Notebook Type
export interface NoteData {
  title: string;
  content: string; // Markdown content with Math/Tables support
  colorTheme: 'yellow' | 'blue' | 'green' | 'pink';
}

// Dynamic Quick Action
export interface QuickAction {
  label: string;
  prompt: string;
}

// Session Settings
export interface SessionConfig {
  voiceName: string; // 'Puck', 'Charon' (Male) | 'Kore', 'Aoede' (Female)
  language: 'English' | 'Arabic';
  persona: 'Funny' | 'Strict' | 'Supportive';
  studentName?: string;
  isReconnecting?: boolean;
}

// Gemini Live API Types
export interface LiveConfig {
  model: string;
  voiceName: string;
  systemInstruction: string;
}