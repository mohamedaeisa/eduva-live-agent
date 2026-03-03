import { Language } from '../types';

export enum IngestionMode {
    FRESH = 'FRESH',
    RESUME = 'RESUME'
}

export enum ExtractionMode {
    PAGE = 'page',
    CURRICULUM = 'curriculum' // vNext
}

export interface IngestionConfig {
    documentId: string;
    subject: string;
    language: Language;
    extractionMode: ExtractionMode;
    studentProfileId?: string; // Required if extractionMode === 'curriculum'

    // Operational flags
    mode?: IngestionMode;
    dryRun?: boolean;

    // Phase 3 R3 v1.1: Configuration metadata
    metadata?: {
        skipAtomExtraction?: boolean;
        [key: string]: any;
    };
}

// --- Curriculum Types ---

export type NodeContentStatus = 'EMPTY' | 'OK';
export type NodeType = 'concept' | 'rule' | 'skill' | 'process';
export type ExamWeight = 'low' | 'medium' | 'high';

export interface CurriculumNode {
    nodeId: string;
    title: string;
    type: NodeType;
    parentId: string | null;
    prerequisites: string[];
    examWeight: ExamWeight;
    sourceAnchors: {
        sectionTitle: string;
        textSpanHint: string;
        pageRef?: number;
    };
    contentStatus?: NodeContentStatus; // Added in v1.2
}

export interface CurriculumMap {
    mapId: string;
    subject: string;
    grade: string;
    language: string;
    version: string;
    rootNodes: string[];
    nodes: CurriculumNode[];
    createdAt: number;
}
export enum IngestionStage {
    INIT = 'INIT',
    MAP_SAVED = 'MAP_SAVED',         // Structure Generated & Persisted
    BATCHING_READY = 'BATCHING_READY', // Text Split & Batches Defined
    BATCH_PROCESSING = 'BATCH_PROCESSING', // Atoms being extracted
    FINALIZING = 'FINALIZING',       // Cleanup & Indexing
    COMPLETE = 'COMPLETE'            // Done
}

export interface IngestionJob {
    jobId: string;
    config: IngestionConfig;
    stage: IngestionStage;

    // Checkpoint Data
    mapId?: string;
    batches?: any[]; // Stored batch definitions
    totalBatches: number;
    completedBatchIndices: number[]; // e.g. [0, 1, 3]

    lastUpdated: number;
    error?: string;
}

// --- v1.3: Ingestion Ledger (Single Source of Truth) ---

/**
 * Authoritative status for an ingestion process.
 * safeToConsume MUST be true ONLY when status === 'COMPLETED'.
 */
export type IngestionLedgerStatus =
    | 'CREATED'
    | 'PDF_EXTRACTED'
    | 'CHUNK_PROCESSING'
    | 'PARTIAL_PAUSED_QUOTA'
    | 'PARTIAL_PAUSED_RATE_LIMIT'
    | 'RESUMING'
    | 'COMPLETED'
    | 'FAILED_LIMIT'
    | 'FAILED_TERMINAL';

/**
 * IngestionLedger — Single Source of Truth for document ingestion.
 * 
 * Key invariants:
 * - safeToConsume = (status === 'COMPLETED')
 * - COMPLETED ⇔ completedChunks.length === totalChunks
 * - FAILED_TERMINAL chunks are never retried
 */
export interface IngestionLedger {
    docFingerprint: string;           // Primary key
    subject: string;
    language: string;
    userId: string;

    // 🔒 IMMUTABLE after PDF_EXTRACTED
    totalChunks: number;
    pdfTextCacheKey: string;

    // 🔄 MUTABLE during processing
    completedChunks: number[];        // e.g. [0,1,2,3]
    failedExternalChunks: number[];   // e.g. [4,5] - retryable
    failedLogicChunks: number[];      // e.g. [] - terminal, never retry

    // 🔒 AUTHORITATIVE STATUS
    status: IngestionLedgerStatus;
    safeToConsume: boolean;           // 🔑 Consumers MUST check this

    // Scheduling
    pausedReason?: string;
    retryScheduledAt?: number;

    // Metadata
    createdAt: number;
    updatedAt: number;
}

