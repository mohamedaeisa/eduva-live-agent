/**
 * Phase 3 R3 v1.1 P2: Simplified Two-Phase Commit
 * 
 * Purpose: Transactional integrity for ingestion with rollback capability
 * 
 * Simplified approach:
 * - Phase 1: Write to staging (IndexedDB temp stores)
 * - Phase 2: Commit to production (move staging → production)
 * - On failure: Rollback (delete staging data)
 */

import { getDB } from '../idbService';
import { logger } from '../../utils/logger';
import { CurriculumMap } from '../../types/ingestion';
import { AtomCore } from '../../types';

export type TransactionStage = 'PENDING' | 'STAGING' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED';

export interface IngestionTransaction {
    txId: string;
    documentId: string;
    stage: TransactionStage;

    // Staged data IDs (for rollback)
    stagedMapId?: string;
    stagedAtomIds: string[];

    // Timestamps
    createdAt: number;
    lastUpdated: number;
    committedAt?: number;

    // Error tracking
    error?: string;
}

/**
 * Transaction Manager
 */
export class TransactionManager {
    private transaction: IngestionTransaction;

    constructor(documentId: string) {
        this.transaction = {
            txId: `tx_${documentId}_${Date.now()}`,
            documentId,
            stage: 'PENDING',
            stagedAtomIds: [],
            createdAt: Date.now(),
            lastUpdated: Date.now()
        };
    }

    /**
     * Start transaction - creates staging record
     */
    async begin(): Promise<void> {
        const db = await getDB();
        (this.transaction as any).lastUpdated = Date.now();
        await (db as any).put('ingestion_transactions', this.transaction);

        logger.ingestion(`[TRANSACTION] Started: ${this.transaction.txId}`);
    }

    /**
     * Stage curriculum map (Phase 1)
     */
    async stageMap(map: CurriculumMap): Promise<void> {
        const db = await getDB();
        const stagingKey = `staging_${map.mapId}`;

        // Write to staging store
        await (db as any).put('staging_maps', { ...map, _stagingKey: stagingKey } as any);

        this.transaction.stagedMapId = stagingKey;
        this.transaction.stage = 'STAGING';
        this.transaction.lastUpdated = Date.now();

        await (db as any).put('ingestion_transactions', this.transaction);
        logger.ingestion(`[TRANSACTION] Staged map: ${map.mapId}`);
    }

    /**
     * Stage atoms (Phase 1)
     */
    async stageAtoms(atoms: AtomCore[]): Promise<void> {
        const db = await getDB();

        // Write all atoms to staging
        const stagingTx = (db as any).transaction('staging_atoms', 'readwrite');
        for (const atom of atoms) {
            await stagingTx.store.put({ ...atom, _stagedAt: Date.now() });
            this.transaction.stagedAtomIds.push(atom.atomId);
        }
        await stagingTx.done;

        this.transaction.lastUpdated = Date.now();
        await (db as any).put('ingestion_transactions', this.transaction);

        logger.ingestion(`[TRANSACTION] Staged ${atoms.length} atoms`);
    }

    /**
     * Commit transaction (Phase 2)
     * Moves staging → production atomically
     */
    async commit(): Promise<void> {
        const db = await getDB();

        try {
            // 1. Move map staging → production
            if (this.transaction.stagedMapId) {
                const stagedMap = await (db as any).get('staging_maps', this.transaction.stagedMapId);
                if (stagedMap) {
                    // Remove staging metadata
                    delete stagedMap._stagingKey;
                    await db.put('curriculum_maps', stagedMap);
                    await (db as any).delete('staging_maps', this.transaction.stagedMapId);
                }
            }

            // 2. Move atoms staging → production
            if (this.transaction.stagedAtomIds.length > 0) {
                const stagingTx = (db as any).transaction('staging_atoms', 'readonly');
                const productionTx = db.transaction('local_atoms', 'readwrite');

                for (const atomId of this.transaction.stagedAtomIds) {
                    const atom = await stagingTx.store.get(atomId);
                    if (atom) {
                        delete atom._stagedAt;
                        await productionTx.store.put(atom);
                    }
                }

                await stagingTx.done;
                await productionTx.done;

                // 3. Clear staging
                const clearTx = (db as any).transaction('staging_atoms', 'readwrite');
                for (const atomId of this.transaction.stagedAtomIds) {
                    await clearTx.store.delete(atomId);
                }
                await clearTx.done;
            }

            // 4. Mark committed
            this.transaction.stage = 'COMMITTED';
            this.transaction.committedAt = Date.now();
            this.transaction.lastUpdated = Date.now();

            await (db as any).put('ingestion_transactions', this.transaction);

            logger.ingestion(`[TRANSACTION] ✅ Committed: ${this.transaction.txId}`);

        } catch (e: any) {
            logger.error('INGESTION', `[TRANSACTION] Commit failed:`, e);
            await this.rollback(e.message);
            throw e;
        }
    }

    /**
     * Rollback transaction
     * Deletes all staged data
     */
    async rollback(reason?: string): Promise<void> {
        const db = await getDB();

        try {
            // 1. Delete staged map
            if (this.transaction.stagedMapId) {
                await (db as any).delete('staging_maps', this.transaction.stagedMapId);
            }

            // 2. Delete staged atoms
            if (this.transaction.stagedAtomIds.length > 0) {
                const tx = (db as any).transaction('staging_atoms', 'readwrite');
                for (const atomId of this.transaction.stagedAtomIds) {
                    await tx.store.delete(atomId);
                }
                await tx.done;
            }

            // 3. Mark rolled back
            this.transaction.stage = 'ROLLED_BACK';
            this.transaction.error = reason;
            this.transaction.lastUpdated = Date.now();

            await (db as any).put('ingestion_transactions', this.transaction);

            logger.warn('INGESTION', `[TRANSACTION] ⚠️ Rolled back: ${this.transaction.txId} - ${reason || 'Unknown error'}`);

        } catch (e: any) {
            logger.error('INGESTION', `[TRANSACTION] Rollback failed:`, e);
            this.transaction.stage = 'FAILED';
            this.transaction.error = `Rollback failed: ${e.message}`;
            await (db as any).put('ingestion_transactions', this.transaction);
        }
    }

    /**
     * Get transaction status
     */
    getStatus(): IngestionTransaction {
        return { ...this.transaction };
    }
}

/**
 * Clean up old transactions (maintenance)
 */
export async function cleanupOldTransactions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const db = await getDB();
    const cutoff = Date.now() - maxAgeMs;

    const allTx = await (db as any).getAll('ingestion_transactions');
    const oldTx = allTx.filter((tx: any) => tx.lastUpdated < cutoff);

    for (const tx of oldTx) {
        await (db as any).delete('ingestion_transactions', (tx as any).txId);
    }

    logger.ingestion(`[TRANSACTION] Cleaned up ${oldTx.length} old transactions`);
    return oldTx.length;
}
