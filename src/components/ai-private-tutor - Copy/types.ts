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

export interface DrawingAction {
  id: string;
  type: 'circle' | 'arrow' | 'highlight' | 'rect' | 'freehand' | 'eraser';
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
  voiceName: string; // 'Puck', 'Fenrir' (Male) | 'Kore', 'Zephyr' (Female)
  language: 'English' | 'Arabic';
  persona: 'Funny' | 'Strict' | 'Supportive';
  studentName?: string;
}

// Gemini Live API Types
export interface LiveConfig {
  model: string;
  voiceName: string;
  systemInstruction: string;
}