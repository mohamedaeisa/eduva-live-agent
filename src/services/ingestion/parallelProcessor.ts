/**
 * Phase 3 R3 v1.1 P2: Parallel Batch Processor
 * 
 * Purpose: Process atom batches in parallel with rate limiting
 * to prevent API quota exhaustion while maximizing throughput.
 * 
 * Uses simple Promise-based concurrency control (no external deps)
 */

import { logger } from '../../utils/logger';

export interface ParallelConfig {
    maxConcurrent: number;      // Max parallel operations
    rateLimit?: {
        maxPerSecond: number;      // Max calls per second
        delayMs: number;           // Delay between batches
    };
    onProgress?: (completed: number, total: number) => void;
}

const DEFAULT_CONFIG: ParallelConfig = {
    maxConcurrent: 3,
    rateLimit: {
        maxPerSecond: 5,
        delayMs: 200
    }
};

/**
 * Execute tasks in parallel with concurrency and rate limiting
 */
export async function executeParallel<T, R>(
    tasks: T[],
    executor: (task: T, index: number) => Promise<R>,
    config: Partial<ParallelConfig> = {}
): Promise<R[]> {

    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const results: R[] = [];
    const errors: { index: number; error: any }[] = [];

    let completed = 0;
    let inProgress = 0;
    let nextIndex = 0;

    logger.ingestion(`[PARALLEL] Starting ${tasks.length} tasks (concurrency: ${finalConfig.maxConcurrent})`);

    return new Promise((resolve, reject) => {
        const runNext = async () => {
            // All tasks launched
            if (nextIndex >= tasks.length) {
                // Wait for in-progress to complete
                if (inProgress === 0) {
                    if (errors.length > 0) {
                        logger.warn('INGESTION', `[PARALLEL] Completed with ${errors.length} errors`);
                    } else {
                        logger.ingestion(`[PARALLEL] ✅ All ${tasks.length} tasks completed successfully`);
                    }
                    resolve(results);
                }
                return;
            }

            // Check concurrency limit
            if (inProgress >= finalConfig.maxConcurrent) {
                return;
            }

            const currentIndex = nextIndex++;
            const task = tasks[currentIndex];

            inProgress++;

            try {
                // Rate limiting delay
                if (finalConfig.rateLimit && currentIndex > 0) {
                    await new Promise(r => setTimeout(r, finalConfig.rateLimit!.delayMs));
                }

                const result = await executor(task, currentIndex);
                results[currentIndex] = result;

                completed++;
                inProgress--;

                // Progress callback
                if (finalConfig.onProgress) {
                    finalConfig.onProgress(completed, tasks.length);
                }

                // Launch next task
                runNext();

            } catch (error) {
                logger.error('INGESTION', `[PARALLEL] Task ${currentIndex} failed:`, error);
                errors.push({ index: currentIndex, error });

                completed++;
                inProgress--;

                // Continue despite error
                runNext();
            }
        };

        // Kickstart initial batch
        const initialBatch = Math.min(finalConfig.maxConcurrent, tasks.length);
        for (let i = 0; i < initialBatch; i++) {
            runNext();
        }
    });
}

/**
 * Batch processor with progress tracking
 */
export class ParallelBatchProcessor<T, R> {
    private config: ParallelConfig;
    private startTime: number = 0;

    constructor(config: Partial<ParallelConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async process(
        items: T[],
        executor: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        this.startTime = Date.now();

        const results = await executeParallel(items, executor, {
            ...this.config,
            onProgress: (completed, total) => {
                const percent = ((completed / total) * 100).toFixed(1);
                const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
                logger.ingestion(`[PARALLEL] Progress: ${completed}/${total} (${percent}%) - ${elapsed}s elapsed`);

                if (this.config.onProgress) {
                    this.config.onProgress(completed, total);
                }
            }
        });

        const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
        const avgTime = (parseFloat(totalTime) / items.length).toFixed(2);

        logger.ingestion(`[PARALLEL] Completed in ${totalTime}s (avg: ${avgTime}s per task)`);

        return results;
    }

    updateConfig(config: Partial<ParallelConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
