/**
 * Ingestion Control Registry
 * Simple global state to track and signal cancellation for active ingestion sessions.
 */

const cancelledIngestions = new Set<string>();

/**
 * Signals that an ingestion session should be aborted.
 * @param contentId The document fingerprint/content ID
 */
export function cancelIngestion(contentId: string) {
    console.log(`[INGESTION_CONTROL] Signalling cancellation for: ${contentId}`);
    cancelledIngestions.add(contentId);
}

/**
 * Checks if an ingestion session has been cancelled.
 * @param contentId The document fingerprint/content ID
 * @returns true if the session should be aborted
 */
export function isIngestionCancelled(contentId: string): boolean {
    return cancelledIngestions.has(contentId);
}

/**
 * Clears the cancellation signal (used when starting a fresh session).
 * @param contentId The document fingerprint/content ID
 */
export function clearCancellation(contentId: string) {
    if (cancelledIngestions.has(contentId)) {
        console.log(`[INGESTION_CONTROL] Clearing cancellation state for: ${contentId}`);
        cancelledIngestions.delete(contentId);
    }
}
