import { logger } from '../../utils/logger';

/**
 * Phase 3 R3 v1.1: CIRCUIT BREAKER SYSTEM
 * 
 * Purpose: Protect system from resource exhaustion by failing fast
 * on oversized documents, token budget violations, and time limits.
 * 
 * Prevents:
 * - Memory exhaustion from massive PDFs
 * - Token quota burnout
 * - Indefinite processing hangs
 */

// 🔒 CIRCUIT BREAKER CONFIGURATION
export const CIRCUIT_BREAKER_CONFIG = {
    // Level 1: Document Size Limits
    MAX_DOC_CHARS: 5_000_000,        // 5MB text (~1000 pages)
    MAX_CHUNKS: 200,                  // Hard cap on text chunks
    MIN_CHUNK_SIZE: 1000,             // Minimum viable chunk

    // Level 2: AI Token Budget (Estimated)
    MAX_TOKENS_PER_JOB: 500_000,      // Total token budget for one ingestion
    ESTIMATED_TOKENS_PER_CHAR: 0.25,  // Conservative estimate (4 chars/token)
    MAX_RETRIES_PER_BATCH: 2,         // Fail fast on chronic errors

    // Level 3: Memory Pressure
    MAX_PENDING_ATOMS: 10_000,        // Flush to disk before OOM
    MAX_NODES_PER_MAP: 500,           // Sanity limit on map complexity

    // Level 4: Time-Based Limits
    MAX_INGESTION_TIME_MS: 600_000,   // 10 minute hard cap (600 seconds)
    MAX_AI_CALL_TIME_MS: 120_000,     // 2 minutes per AI call

    // Level 5: Rate Limiting
    MAX_CONCURRENT_AI_CALLS: 3,       // Parallel AI calls
    MIN_DELAY_BETWEEN_CALLS_MS: 200,  // Rate limiter delay
} as const;

// 🚨 Circuit Breaker Error Types
export class CircuitBreakerError extends Error {
    constructor(
        public readonly level: string,
        public readonly threshold: number,
        public readonly actual: number,
        message: string
    ) {
        super(message);
        this.name = 'CircuitBreakerError';
    }
}

/**
 * Document Size Gate - Level 1
 * Checks if document is processable before any work begins
 */
export function checkDocumentSize(textLength: number): void {
    if (textLength > CIRCUIT_BREAKER_CONFIG.MAX_DOC_CHARS) {
        logger.error('INGESTION', `[CIRCUIT_BREAKER] Document too large: ${textLength} chars (max: ${CIRCUIT_BREAKER_CONFIG.MAX_DOC_CHARS})`);
        throw new CircuitBreakerError(
            'DOCUMENT_SIZE',
            CIRCUIT_BREAKER_CONFIG.MAX_DOC_CHARS,
            textLength,
            `Document exceeds processing capacity. Size: ${formatSize(textLength)}, Limit: ${formatSize(CIRCUIT_BREAKER_CONFIG.MAX_DOC_CHARS)}. Please split into smaller files.`
        );
    }

    if (textLength < CIRCUIT_BREAKER_CONFIG.MIN_CHUNK_SIZE) {
        logger.warn('INGESTION', `[CIRCUIT_BREAKER] Document very small: ${textLength} chars`);
        throw new CircuitBreakerError(
            'DOCUMENT_TOO_SMALL',
            CIRCUIT_BREAKER_CONFIG.MIN_CHUNK_SIZE,
            textLength,
            `Document too small to extract meaningful curriculum structure. Minimum: ${CIRCUIT_BREAKER_CONFIG.MIN_CHUNK_SIZE} characters.`
        );
    }

    logger.ingestion(`[CIRCUIT_BREAKER] ✅ Document size OK: ${formatSize(textLength)}`);
}

/**
 * Chunk Count Gate - Level 1
 * Prevents infinite chunking loops
 */
export function checkChunkCount(chunkCount: number): void {
    if (chunkCount > CIRCUIT_BREAKER_CONFIG.MAX_CHUNKS) {
        logger.error('INGESTION', `[CIRCUIT_BREAKER] Too many chunks: ${chunkCount} (max: ${CIRCUIT_BREAKER_CONFIG.MAX_CHUNKS})`);
        throw new CircuitBreakerError(
            'CHUNK_COUNT',
            CIRCUIT_BREAKER_CONFIG.MAX_CHUNKS,
            chunkCount,
            `Document produced ${chunkCount} chunks. Maximum allowed: ${CIRCUIT_BREAKER_CONFIG.MAX_CHUNKS}. Document may be malformed.`
        );
    }

    logger.ingestion(`[CIRCUIT_BREAKER] ✅ Chunk count OK: ${chunkCount}`);
}

/**
 * Token Budget Gate - Level 2
 * Estimates token usage before making expensive AI calls
 */
export function checkTokenBudget(estimatedChars: number): void {
    const estimatedTokens = Math.ceil(estimatedChars * CIRCUIT_BREAKER_CONFIG.ESTIMATED_TOKENS_PER_CHAR);

    if (estimatedTokens > CIRCUIT_BREAKER_CONFIG.MAX_TOKENS_PER_JOB) {
        logger.error('INGESTION', `[CIRCUIT_BREAKER] Token budget exceeded: ~${estimatedTokens} tokens (max: ${CIRCUIT_BREAKER_CONFIG.MAX_TOKENS_PER_JOB})`);
        throw new CircuitBreakerError(
            'TOKEN_BUDGET',
            CIRCUIT_BREAKER_CONFIG.MAX_TOKENS_PER_JOB,
            estimatedTokens,
            `Estimated token usage (~${estimatedTokens.toLocaleString()}) exceeds budget (${CIRCUIT_BREAKER_CONFIG.MAX_TOKENS_PER_JOB.toLocaleString()}). Consider smaller documents.`
        );
    }

    logger.ingestion(`[CIRCUIT_BREAKER] ✅ Token budget OK: ~${estimatedTokens.toLocaleString()} tokens`);
}

