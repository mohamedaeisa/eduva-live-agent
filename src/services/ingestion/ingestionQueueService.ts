import { openDB } from 'idb';
import { IngestionConfig, IngestionJob, IngestionStage } from '../../types/ingestion';
import { sha256 } from '../../utils/hashUtils';
import { logger } from '../../utils/logger';

// Job Store Definition (Should be migrated to main storageService eventually)
const DB_NAME = 'eduva-v5-jobs';
const DB_VERSION = 1;
const STORE_NAME = 'ingestion_jobs';

async function getJobDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
            }
        }
    });
}

/**
 * Creates or Resumes an Ingestion Job.
 * If a job matching the config exists and is not complete, it returns it.
 */
export async function getOrCreateJob(config: IngestionConfig): Promise<IngestionJob> {
    const db = await getJobDB();
    const jobId = await sha256(`${config.documentId}:${config.subject}:${config.studentProfileId}`);

    const existing = await db.get(STORE_NAME, jobId) as IngestionJob;

    // RESUME CONDITION: Job exists and is not complete
    // We also check "freshness" - if job is > 24h old, we might reset it (configurable)
    if (existing && existing.stage !== IngestionStage.COMPLETE) {
        logger.ingestion(`[INGESTION_QUEUE] Resuming existing job ${jobId.substring(0, 8)} at stage ${existing.stage}`);
        return existing;
    }

    // CREATE NEW
    const newJob: IngestionJob = {
        jobId,
        config,
        stage: IngestionStage.INIT,
        completedBatchIndices: [],
        totalBatches: 0,
        lastUpdated: Date.now()
    };

    await db.put(STORE_NAME, newJob);
    logger.ingestion(`[INGESTION_QUEUE] Created new job ${jobId.substring(0, 8)}`);
    return newJob;
}

export async function updateJobStage(
    jobId: string,
    stage: IngestionStage,
    data?: Partial<IngestionJob>
) {
    const db = await getJobDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const job = await tx.store.get(jobId);

    if (!job) {
        logger.error('INGESTION', `[INGESTION_QUEUE] Cannot update non-existent job ${jobId}`);
        return;
    }

    const updated = {
        ...job,
        ...data,
        stage,
        lastUpdated: Date.now()
    };

    await tx.store.put(updated);
    await tx.done;

    // Log significance
    if (stage !== job.stage) {
        logger.ingestion(`[INGESTION_QUEUE] Job ${jobId.substring(0, 8)} -> ${stage}`);
    }
}

export async function markBatchComplete(jobId: string, batchIndex: number) {
    const db = await getJobDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const job = await tx.store.get(jobId);

    if (job) {
        if (!job.completedBatchIndices.includes(batchIndex)) {
            job.completedBatchIndices.push(batchIndex);
            job.lastUpdated = Date.now();
            await tx.store.put(job);
            logger.ingestion(`[INGESTION_QUEUE] Job ${jobId.substring(0, 8)}: Batch ${batchIndex} Saved.`);
        }
    }
    await tx.done;
}

export async function completeJob(jobId: string) {
    await updateJobStage(jobId, IngestionStage.COMPLETE);
    // Optional: Delete job after X days, or keep as history
    logger.ingestion(`[INGESTION_QUEUE] Job ${jobId.substring(0, 8)} FINISHED.`);
}
