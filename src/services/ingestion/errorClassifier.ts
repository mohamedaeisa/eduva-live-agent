/**
 * Error Classifier — Non-Breakable Ingestion v1.3
 * 
 * Purpose: Classify errors by type to enable appropriate recovery strategies.
 * External failures (quota, rate limit) → PAUSED (retryable later)
 * Logic failures (JSON parse) → TERMINAL (needs investigation)
 */

export enum FailureType {
    EXTERNAL_QUOTA = 'EXTERNAL_QUOTA',         // Retry later (hours)
    EXTERNAL_RATE_LIMIT = 'EXTERNAL_RATE',     // Retry soon (seconds)
    TRANSIENT_TIMEOUT = 'TRANSIENT',           // Retry now (immediate)
    LOGIC_ERROR = 'LOGIC_ERROR',               // 🔒 TERMINAL - never retry
    FATAL = 'FATAL'                            // Cannot recover
}

/**
 * Classify an error to determine recovery strategy.
 * 
 * @param error - The error to classify
 * @returns FailureType indicating recovery strategy
 */
export function classifyError(error: Error | unknown): FailureType {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // External quota exhaustion (Gemini API quota)
    if (message.includes('quota_exhausted') ||
        message.includes('quota exceeded') ||
        message.includes('resource_exhausted')) {
        return FailureType.EXTERNAL_QUOTA;
    }

    // External rate limiting
    if (message.includes('rate_limit') ||
        message.includes('too_many_requests') ||
        message.includes('429')) {
        return FailureType.EXTERNAL_RATE_LIMIT;
    }

    // Transient timeouts (retryable immediately)
    if (message.includes('timeout') ||
        message.includes('deadline_exceeded') ||
        message.includes('ai_timeout')) {
        return FailureType.TRANSIENT_TIMEOUT;
    }

    // 🔒 Logic errors are TERMINAL - never retry automatically
    if (message.includes('invalid json') ||
        message.includes('malformed') ||
        message.includes('json parse') ||
        message.includes('unexpected token') ||
        message.includes('syntax error')) {
        return FailureType.LOGIC_ERROR;
    }

    // Default: FATAL (unknown error type)
    return FailureType.FATAL;
}

/**
 * Check if a failure type is retryable.
 */
export function isRetryable(failureType: FailureType): boolean {
    return failureType === FailureType.EXTERNAL_QUOTA ||
        failureType === FailureType.EXTERNAL_RATE_LIMIT ||
        failureType === FailureType.TRANSIENT_TIMEOUT;
}

/**
 * Check if a failure is terminal (should never be retried).
 */
export function isTerminal(failureType: FailureType): boolean {
    return failureType === FailureType.LOGIC_ERROR ||
        failureType === FailureType.FATAL;
}

/**
 * Get retry delay in milliseconds based on failure type.
 */
export function getRetryDelay(failureType: FailureType): number {
    switch (failureType) {
        case FailureType.EXTERNAL_QUOTA:
            return 60 * 60 * 1000; // 1 hour
        case FailureType.EXTERNAL_RATE_LIMIT:
            return 30 * 1000; // 30 seconds
        case FailureType.TRANSIENT_TIMEOUT:
            return 5 * 1000; // 5 seconds
        default:
            return 0; // No retry
    }
}
