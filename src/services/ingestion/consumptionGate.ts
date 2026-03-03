/**
 * Consumption Gate — Non-Breakable Ingestion v1.3
 * 
 * Purpose: Block consumers (Quiz, Notes, Radar) from consuming partial ingestion.
 * This prevents generic fallback questions when extraction is incomplete.
 * 
 * Key Rule: Consumers MUST check canConsume() before accessing atoms.
 */

import { getDB } from '../idbService';
import { logger } from '../../utils/logger';

export interface ConsumptionDecision {
    allowed: boolean;
    reason?: string;
    completionPercent: number;
    retryScheduledAt?: number;
    status?: string;
}

/**
 * Check if a document's ingestion is safe to consume.
 * 
 * Returns allowed=true ONLY when ledger.safeToConsume === true.
 * 
 * @param docFingerprint - Document fingerprint to check
 * @returns ConsumptionDecision indicating if consumption is allowed
 */
export async function canConsume(docFingerprint: string): Promise<ConsumptionDecision> {
    const idb = await getDB();
    const ledger = await idb.get('ingestion_ledgers', docFingerprint);

    if (!ledger) {
        logger.warn('INGESTION', `[GATE] No ledger found`, { docFingerprint });
        return {
            allowed: false,
            reason: 'No ingestion record found',
            completionPercent: 0
        };
    }

    // ✅ ONLY allow if safeToConsume is true
    if (ledger.safeToConsume) {
        return {
            allowed: true,
            completionPercent: 100,
            status: ledger.status
        };
    }

    // Calculate completion percentage
    const percent = ledger.totalChunks > 0
        ? Math.round((ledger.completedChunks.length / ledger.totalChunks) * 100)
        : 0;

    // Block with informative reason
    let reason = `Ingestion ${ledger.status.toLowerCase().replace(/_/g, ' ')}`;

    if (ledger.status === 'PARTIAL_PAUSED_QUOTA') {
        reason = 'AI quota exhausted. Resume to continue.';
    } else if (ledger.status === 'FAILED_TERMINAL') {
        reason = 'Ingestion failed. Please re-upload document.';
    } else if (ledger.status === 'CHUNK_PROCESSING') {
        reason = `Processing chunks (${percent}% complete)`;
    }

    logger.ingestion(`[CONSUMPTION_GATE] ❌ Blocked: ${reason}`);

    return {
        allowed: false,
        reason,
        completionPercent: percent,
        retryScheduledAt: ledger.retryScheduledAt,
        status: ledger.status
    };
}

/**
 * Block with UI message if consumption not allowed.
 * Returns null if allowed, or blocking message if not.
 */
export async function getBlockingMessage(docFingerprint: string): Promise<string | null> {
    const decision = await canConsume(docFingerprint);

    if (decision.allowed) {
        return null;
    }

    let message = `⚠️ Content not ready\n\n${decision.reason}\n\nProgress: ${decision.completionPercent}%`;

    if (decision.retryScheduledAt) {
        const retryTime = new Date(decision.retryScheduledAt).toLocaleTimeString();
        message += `\n\nAuto-resume scheduled: ${retryTime}`;
    }

    return message;
}
