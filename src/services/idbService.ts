
import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import {
  HistoryItem, QuizResult, Flashcard, LibraryItem, LibraryFolder,
  AtomCore, NoteRecord, FileRecord, LocalTrainingSource,
  ChunkState, QuizSessionV2, RawActivityEvent
} from '../types';
import { QuestionBankItem } from './v2/typesV2';
import { ExamResult } from './scoring/types';
import { JourneyEvent, JourneySyncStateLocal } from '../types/journey';

export interface PDFChunk {
  id: string; // contentId + chunkIndex + feature
  fileId?: string; // Unified link
  contentId: string;
  feature?: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  status: 'PENDING' | 'COMPLETE';
  processedAt?: number;
}

interface EduvaDB extends DBSchema {
  history: {
    key: string;
    value: HistoryItem & { userId: string };
    indexes: { 'by_user': string, 'by_content': string };
  };
  results: {
    key: string;
    value: QuizResult & { userId: string };
    indexes: { 'by_user': string };
  };
  flashcards: {
    key: string;
    value: Flashcard & { userId: string };
    indexes: { 'by_user': string };
  };
  library: {
    key: string;
    value: LibraryItem & { userId: string };
    indexes: { 'by_user': string };
  };
  folders: {
    key: string;
    value: LibraryFolder & { userId: string };
    indexes: { 'by_user': string };
  };
  pdf_chunks: {
    key: string;
    value: PDFChunk;
    indexes: { 'by_content': string, 'by_file': string };
  };
  files: {
    key: string;
    value: FileRecord;
    indexes: { 'by_content': string };
  };
  local_atoms: {
    key: string;
    value: AtomCore;
    indexes: { 'by_content': string, 'by_user': string };
  };
  training_sources: {
    key: string;
    value: LocalTrainingSource;
    indexes: { 'by_student': string, 'by_hash': string };
  };
  question_bank: {
    key: string;
    value: QuestionBankItem;
    indexes: { 'by_status': string };
  };
  chunks: {
    key: string;
    value: ChunkState;
    indexes: { 'by_doc': string };
  };
  quiz_sessions: {
    key: string;
    value: QuizSessionV2;
    indexes: { 'by_doc': string, 'by_status': string };
  };
  student_raw_activity: {
    key: string;
    value: RawActivityEvent;
    indexes: { 'by_student': string, 'by_subject': string };
  };

  // --- FEATURE-SPECIFIC ATOM STORES ---
  notes_atoms: {
    key: string;
    value: AtomCore;
    indexes: { 'by_content': string, 'by_file': string };
  };
  quiz_atoms: {
    key: string;
    value: AtomCore;
    indexes: { 'by_content': string, 'by_file': string };
  };
  exam_atoms: {
    key: string;
    value: AtomCore;
    indexes: { 'by_content': string, 'by_file': string };
  };
  audio_atoms: {
    key: string;
    value: AtomCore;
    indexes: { 'by_content': string, 'by_file': string };
  };

  // --- REFS ---
  // --- REFS ---
  notes_feat: {
    key: string;
    value: NoteRecord;
    indexes: { 'by_content': string, 'by_file': string };
  };

  // --- EXAM BUNKER (V2 LOCKED) ---
  exam_runtime: {
    key: string;
    value: {
      examSessionId: string;
      currentQuestionIndex: number;
      answers: Record<string, any>;
      serverOffset: number;
      startedAt: number;
      lastActiveAt: number;
      timestamps: Record<string, number>;
      materializedQuestions: Record<string, any>; // Cache of AI outputs
      finished: boolean;
    };
    indexes: {};
  };

  // --- EXAM RESULTS (STAGE 5) ---
  exam_results: {
    key: string;
    value: ExamResult;
    indexes: { 'by_user': string };
  };
  micro_loop_sessions: {
    key: string;
    value: import('../types').MicroLoopSession;
    indexes: { 'by_user': string, 'by_atom': string };
  };
  generation_manifests: {
    key: string;
    value: {
      id: string;
      docFingerprint: string;
      curriculumNodeId: string;
      archetypeId: string;
      language: string;
      atomIds: string[];
      createdAt: number;
    };
    indexes: {};
  };
  curriculum_maps: {
    key: string;
    value: import('../types/ingestion').CurriculumMap;
    indexes: {};
  };
  ingestion_ledgers: {
    key: string;
    value: import('../types/ingestion').IngestionLedger;
    indexes: { 'by_status': string };
  };

  // --- JOURNEY MODULE (V19) ---
  journey_events_local: {
    key: string;
    value: JourneyEvent;
    indexes: {
      'by_date_student': [string, string, number]; // [studentId, date, startAt] for timeline
      'by_sync_status': string;
    };
  };
  journey_sync_state_local: {
    key: string; // studentId
    value: JourneySyncStateLocal;
    indexes: {};
  };
}

const DB_NAME = 'eduva-v5-core';
const DB_VERSION = 19; // Bumped for Journey Module (v19)

