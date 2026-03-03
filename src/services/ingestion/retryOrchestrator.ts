/**
 * Retry Orchestrator — Non-Breakable Ingestion v1.3
 * 
 * Purpose: Event-driven retry system (not time-based loops).
 * 
 * Retry triggers:
 * - Quota restored (external signal)
 * - Manual resume (user click)
 * - Scheduled low-traffic window (e.g., 2AM)
 * 
 * Key Rules:
 * - ONLY retry PAUSED_QUOTA chunks
 * - NEVER retry COMPLETED chunks
 * - NEVER retry FAILED_LOGIC chunks (terminal)
 */

import { getDB } from '../idbService';
import { logger } from '../../utils/logger';
import { markResuming } from './ledgerService';

/**
 * Resume paused ingestions (event-driven, not time-based).
 * 
 * @param docFingerprint - Optional specific document to resume, or undefined for all paused
 */
export async function resumePausedIngestions(docFingerprint?: string): Promise<void> {
    const idb = await getDB();

    // Get all paused ledgers (or specific one)
    let ledgers;
    if (docFingerprint) {
        const ledger = await idb.get('ingestion_ledgers', docFingerprint);
        ledgers = ledger ? [ledger] : [];
    } else {
        const allLedgers = await idb.getAll('ingestion_ledgers');
        ledgers = allLedgers.filter(l =>
            l.status === 'PARTIAL_PAUSED_QUOTA' ||
            l.status === 'PARTIAL_PAUSED_RATE_LIMIT'
        );
    }

    logger.ingestion(`[RETRY_ORCHESTRATOR] Found ${ledgers.length} paused ingestion(s)`);

    for (const ledger of ledgers) {
        try {
            // 🔒 ONLY retry failed_external chunks
            const chunks = await idb.getAllFromIndex('chunks', 'by_doc', ledger.docFingerprint);
            const toRetry = chunks.filter(c =>
                c.status === 'PAUSED_QUOTA' ||
                c.status === 'FAILED_TRANSIENT'
            );

            if (toRetry.length === 0) {
                logger.ingestion(`[RETRY_ORCHESTRATOR] No chunks to retry for ${ledger.docFingerprint}`);
                continue;
            }

            logger.ingestion(`[RETRY_ORCHESTRATOR] Resuming ${toRetry.length} chunks for ${ledger.docFingerprint}`);

            // Mark ledger as resuming
            await markResuming(ledger.docFingerprint);

            // Reset chunk status to PENDING (NOT re-extract, NOT re-process completed)
            for (const chunk of toRetry) {
                chunk.status = 'PENDING';
                chunk.retryCount = (chunk.retryCount || 0) + 1;
                chunk.updatedAt = Date.now();
                await idb.put('chunks', chunk);
            }

            logger.ingestion(`[RETRY_ORCHESTRATOR] ✅ Ready to resume: ${ledger.docFingerprint}`);

            // Note: Actual processing trigger should be handled by caller
            // This service only resets chunk states for retry

        } catch (error) {
            logger.error('INGESTION', `[RETRY_ORCHESTRATOR] Failed to resume ${ledger.docFingerprint}`, error);
        }
    }
}

/**
 * Get list of documents that are paused and ready for retry.
 */
export async function getPausedDocuments(): Promise<Array<{
    docFingerprint: string;
    subject: string;
    pausedReason?: string;
    retryScheduledAt?: number;
    completedChunks: number;
    totalChunks: number;
}>> {
    const idb = await getDB();
    const allLedgers = await idb.getAll('ingestion_ledgers');

    return allLedgers
        .filter(l =>
            l.status === 'PARTIAL_PAUSED_QUOTA' ||
            l.status === 'PARTIAL_PAUSED_RATE_LIMIT'
        )
        .map(l => ({
            docFingerprint: l.docFingerprint,
            subject: l.subject,
            pausedReason: l.pausedReason,
            retryScheduledAt: l.retryScheduledAt,
            completedChunks: l.completedChunks.length,
            totalChunks: l.totalChunks
        }));
}

/**
 * Check if a scheduled retry is due.
 */
export async function checkScheduledRetries(): Promise<void> {
    const idb = await getDB();
    const allLedgers = await idb.getAll('ingestion_ledgers');

    const now = Date.now();
    const dueForRetry = allLedgers.filter(l =>
        (l.status === 'PARTIAL_PAUSED_QUOTA' || l.status === 'PARTIAL_PAUSED_RATE_LIMIT') &&
        l.retryScheduledAt !== undefined &&
        l.retryScheduledAt <= now
    );

    if (dueForRetry.length > 0) {
        logger.ingestion(`[RETRY_ORCHESTRATOR] ${dueForRetry.length} scheduled retries due`);

        for (const ledger of dueForRetry) {
            await resumePausedIngestions(ledger.docFingerprint);
        }
    }
}
