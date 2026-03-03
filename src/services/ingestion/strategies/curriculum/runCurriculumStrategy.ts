import { IngestionConfig } from '../../../../types/ingestion';
import { CurriculumMap } from '../../../../types/ingestion';
import { getOrGenerateCurriculumMap } from '../curriculum/curriculumMapStore';
import { resolveArchetype } from '../../../symbolic/resolveArchetype';
import { logger } from '../../../../utils/logger';
import { getPdfTextBatches } from '../../../pdfUtils';
import { getActiveUser } from '../../../authService';
import { getLocalTrainingSources, saveChunkStatus, saveAtoms } from '../../../storageService';
import { generateAtomsFromNode } from './atomFromNode.ai';
import { cacheAndSaveAtoms } from './atomStore';

// 🔒 Phase 3 R3 v1.1: Safety Systems
import { runPreFlightChecks, TimeoutTracker, isCircuitBreakerError, getCircuitBreakerMessage } from '../../circuitBreaker';
import { validateCurriculumMap } from '../../mapValidator';
import { verifyCoverage, formatCoverageSummary } from '../../coverageVerifier';
import { NodeBatch } from './batchNodes';
import { Atom } from '../../../../types';

// Helper: Fetch Full Text from Storage -> IDB -> PDF Utils
async function getDocText(docFingerprint: string, userId: string): Promise<string> {
    const sources = await getLocalTrainingSources(userId);
    const match = sources.find(s => s.fileHash === docFingerprint);
    if (!match || !match.data) {
        throw new Error(`Document text not found for ${docFingerprint}`);
    }
    const batches = await getPdfTextBatches(match.data, 50);
    return batches.map(b => b.text).join('\n');
}