export const getDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<EduvaDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Core Stores
        if (oldVersion < 1) {
          ['history', 'results', 'flashcards', 'library'].forEach(name => {
            if (!db.objectStoreNames.contains(name as any)) {
              const store = db.createObjectStore(name as any, { keyPath: 'id' });
              store.createIndex('by_user', 'userId');
            }
          });

          if (!db.objectStoreNames.contains('pdf_chunks')) {
            const chunkStore = db.createObjectStore('pdf_chunks', { keyPath: 'id' });
            chunkStore.createIndex('by_content', 'contentId');
          }

          const atomStores = ['notes_atoms', 'quiz_atoms', 'exam_atoms', 'audio_atoms', 'notes_feat'];
          atomStores.forEach(name => {
            if (!db.objectStoreNames.contains(name as any)) {
              const store = db.createObjectStore(name as any, { keyPath: name.includes('atoms') ? 'atomId' : 'id' });
              store.createIndex('by_content', 'contentId');
            }
          });

          if (!db.objectStoreNames.contains('files')) {
            const fileStore = db.createObjectStore('files', { keyPath: 'id' });
            fileStore.createIndex('by_content', 'contentId');
          }
        }

        // Ensure folders store exists (Fix for missing store in v11)
        if (!db.objectStoreNames.contains('folders')) {
          const store = db.createObjectStore('folders', { keyPath: 'id' });
          store.createIndex('by_user', 'userId');
        }

        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('local_atoms')) {
            const store = db.createObjectStore('local_atoms', { keyPath: 'atomId' });
            store.createIndex('by_content', 'metadata.sourceDocumentId');
            store.createIndex('by_user', 'metadata.userId');
          }
          if (!db.objectStoreNames.contains('training_sources')) {
            const store = db.createObjectStore('training_sources', { keyPath: 'id' });
            store.createIndex('by_student', 'studentId');
            store.createIndex('by_hash', 'fileHash');
          }
        }

        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('question_bank')) {
            const store = db.createObjectStore('question_bank', { keyPath: 'qkey' });
            store.createIndex('by_status', 'status');
          }
        }

        if (oldVersion < 8) {
          if (!db.objectStoreNames.contains('chunks')) {
            const store = db.createObjectStore('chunks', { keyPath: 'id' });
            store.createIndex('by_doc', 'docFingerprint');
          }
        }

        if (oldVersion < 10) {
          if (!db.objectStoreNames.contains('quiz_sessions')) {
            const store = db.createObjectStore('quiz_sessions', { keyPath: 'sessionId' });
            store.createIndex('by_doc', 'sourceDocId');
            store.createIndex('by_status', 'status');
          }
        }

        if (oldVersion < 11) {
          if (!db.objectStoreNames.contains('student_raw_activity')) {
            const store = db.createObjectStore('student_raw_activity', { keyPath: 'id' });
            store.createIndex('by_student', 'studentId');
            store.createIndex('by_subject', 'subject');
          }
        }

        // V2 EXAM BUNKER
        if (oldVersion < 13) {
          if (!db.objectStoreNames.contains('exam_runtime')) {
            db.createObjectStore('exam_runtime', { keyPath: 'examSessionId' });
          }
        }

        if (oldVersion < 14) {
          if (!db.objectStoreNames.contains('exam_results')) {
            const store = db.createObjectStore('exam_results', { keyPath: 'examSessionId' });
            store.createIndex('by_user', 'userId');
          }
        }
        if (oldVersion < 15) {
          if (!db.objectStoreNames.contains('micro_loop_sessions')) {
            const store = db.createObjectStore('micro_loop_sessions', { keyPath: 'id' });
            store.createIndex('by_user', 'userId');
            store.createIndex('by_atom', 'atomId');
          }
        }

        // V16: Ingestion Architecture v1.2
        // V16: Ingestion Architecture v1.2
        if (oldVersion < 16) {
          if (!db.objectStoreNames.contains('generation_manifests')) {
            const store = db.createObjectStore('generation_manifests', { keyPath: 'id' });
            // No specific indexes needed for v1
          }
          if (!db.objectStoreNames.contains('curriculum_maps')) {
            const store = db.createObjectStore('curriculum_maps', { keyPath: 'mapId' });
            // No specific indexes needed for v1
          }
        }

        // V17: Non-Breakable Ingestion v1.3
        if (oldVersion < 17) {
          if (!db.objectStoreNames.contains('ingestion_ledgers')) {
            const store = db.createObjectStore('ingestion_ledgers', { keyPath: 'docFingerprint' });
            store.createIndex('by_status', 'status');
          }
        }

        // V19: Journey Module
        if (oldVersion < 19) {
          if (!db.objectStoreNames.contains('journey_events_local')) {
            const store = db.createObjectStore('journey_events_local', { keyPath: 'id' });
            store.createIndex('by_date_student', ['studentId', 'date', 'startAt']);
            store.createIndex('by_sync_status', 'syncStatus');
          }
          if (!db.objectStoreNames.contains('journey_sync_state_local')) {
            db.createObjectStore('journey_sync_state_local', { keyPath: 'studentId' });
          }
        }
      },
    });
  }
  return dbPromise;
};


export const clearDatabase = async () => {
  dbPromise = null;
  await deleteDB(DB_NAME);
};

let dbPromise: Promise<IDBPDatabase<EduvaDB>> | null = null;
