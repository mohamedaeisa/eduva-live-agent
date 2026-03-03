/**
 * Ledger Service — Non-Breakable Ingestion v1.3
 * 
 * Purpose: Manage IngestionLedger lifecycle with HARD completion semantics.
 * 
 * Key Rules:
 * - COMPLETED ⇔ completedChunks.length === totalChunks
 * - safeToConsume = (status === 'COMPLETED')
 * - Ledger updates are transactional with chunk updates
 */

import { IngestionLedger, IngestionLedgerStatus } from '../../types/ingestion';
import { getDB } from '../idbService';
import { logger } from '../../utils/logger';

/**
 * Create a new ingestion ledger for a document.
 */
export async function createLedger(params: {
    docFingerprint: string;
    subject: string;
    language: string;
    userId: string;
}): Promise<IngestionLedger> {
    const ledger: IngestionLedger = {
        docFingerprint: params.docFingerprint,
        subject: params.subject,
        language: params.language,
        userId: params.userId,

        // Will be set after PDF extraction
        totalChunks: 0,
        pdfTextCacheKey: `pdf_text_${params.docFingerprint}`,

        // Initially empty
        completedChunks: [],
        failedExternalChunks: [],
        failedLogicChunks: [],

        // Initial status
        status: 'CREATED',
        safeToConsume: false,

        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    const idb = await getDB();
    await idb.put('ingestion_ledgers', ledger);

    logger.ingestion(`[LEDGER] Created for ${params.docFingerprint}`);
    return ledger;
}

/**
 * Mark PDF as extracted and set totalChunks (immutable after this).
 */
export async function markPdfExtracted(
    docFingerprint: string,
    totalChunks: number
): Promise<void> {
    const idb = await getDB();
    const ledger = await idb.get('ingestion_ledgers', docFingerprint);

    if (!ledger) throw new Error(`Ledger not found for ${docFingerprint}`);

    ledger.totalChunks = totalChunks;
    ledger.status = 'PDF_EXTRACTED';
    ledger.updatedAt = Date.now();

    await idb.put('ingestion_ledgers', ledger);
    logger.info('INGESTION', `[LEDGER] PDF extracted: ${totalChunks} chunks (immutable)`, { docFingerprint });
}

/**
 * Update ledger from current chunk states.
 * 
 * 🔒 HARD COMPLETION CHECK:
 * - COMPLETED only if all chunks done
 * - FAILED_TERMINAL if any logic failure
 * - PARTIAL_PAUSED if external failure
 */
export async function updateLedgerFromChunks(docFingerprint: string): Promise<IngestionLedger> {
    const idb = await getDB();
    const chunks = await idb.getAllFromIndex('chunks', 'by_doc', docFingerprint);
    const ledger = await idb.get('ingestion_ledgers', docFingerprint);

    if (!ledger) throw new Error(`Ledger not found for ${docFingerprint}`);

    // Extract chunk indices by status
    ledger.completedChunks = chunks
        .filter(c => c.status === 'COMPLETED')
        .map(c => c.batchIndex);

    ledger.failedExternalChunks = chunks
        .filter(c => c.status === 'PAUSED_QUOTA' || c.status === 'FAILED_TRANSIENT')
        .map(c => c.batchIndex);

    ledger.failedLogicChunks = chunks
        .filter(c => c.status === 'FAILED_LOGIC')
        .map(c => c.batchIndex);

    logger.debug('INGESTION', `[LEDGER] Chunk states`, {
        completed: ledger.completedChunks.length,
        failedExternal: ledger.failedExternalChunks.length,
        failedLogic: ledger.failedLogicChunks.length,
        total: ledger.totalChunks
    });

    // 🔒 HARD COMPLETION CHECK
    const allDone = ledger.completedChunks.length === ledger.totalChunks;
    const hasLogicFailure = ledger.failedLogicChunks.length > 0;
    const hasExternalPause = ledger.failedExternalChunks.length > 0;

    if (allDone) {
        ledger.status = 'COMPLETED';
        ledger.safeToConsume = true;
        logger.info('INGESTION', `[LEDGER] ✅ COMPLETED: ${ledger.completedChunks.length}/${ledger.totalChunks}`);
    } else if (hasLogicFailure) {
        ledger.status = 'FAILED_TERMINAL';
        ledger.safeToConsume = false;
        logger.error('INGESTION', `[LEDGER] FAILED_TERMINAL: ${ledger.failedLogicChunks.length} logic failures`, {
            failedChunks: ledger.failedLogicChunks
        });
    } else if (hasExternalPause) {
        ledger.status = 'PARTIAL_PAUSED_QUOTA';
        ledger.safeToConsume = false;
        logger.warn('INGESTION', `[LEDGER] PAUSED: ${ledger.failedExternalChunks.length} chunks waiting`, {
            pausedChunks: ledger.failedExternalChunks
        });
    } else {
        ledger.status = 'CHUNK_PROCESSING';
        ledger.safeToConsume = false;
        logger.debug('INGESTION', `[LEDGER] Processing: ${ledger.completedChunks.length}/${ledger.totalChunks}`);
    }

    ledger.updatedAt = Date.now();
    await idb.put('ingestion_ledgers', ledger);

    return ledger;
}

/**
 * Get ledger for a document.
 */
export async function getLedger(docFingerprint: string): Promise<IngestionLedger | undefined> {
    const idb = await getDB();
    return await idb.get('ingestion_ledgers', docFingerprint);
}

/**
 * Mark ledger as resuming (before processing paused chunks).
 */
export async function markResuming(docFingerprint: string): Promise<void> {
    const idb = await getDB();
    const ledger = await idb.get('ingestion_ledgers', docFingerprint);

    if (!ledger) throw new Error(`Ledger not found for ${docFingerprint}`);

    ledger.status = 'RESUMING';
    ledger.updatedAt = Date.now();

    await idb.put('ingestion_ledgers', ledger);
    logger.info('INGESTION', `[LEDGER] Resuming from paused state`, { docFingerprint });
}

/**
 * Set pause reason and schedule retry.
 */
export async function setPaused(
    docFingerprint: string,
    reason: string,
    retryScheduledAt?: number
): Promise<void> {
    const idb = await getDB();
    const ledger = await idb.get('ingestion_ledgers', docFingerprint);

    if (!ledger) throw new Error(`Ledger not found for ${docFingerprint}`);

    ledger.pausedReason = reason;
    ledger.retryScheduledAt = retryScheduledAt;
    ledger.updatedAt = Date.now();

    await idb.put('ingestion_ledgers', ledger);
    logger.warn('INGESTION', `[LEDGER] Paused: ${reason}`, { retryScheduledAt, docFingerprint });
}