export async function runCurriculumStrategy(config: IngestionConfig): Promise<CurriculumMap> {
    const user = await getActiveUser();
    if (!user) throw new Error("User required for Curriculum Mode");

    logger.ingestion(`[CURRICULUM_STRATEGY] Starting for doc ${config.documentId}`);

    // 🔒 v1.1: Start Timeout Tracker
    const timeoutTracker = new TimeoutTracker();

    try {
        // 1. Resolve Source & Text
        const sources = await getLocalTrainingSources(user.id);
        const sourceMatch = sources.find(s => s.fileHash === config.documentId);
        if (!sourceMatch || !sourceMatch.data) {
            throw new Error(`Document text not found for ${config.documentId}`);
        }
        const batches = await getPdfTextBatches(sourceMatch.data, 50);
        const docText = batches.map(b => b.text).join('\n');

        // 🔒 v1.1: CIRCUIT BREAKER - Pre-Flight Checks
        runPreFlightChecks({
            docTextLength: docText.length,
        });
        timeoutTracker.check('pre-flight checks');

        // 2. Resolve Student Profile -> Archetype
        const archetype = await resolveArchetype(user, config.subject);

        logger.ingestion(`[CURRICULUM_STRATEGY] Resolved Archetype: ${archetype.id}`);
        timeoutTracker.check('archetype resolution');

        // 3. Generate Map (Structure)
        logger.ingestion(`[CURRICULUM_STRATEGY] Generating Curriculum Map structure...`);
        const rawMap = await getOrGenerateCurriculumMap(
            docText,
            config.documentId,
            config.subject,
            archetype.gradeLevel.toString()
        );
        timeoutTracker.check('map generation');

        // 🔒 v1.1: VALIDATE MAP before using it
        const { map, report } = validateCurriculumMap(rawMap);
        if (!map) {
            throw new Error(`Map validation failed:\n${report.errors.join('\n')}`);
        }

        logger.ingestion(`[CURRICULUM_STRATEGY] ✅ Map validated: ${map.nodes.length} nodes (Grade ${map.grade})`);
        if (report.warnings.length > 0) {
            report.warnings.forEach(w => logger.warn('INGESTION', `[MAP_VALIDATOR] ${w}`));
        }

        // 3b. Global Map Promotion (v1.3 Pillar 1)
        // Persist map to global_curriculum_maps for future hits.
        try {
            const mod = await import('../../../globalSharingService') as any;
            await mod.saveGlobalCurriculumMap(map, config.documentId);
        } catch (e: any) {
            logger.ingestion(`[CURRICULUM_STRATEGY] [WARNING] Failed to promote map: ${e.message}`);
        }

        // 4. EAGER STRATEGY (v1.1 R2)
        // 4. ATOM EXTRACTION (MANDATORY in Smart Mode R3)
        // ⚠️ CRITICAL: Atoms MUST be extracted - no "Map Only" runs allowed
        // Partial Hit Check: If atoms were hydrated from Global Registry, skip AI.
        const { getLocalAtoms } = await import('../../../storageService');
        const existingViewModels = await getLocalAtoms(user.id, config.documentId);
        let allAtoms = existingViewModels.map(vm => vm.core);

        if (allAtoms.length > 0) {
            logger.ingestion(`[CURRICULUM_STRATEGY] Found ${allAtoms.length} existing atoms. Skipping AI Atom Generation.`);
        } else {
            // 🔒 SMART MODE ENFORCEMENT: Atoms MUST be generated
            logger.ingestion(`[CURRICULUM_STRATEGY] No existing atoms found. Starting MANDATORY Atom Extraction...`);
            timeoutTracker.check('atom extraction start');

            // A. Batch Nodes
            const { batchNodes } = await import('./batchNodes');
            const batches = batchNodes(map.nodes, docText);

            // B. Generate Atoms (Parallel Batches)
            const { generateAtomsFromBatch } = await import('./atomFromBatch.ai');

            logger.ingestion(`[CURRICULUM_STRATEGY] Processing ${batches.length} batches...`);

            // 🔒 P2: Parallel batch processing with rate limiting
            const { ParallelBatchProcessor } = await import('../../parallelProcessor');
            // Explicitly type the processor
            const processor = new ParallelBatchProcessor<NodeBatch, Atom[]>({
                maxConcurrent: 3,  // Prevent API quota exhaustion
                rateLimit: {
                    maxPerSecond: 5,
                    delayMs: 200
                }
            });

            const results = await processor.process(
                batches,
                async (batch, idx) => {
                    logger.ingestion(`[CURRICULUM_STRATEGY] Processing Batch ${idx + 1}/${batches.length} (${batch.nodes.length} nodes)`);

                    const batchAtoms = await generateAtomsFromBatch(
                        batch.nodes,
                        batch.textSlice,
                        map.subject,
                        map.language,
                        archetype.id,
                        (msg) => logger.ingestion(`[AI-BATCH-${idx + 1}] ${msg}`)
                    );

                    // 🔒 v1.1: Check timeout after each batch
                    timeoutTracker.check(`batch ${idx + 1}`);

                    return batchAtoms;
                }
            );

            allAtoms = results.flat();

            // 🔒 P2: Enrich atoms with enhanced metadata
            const { enrichAtomsBatch } = await import('../../metadataEnricher');
            allAtoms = await enrichAtomsBatch(allAtoms, {
                curriculumMapId: map.mapId,
                aiModel: 'gemini-3-flash-preview'
            });

            logger.ingestion(`[CURRICULUM_STRATEGY] Generated ${allAtoms.length} total atoms (enriched with P2 metadata).`);
        }

        // 🔒 v1.1: COVERAGE VERIFICATION
        if (allAtoms.length > 0) {
            const coverage = verifyCoverage(map, allAtoms);
            logger.ingestion(`[CURRICULUM_STRATEGY] Coverage Report:\n${formatCoverageSummary(coverage)}`);

            // Optional: Fail on low coverage (strictness gate)
            // if (coverage.coveragePercentage < 50) {
            //     throw new Error(`Coverage too low: ${coverage.coveragePercentage.toFixed(1)}%`);
            // }
        }

        // C. Persist Atoms
        if (allAtoms.length > 0) {
            // 1. Local Persistence (Primary)
            await saveAtoms(allAtoms, 'local_atoms');
            logger.ingestion(`[CURRICULUM_STRATEGY] Atoms persisted to store.`);

            // 2. Global Hydration (Legacy Sync)
            // Pushes to 'temp_global_atoms' for admin approval workflow
            try {
                const { stageAtomsForGlobalReview } = await import('../../../globalSharingService');
                await stageAtomsForGlobalReview(
                    user.id,
                    config.documentId,
                    config.subject,
                    map.grade?.toString() || archetype.gradeLevel.toString(),
                    allAtoms,
                    sourceMatch.fileName,
                    sourceMatch.educationSystem || 'IGCSE'
                );
                logger.ingestion(`[CURRICULUM_STRATEGY] Atoms staged to temp_global_atoms.`);
            } catch (e) {
                logger.error('INGESTION', `[CURRICULUM_STRATEGY] Failed to stage atoms to global:`, e);
                // Non-blocking: We don't fail the ingestion if global sync fails
            }
        }

        // 🔒 P0 FIX #3: COMPLETION VALIDATION
        // CRITICAL: Do NOT mark as "Completed" if atoms are missing
        // This protects downstream systems (Quiz, Notes, Radar)
        const hasAtoms = allAtoms.length > 0;
        const finalStatus = hasAtoms ? 'Completed' as any : 'Incomplete' as any;

        if (!hasAtoms) {
            logger.warn('INGESTION', `[CURRICULUM_STRATEGY] ⚠️ WARNING: No atoms generated! Marking as INCOMPLETE.`);
        }

        // D. Mark Complete (or Incomplete if atoms missing)
        await saveChunkStatus({
            id: `${config.documentId}_structure`,
            contentId: config.documentId,
            feature: 'notes',
            chunkIndex: 0,
            pageStart: 0,
            pageEnd: map.nodes.length,
            status: hasAtoms ? 'COMPLETE' : 'INCOMPLETE',
            atomCount: allAtoms.length,
            processedAt: Date.now()
        });

        // v1.3 PILLAR 4: STATE CHAIN INTEGRITY
        // Fix: Explicitly mark the source status based on atom extraction success
        const { getDB } = await import('../../../idbService');
        const db = await getDB();
        const tx = db.transaction('training_sources', 'readwrite');
        const index = tx.store.index('by_student');

        // Iterate user sources to find the matching fingerprint
        let cursor = await index.openCursor(user.id);
        while (cursor) {
            // config.documentId is the fingerprint/fileHash
            if (cursor.value.fileHash === config.documentId) {
                const update = {
                    ...cursor.value,
                    status: finalStatus,
                    progress: hasAtoms ? 100 : 75, // 75% if missing atoms
                    updatedAt: Date.now()
                };
                await cursor.update(update);
                logger.ingestion(`[CURRICULUM_STRATEGY] Source ${cursor.value.id} marked as ${finalStatus}.`);
            }
            cursor = await cursor.continue();
        }
        await tx.done;

        // 🔒 FIX: Update GLOBAL Firestore training collection status
        try {
            const { db: fireDb } = await import('../../../firebaseConfig');
            if (fireDb) {
                // Query by studentId and fileHash
                const querySnap = await fireDb.collection('training')
                    .where('studentId', '==', user.id)
                    .where('fileHash', '==', config.documentId)
                    .get();

                if (!querySnap.empty) {
                    const batch = fireDb.batch();
                    querySnap.docs.forEach(doc => {
                        batch.update(doc.ref, {
                            status: hasAtoms ? 'Completed' : 'Incomplete',
                            progress: hasAtoms ? 100 : 75,
                            atomCount: allAtoms.length,
                            updatedAt: Date.now()
                        });
                    });
                    await batch.commit();
                    logger.ingestion(`[CURRICULUM_STRATEGY] Global training status updated: ${finalStatus}`);
                }
            }
        } catch (globalErr: any) {
            logger.warn('INGESTION', `[CURRICULUM_STRATEGY] Failed to update global training status: ${globalErr.message}`);
            // Non-blocking: Don't fail ingestion if global sync fails
        }

        const elapsed = timeoutTracker.getElapsed();
        logger.ingestion(`[CURRICULUM_STRATEGY] ✅ Strategy Complete in ${(elapsed / 1000).toFixed(1)}s. Map & Atoms Ready.`);

        // 5. Return Map
        return map;

    } catch (error: any) {
        if (isCircuitBreakerError(error)) {
            logger.error('INGESTION', `[CURRICULUM_STRATEGY] Circuit breaker tripped: ${error.level}`);
            throw new Error(getCircuitBreakerMessage(error));
        }

        logger.error('INGESTION', `[CURRICULUM_STRATEGY] Failed:`, error);
        throw error;
    }
}
