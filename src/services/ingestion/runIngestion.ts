import { IngestionConfig, ExtractionMode, CurriculumMap, IngestionLedger } from '../../types/ingestion';
import { validateIngestionConfig } from './validators';
import { runPageLevelStrategy } from './strategies/pageLevel/runPageLevelStrategy';
import { runCurriculumStrategy } from './strategies/curriculum/runCurriculumStrategy';
import { AtomCore, Plan } from '../../types';
import { logger } from '../../utils/logger';
import { monetizationClient } from '../monetization/client';
import { getPdfPageCount } from '../pdfUtils';
import { getDB } from '../idbService';
import { db as firestore } from '../firebaseConfig';

export type IngestionResult = AtomCore[] | CurriculumMap;

export async function runIngestion(config: IngestionConfig): Promise<IngestionResult> {
    logger.ingestion(`[ROUTER] Ingestion requested: Mode=${config.extractionMode}, Doc=${config.documentId}, Subject=${config.subject}, Lang=${config.language}`);
    console.log(`[INGESTION_DEBUG] Router Config:`, config);

    // 1. FAIL FAST: Schema Validation
    try {
        validateIngestionConfig(config);
    } catch (valErr: any) {
        logger.error('INGESTION', `[ROUTER] Validation Failed: ${valErr.message}`);
        throw valErr;
    }

    const idb = await getDB();

    // --- MONETIZATION: QUOTA & PAGE LIMIT CHECKS ---
    try {
        const existingLedger = await idb.get('ingestion_ledgers', config.documentId);
        if (existingLedger?.status === 'COMPLETED') {
            console.log(`[LIB_MONETIZATION] [INGESTION] Document already completed (${config.documentId}). Skipping limit checks.`);
            // Proceed to hydration/Global Reuse logic
        } else {
            console.log(`[LIB_MONETIZATION] [INGESTION] Checking limits for ${config.documentId}...`);

            // A. Quota Check (Trained Material)
            const qStatus = await monetizationClient.checkEntitlement('trainedmaterial', true);
            console.log(`[LIB_MONETIZATION] [INGESTION] Quota Response for 'trainedmaterial':`, qStatus);

            if (!qStatus.allowed) {
                console.log(`[LIB_MONETIZATION] [INGESTION] ❌ Quota Exceeded. Reason: ${qStatus.reason}`);

                // Fetch usage for detailed message
                let detailedReason = `Quota Exceeded: ${qStatus.reason || 'You have reached your monthly limit.'}`;
                try {
                    const [usage, plans] = await Promise.all([
                        monetizationClient.getUsage(),
                        monetizationClient.getPlans()
                    ]);

                    // Get plan limit
                    const cachedProfile = localStorage.getItem('user_profile_' + config.studentProfileId);
                    let planId = 'FREE';
                    if (cachedProfile) {
                        const profile = JSON.parse(cachedProfile);
                        planId = profile?.plan?.id || 'FREE';
                    }
                    const plan = plans.find(p => p.id === planId);
                    const limit = plan?.limits?.trainedmaterial || 0;
                    const used = usage.trainedMaterialUsed || 0;

                    detailedReason = `QUOTA_EXCEEDED:${used}:${limit}`;
                } catch (prefErr) {
                    console.warn("[LIB_MONETIZATION] Failed to fetch detailed usage for error message", prefErr);
                }

                await idb.put('ingestion_ledgers', {
                    docFingerprint: config.documentId,
                    subject: config.subject,
                    language: config.language,
                    userId: config.studentProfileId || 'unknown',
                    totalChunks: 0,
                    completedChunks: [],
                    failedExternalChunks: [],
                    failedLogicChunks: [],
                    pdfTextCacheKey: config.documentId,
                    status: 'FAILED_LIMIT',
                    pausedReason: detailedReason,
                    safeToConsume: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
                throw new Error(qStatus.reason || 'quota_exceeded');
            }

            // B. Page Limit Check (PDFs only)
            const allSources = await idb.getAll('training_sources');
            const source = allSources.find(s => s.fileHash === config.documentId);

            if (source?.fileName.toLowerCase().endsWith('.pdf') && source.data) {
                // Fetch Plan Limits
                let pageLimit = 15; // Default fallback
                try {
                    // Use localStorage cache as primary source for plan ID to avoid IDB/Firestore overhead
                    const cachedProfile = localStorage.getItem('user_profile_' + config.studentProfileId);
                    let planId = 'FREE';

                    if (cachedProfile) {
                        const profile = JSON.parse(cachedProfile);
                        planId = profile?.plan?.id || 'FREE';
                    }

                    const planDoc = await firestore?.collection('plans').doc(planId).get();
                    if (planDoc?.exists) {
                        pageLimit = (planDoc.data() as Plan).limits?.pageLimit || 15;
                    }
                } catch (pErr) {
                    console.warn("[LIB_MONETIZATION] [INGESTION] Failed to fetch precise page limit, using default.", pErr);
                }

                if (pageLimit !== -1) {
                    const pageCount = await getPdfPageCount(source.data);
                    console.log(`[LIB_MONETIZATION] [INGESTION] PDF detected. Page Count: ${pageCount}, Limit: ${pageLimit}`);

                    if (pageCount > pageLimit) {
                        console.log(`[LIB_MONETIZATION] [INGESTION] ❌ Page Limit Exceeded.`);

                        await idb.put('ingestion_ledgers', {
                            docFingerprint: config.documentId,
                            subject: config.subject,
                            language: config.language,
                            userId: config.studentProfileId || 'unknown',
                            totalChunks: 0,
                            completedChunks: [],
                            failedExternalChunks: [],
                            failedLogicChunks: [],
                            pdfTextCacheKey: config.documentId,
                            status: 'FAILED_LIMIT',
                            pausedReason: `PAGE_LIMIT_EXCEEDED:${pageCount}:${pageLimit}`,
                            safeToConsume: false,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });
                        throw new Error('page_limit_exceeded');
                    }
                }
            }
        }
    } catch (monErr: any) {
        // Re-verify if we just wrote a FAILED_LIMIT ledger
        const checkLedger = await idb.get('ingestion_ledgers', config.documentId);
        if (checkLedger?.status === 'FAILED_LIMIT') {
            console.error("[LIB_MONETIZATION] [INGESTION] Blocking due to limit error:", monErr.message);
            throw monErr;
        }

        // Fallback catch-all for recognized strings
        if (monErr.message === 'quota_exceeded' || monErr.message === 'page_limit_exceeded') {
            throw monErr;
        }

        console.warn("[LIB_MONETIZATION] [INGESTION] Non-blocking check error (continuing):", monErr);
    }

    // --- INITIALIZE/RESET LEDGER FOR NEW RUN ---
    // v1.3: ALWAYS ensure a ledger record exists so UI can authoritatively track success/success-based-quotas.
    try {
        const existingLedger = await idb.get('ingestion_ledgers', config.documentId);

        const now = Date.now();
        const baseLedger: IngestionLedger = existingLedger || {
            docFingerprint: config.documentId,
            subject: config.subject,
            language: config.language,
            userId: config.studentProfileId || 'unknown',
            totalChunks: 0,
            completedChunks: [],
            failedExternalChunks: [],
            failedLogicChunks: [],
            pdfTextCacheKey: config.documentId,
            createdAt: now,
            updatedAt: now,
            status: 'RESUMING',
            safeToConsume: false
        };

        await idb.put('ingestion_ledgers', {
            ...baseLedger,
            status: 'RESUMING',
            pausedReason: undefined, // CLEAR OLD ERRORS
            updatedAt: now
        });

        if (!existingLedger) {
            console.log(`[INGESTION_DEBUG] Initialized NEW ledger record for ${config.documentId}`);
        } else {
            console.log(`[INGESTION_DEBUG] Reset ledger status to RESUMING for ${config.documentId}`);
        }
    } catch (resetErr) {
        console.warn("[INGESTION] Failed to manage ledger record:", resetErr);
    }

    // v1.3 PILLAR 1: GLOBAL-FIRST GATE (Crowd-Sourced Ingestion)
    // Check if a verified map & atom set already exists for this document fingerprint.
    try {
        const { checkGlobalVerifiedPackage } = await import('../globalSharingService');
        const globalPkg = await checkGlobalVerifiedPackage(config.documentId); // documentId IS the fingerprint in our architecture

        if (globalPkg) {
            logger.ingestion(`[GLOBAL_REUSE] 🌍 Verified Global Package Found for ${config.documentId}`);
            logger.ingestion(`   -> Atoms: ${globalPkg.atoms.length}`);
            console.log(`[LIB_MONETIZATION] [GLOBAL_REUSE] Found verified package. Skipping AI extraction.`);

            // A. Hydrate Local Stores
            const { getDB } = await import('../idbService');
            const { saveAtoms } = await import('../storageService');
            const db = await getDB();

            // SIMULATE PROGRESS FOR UI (Quick but visible)
            // Create fake chunks to show progress animation
            const atomsPerChunk = Math.ceil(globalPkg.atoms.length / 2) || 1;
            const simulatedChunks = 2;

            for (let i = 0; i < simulatedChunks; i++) {
                const chunkId = `${config.documentId}_hydrate_${i}`;
                const chunkAtoms = globalPkg.atoms.slice(i * atomsPerChunk, (i + 1) * atomsPerChunk);

                // Write "PROCESSING" state
                await db.put('chunks', {
                    id: chunkId,
                    docFingerprint: config.documentId,
                    batchIndex: i,
                    pageStart: i * 8 + 1,
                    pageEnd: (i + 1) * 8,
                    status: 'PROCESSING',
                    atomCount: chunkAtoms.length,
                    retryCount: 0,
                    updatedAt: Date.now(),
                    startedAt: Date.now()
                });

                // Quick delay for UI to register (50ms per chunk = 100ms total)
                await new Promise(r => setTimeout(r, 50));

                // Mark as COMPLETED
                await db.put('chunks', {
                    id: chunkId,
                    docFingerprint: config.documentId,
                    batchIndex: i,
                    pageStart: i * 8 + 1,
                    pageEnd: (i + 1) * 8,
                    status: 'COMPLETED',
                    atomCount: chunkAtoms.length,
                    retryCount: 0,
                    updatedAt: Date.now()
                });
            }

            // 1. Map (Optional for Page-Level)
            if (globalPkg.map) {
                await db.put('curriculum_maps', globalPkg.map);
            }

            // 2. Get training source for metadata
            const allSources = await db.getAll('training_sources');
            const source = allSources.find(s => s.fileHash === config.documentId);

            // 3. Atoms - Enrich with userId and source metadata so Knowledge Matrix can find them
            // Enrich atoms with source metadata and Ensure Indexing Key
            const enrichedAtoms = globalPkg.atoms.map(a => ({
                ...a,
                userId: config.studentProfileId,
                sourceFileName: source?.fileName,
                educationSystem: source?.educationSystem,
                grade: source?.grade,
                metadata: {
                    ...a.metadata,
                    sourceDocumentId: (source as any).fileHash || (a as any).originDocFingerprint // Critical for local_atoms 'by_content' index
                }
            }));

            // Save to Local DB
            await saveAtoms(enrichedAtoms as any, 'local_atoms');

            // 4. Mark Source as Completed (Unlock UI)
            // Use direct db.put() instead of transaction for reliability
            logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Starting training source status update...`);
            logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Looking for source with fileHash: ${config.documentId}`);
            logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Found ${allSources.length} total training sources in DB`);

            try {
                if (source) {
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] ✓ Found matching source:`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - ID: ${source.id}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Current Status: ${source.status}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Current Progress: ${source.progress}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - FileName: ${source.fileName}`);

                    // Update fields
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Updating fields...`);
                    source.status = 'Completed';
                    source.progress = 100;
                    source.updatedAt = Date.now();

                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] New values set:`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Status: ${source.status}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Progress: ${source.progress}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - UpdatedAt: ${source.updatedAt}`);

                    // Direct put - guaranteed to commit
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Writing to database...`);
                    await db.put('training_sources', source);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] ✓ db.put() completed successfully`);

                    // Verify the write
                    const verifySource = await db.get('training_sources', source.id);
                    if (verifySource) {
                        logger.ingestion(`[GLOBAL_REUSE] [DEBUG] ✓ Verification read successful:`);
                        logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Verified Status: ${verifySource.status}`);
                        logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   - Verified Progress: ${verifySource.progress}`);
                    } else {
                        logger.ingestion(`[GLOBAL_REUSE] [ERROR] ✗ Verification read failed - record not found!`);
                    }

                    logger.ingestion(`[GLOBAL_REUSE] ✅ Updated source status to Completed: ${source.fileName} (ID: ${source.id})`);

                    // Sync to Firestore for multi-device access
                    try {
                        const { db: firestore } = await import('../firebaseConfig');
                        if (firestore) {
                            const trainingRef = firestore.collection('training_sources').doc(source.id);
                            await trainingRef.set({
                                studentId: config.studentProfileId,
                                fileHash: config.documentId,
                                fileName: source.fileName,
                                subject: config.subject,
                                grade: source.grade || 'Unknown',
                                educationSystem: source.educationSystem || 'Unknown',
                                status: 'Completed',
                                progress: 100,
                                createdAt: source.createdAt,
                                updatedAt: Date.now()
                            }, { merge: true });
                            logger.ingestion(`[GLOBAL_REUSE] ✅ Synced training status to Firestore`);
                        }
                    } catch (firestoreErr) {
                        logger.ingestion(`[GLOBAL_REUSE] [WARNING] Failed to sync to Firestore: ${firestoreErr}`);
                    }
                } else {
                    logger.ingestion(`[GLOBAL_REUSE] [ERROR] ✗ No training source found with fileHash: ${config.documentId}`);
                    logger.ingestion(`[GLOBAL_REUSE] [DEBUG] Available fileHashes in DB:`);
                    allSources.forEach((s, idx) => {
                        logger.ingestion(`[GLOBAL_REUSE] [DEBUG]   ${idx + 1}. ${s.fileHash} (${s.fileName})`);
                    });
                }
            } catch (err) {
                logger.ingestion(`[GLOBAL_REUSE] [ERROR] Failed to update source status: ${err}`);
                console.error('[GLOBAL_REUSE] Full error:', err);
            }

            // 4. Update Ledger to COMPLETED
            await db.put('ingestion_ledgers', {
                docFingerprint: config.documentId,
                subject: config.subject,
                language: config.language,
                userId: config.studentProfileId || 'unknown',
                totalChunks: simulatedChunks,
                completedChunks: [0, 1],
                failedExternalChunks: [],
                failedLogicChunks: [],
                pdfTextCacheKey: config.documentId,
                status: 'COMPLETED',
                safeToConsume: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // 5. Ensure all writes flush before returning (UI race condition fix)
            await new Promise(resolve => setTimeout(resolve, 100));

            logger.ingestion(`[GLOBAL_REUSE] ✅ Local State Hydrated. AI Skipped.`);

            // Return appropriate result based on mode
            if (config.extractionMode === ExtractionMode.CURRICULUM) {
                return globalPkg.map as CurriculumMap;
            } else {
                return globalPkg.atoms;
            }
        } else {
            logger.ingestion(`[GLOBAL_REUSE] No verified global package. Proceeding to AI...`);
        }
    } catch (e: any) {
        logger.ingestion(`[GLOBAL_REUSE] [WARNING] Gate Check Failed (Non-blocking): ${e.message}`);
    }

    // 2. Route & Execute Strategy with Terminal Error Reporting
    try {
        if (config.extractionMode === ExtractionMode.CURRICULUM) {
            return await runCurriculumStrategy(config);
        }
        return await runPageLevelStrategy(config);
    } catch (strategyErr: any) {
        // Mark Ledger as FAILED_TERMINAL for UI
        if (strategyErr.message !== 'quota_exceeded' && strategyErr.message !== 'page_limit_exceeded' && !strategyErr.message?.startsWith('QUOTA_EXCEEDED')) {
            try {
                const ledger = await idb.get('ingestion_ledgers', config.documentId);
                if (ledger) {
                    await idb.put('ingestion_ledgers', {
                        ...ledger,
                        status: 'FAILED_TERMINAL',
                        pausedReason: strategyErr.message || "An error occurred during extraction.",
                        updatedAt: Date.now()
                    });
                }
            } catch (ledgErr) {
                console.error("[INGESTION] Failed to mark ledger as FAILED_TERMINAL:", ledgErr);
            }
        }
        throw strategyErr; // Re-throw for Dashboard to see
    }
}
