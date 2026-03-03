import { QuizType, Difficulty, QuizSessionInit, QuestionResult } from '../../types';

export type BloomLevel = 'RECALL' | 'APPLY' | 'ANALYZE';

export interface UniversalQuestion {
  qkey: string; // SHA256 Fingerprint
  atomId: string;
  eduType: string;
  grade: number;

  difficulty: 'L1' | 'L2' | 'L3';
  bloom: BloomLevel;
  questionType: 'MCQ' | 'TF' | 'FIB';

  stem: string;
  options: {
    id: string;          // UUID (stable)
    text: string;
    isCorrect: boolean;
  }[];

  metadata: {
    visualHint?: string;
    tags: string[];
    fetchSource?: 'Local' | 'Global' | 'AI' | 'Fallback';
  };

  analytics: {
    correctRate: number;
    flaggedCount: number;
    downloadCount: number;
    reuseCount: number;
  };

  createdAt: number;
  lastUsedAt: number;
}

/**
 * QuestionBankItem (v2.0)
 * Persistent wrapper for UniversalQuestion in IndexedDB
 */
export interface QuestionBankItem extends UniversalQuestion {
  status?: string;
}

export interface QuestionRequest {
  atomIds: string[];
  eduType: string;
  grade: number;
  questionType: 'MCQ' | 'TF' | 'FIB';
  difficulty: 'L1' | 'L2' | 'L3';
  bloom: BloomLevel;
  quantity: number;
}

/**
 * ActiveSession (v2.0)
 * Represents a live adaptive quiz session state
 */
export interface ActiveSession {
  sessionId: string;
  studentId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED';
  results: QuestionResult[];
  qsio: QuizSessionInit;
  startedAt: number;
  lastUpdatedAt: number;
}