/**
 * Node Count Gate - Level 3
 * Validates map complexity before storage
 */
export function checkNodeCount(nodeCount: number): void {
    if (nodeCount > CIRCUIT_BREAKER_CONFIG.MAX_NODES_PER_MAP) {
        logger.error('INGESTION', `[CIRCUIT_BREAKER] Too many nodes: ${nodeCount} (max: ${CIRCUIT_BREAKER_CONFIG.MAX_NODES_PER_MAP})`);
        throw new CircuitBreakerError(
            'NODE_COUNT',
            CIRCUIT_BREAKER_CONFIG.MAX_NODES_PER_MAP,
            nodeCount,
            `Curriculum map has ${nodeCount} nodes. Maximum allowed: ${CIRCUIT_BREAKER_CONFIG.MAX_NODES_PER_MAP}. Map is too complex.`
        );
    }

    logger.ingestion(`[CIRCUIT_BREAKER] ✅ Node count OK: ${nodeCount}`);
}

/**
 * Atom Count Gate - Level 3
 * Prevents memory exhaustion from atom accumulation
 */
export function checkAtomCount(atomCount: number): void {
    if (atomCount > CIRCUIT_BREAKER_CONFIG.MAX_PENDING_ATOMS) {
        logger.error('INGESTION', `[CIRCUIT_BREAKER] Too many atoms: ${atomCount} (max: ${CIRCUIT_BREAKER_CONFIG.MAX_PENDING_ATOMS})`);
        throw new CircuitBreakerError(
            'ATOM_COUNT',
            CIRCUIT_BREAKER_CONFIG.MAX_PENDING_ATOMS,
            atomCount,
            `Generated ${atomCount} atoms. Maximum allowed: ${CIRCUIT_BREAKER_CONFIG.MAX_PENDING_ATOMS}. Flush to storage required.`
        );
    }
}

/**
 * Time Budget Tracker - Level 4
 * Monitors ingestion duration and aborts if exceeded
 */
export class TimeoutTracker {
    private startTime: number;
    private readonly timeoutMs: number;

    constructor(timeoutMs: number = CIRCUIT_BREAKER_CONFIG.MAX_INGESTION_TIME_MS) {
        this.startTime = Date.now();
        this.timeoutMs = timeoutMs;
        logger.ingestion(`[CIRCUIT_BREAKER] Timeout tracker started: ${timeoutMs}ms limit`);
    }

    check(operation: string = 'operation'): void {
        const elapsed = Date.now() - this.startTime;

        if (elapsed > this.timeoutMs) {
            logger.error('INGESTION', `[CIRCUIT_BREAKER] Timeout exceeded: ${elapsed}ms > ${this.timeoutMs}ms during ${operation}`);
            throw new CircuitBreakerError(
                'TIMEOUT',
                this.timeoutMs,
                elapsed,
                `Ingestion timeout: ${operation} exceeded ${this.timeoutMs / 1000}s limit. Elapsed: ${(elapsed / 1000).toFixed(1)}s`
            );
        }
    }

    getElapsed(): number {
        return Date.now() - this.startTime;
    }

    getRemaining(): number {
        return Math.max(0, this.timeoutMs - this.getElapsed());
    }
}

/**
 * Comprehensive Pre-Flight Check
 * Runs all gates before starting ingestion
 */
export function runPreFlightChecks(config: {
    docTextLength: number;
    chunkCount?: number;
    estimatedNodes?: number;
}): void {
    logger.ingestion('[CIRCUIT_BREAKER] Running pre-flight checks...');

    try {
        // Gate 1: Document Size
        checkDocumentSize(config.docTextLength);

        // Gate 2: Chunk Count (if available)
        if (config.chunkCount !== undefined) {
            checkChunkCount(config.chunkCount);
        }

        // Gate 3: Token Budget
        checkTokenBudget(config.docTextLength);

        // Gate 4: Node Estimate (if available)
        if (config.estimatedNodes !== undefined) {
            checkNodeCount(config.estimatedNodes);
        }

        logger.ingestion('[CIRCUIT_BREAKER] ✅ All pre-flight checks passed');

    } catch (e) {
        if (e instanceof CircuitBreakerError) {
            logger.error('INGESTION', `[CIRCUIT_BREAKER] Pre-flight FAILED: ${e.level}`);
        }
        throw e;
    }
}

/**
 * Format byte/char size for user-friendly display
 */
function formatSize(chars: number): string {
    if (chars < 1000) return `${chars} chars`;
    if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}K chars`;
    return `${(chars / 1_000_000).toFixed(1)}M chars`;
}

/**
 * Check if error is a circuit breaker trip
 */
export function isCircuitBreakerError(error: unknown): error is CircuitBreakerError {
    return error instanceof CircuitBreakerError;
}

/**
 * Extract user-friendly message from circuit breaker error
 */
export function getCircuitBreakerMessage(error: CircuitBreakerError): string {
    return `⚠️ Processing Limit Exceeded\n\n${error.message}\n\nPlease try:\n• Splitting the document into smaller sections\n• Removing non-essential content\n• Processing one chapter at a time`;
}
