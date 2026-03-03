
import { getLocalAtoms, saveLocalAtoms, saveLocalTrainingSource, getLocalTrainingSources, saveAtoms } from './storageService';
import { getDB } from './idbService';
import { checkGlobalAtoms } from './globalSharingService';
// Fix: Changed non-existent Atom type to AtomCore.
import { AtomCore } from '../types';
import { db } from './firebaseConfig';
import firebase from 'firebase/compat/app';

export interface HydrationResult {
    status: 'ready' | 'hydrating' | 'error';
    // Fix: Changed non-existent Atom type to AtomCore.
    atoms: AtomCore[];
    message?: string;
}

// 🔒 CONCURRENCY GUARD: Prevents double-fetching the same resource
const hydrationLocks = new Map<string, Promise<HydrationResult>>();

/**
 * fetchGlobalAtomsBySubject (New V2)
 * Hydrates atoms for a subject-based exam from the global reservoir.
 */
export async function fetchGlobalAtomsBySubject(
    userId: string,
    subject: string,
    filters: {
        educationSystem?: string;
        grade?: string;
        language?: string;
    } = {},
    onStatus?: (msg: string) => void
): Promise<HydrationResult> {
    const lockKey = `sub:${userId}:${subject}:${JSON.stringify(filters)}`;

    if (hydrationLocks.has(lockKey)) {
        onStatus?.("[HYDRATOR] Joining active hydration request...");
        return hydrationLocks.get(lockKey)!;
    }

    const task = (async () => {
        try {
            onStatus?.(`[HYDRATOR] Checking Global Grid for Subject: ${subject} (${JSON.stringify(filters)})...`);

            // Query Global Atoms by Subject + Filters
            // Note: This requires composite indexes in Firestore.
            let query = db.collection('global_atoms')
                .where('metadata.subject', '==', subject);

            if (filters.educationSystem) {
                query = query.where('educationSystem', '==', filters.educationSystem);
            }
            if (filters.grade) {
                query = query.where('grade', '==', filters.grade);
            }
            if (filters.language) {
                query = query.where('metadata.language', '==', filters.language);
            }

            const snap = await query.limit(200).get();

            if (snap.empty) {
                return { status: 'error', atoms: [], message: 'No global knowledge found for this subject.' } as HydrationResult;
            }

            const atoms = snap.docs.map(d => d.data() as AtomCore);

            // Enrich with userId and Sync Metadata for Indexing
            const enriched = atoms.map(a => ({
                ...a,
                userId,
                metadata: {
                    ...a.metadata,
                    sourceDocumentId: (a as any).originDocFingerprint // Ensure indexable field is present
                }
            }));
            await saveAtoms(enriched as any, 'notes');

            return { status: 'ready', atoms } as HydrationResult;

        } catch (e: any) {
            console.error("[HYDRATOR] Subject Fetch Failed", e);
            const errResult: HydrationResult = { status: 'error', atoms: [], message: e.message };
            return errResult;
        } finally {
            hydrationLocks.delete(lockKey);
        }
    })();

    hydrationLocks.set(lockKey, task);
    return task;
}

/**
 * THE HYDRATOR: v2.3 Sync Loop
 * Prioritizes local IndexedDB speed, falls back to Global Grid.
 */
export async function fetchAtomsForSession(
    userId: string,
    contentId: string,
    onStatus?: (msg: string) => void
): Promise<HydrationResult> {
    const lockKey = `doc:${userId}:${contentId}`;

    if (hydrationLocks.has(lockKey)) {
        return hydrationLocks.get(lockKey)!;
    }

    const task = (async () => {
        const log = (msg: string) => {
            onStatus?.(`[HYDRATOR] ${msg}`);
        };

        // 1. Check Local Cache (Speed ⚡)
        const localAtomsVM = await getLocalAtoms(userId, contentId);
        if (localAtomsVM && localAtomsVM.length > 0) {
            return { status: 'ready', atoms: localAtomsVM.map(vm => vm.core) } as HydrationResult;
        }

        // 2. Check Global Grid (Network 🌐)
        // Ensure we are only looking for the specific fingerprint lock
        log(`Checking Global Grid for specific fingerprint: ${contentId.substring(0, 8)}...`);
        const globalAtoms = await checkGlobalAtoms(contentId);

        if (globalAtoms && globalAtoms.length > 0) {
            // 3. Hydrate Local DB (Enrich with userId and Index Mappings)
            const enriched = globalAtoms.map(a => ({
                ...a,
                userId,
                metadata: {
                    ...a.metadata,
                    sourceDocumentId: (a as any).originDocFingerprint || contentId // CRITICAL: Map to index key
                }
            }));
            await saveAtoms(enriched as any, 'notes');

            // 4. REAL-TIME COVERAGE SYNC
            const scoresToSync: Record<string, number> = {};
            globalAtoms.forEach(a => {
                // v7: masteryScore is top-level on the storage Atom object (assume score is available if hydrated)
                scoresToSync[a.atomId] = 0.5; // Default score upon hydration
            });

            if (Object.keys(scoresToSync).length > 0) {
                try {
                    await db.collection('users').doc(userId).set({
                        gamification: {
                            masteryMap: scoresToSync
                        }
                    }, { merge: true });
                } catch (e: any) {
                    console.warn("[HYDRATOR] Profile sync failed:", e.message);
                }
            }

            // 5. Update Source Registry Status
            const sources = await getLocalTrainingSources(userId);
            const match = sources.find(s => s.fileHash === contentId);
            if (match && match.status !== 'Completed') {
                await saveLocalTrainingSource({
                    ...match,
                    status: 'Completed',
                    progress: 100,
                    updatedAt: Date.now(),
                    logs: [...(match.logs || []), `[${new Date().toLocaleTimeString()}] Bridge restored via Global Grid.`]
                });
            }

            return { status: 'ready', atoms: globalAtoms } as HydrationResult;
        }

        return {
            status: 'error',
            atoms: [],
            message: 'Material requires initial training.'
        } as HydrationResult;
    })();

    hydrationLocks.set(lockKey, task);
    return task.finally(() => hydrationLocks.delete(lockKey));
}

export async function hydrateAtomList(atomIds: string[]): Promise<AtomCore[]> {
    const idb = await getDB();
    const localAtoms: AtomCore[] = [];
    const missingIds: string[] = [];

    // 1. Check Local
    for (const id of atomIds) {
        const atom = await idb.get('local_atoms', id) as AtomCore;
        if (atom) localAtoms.push(atom);
        else missingIds.push(id);
    }

    // 2. Fetch Missing from Global
    // FIX: Query by 'atomId' field, not document ID, as Global Atoms use composite keys.
    if (missingIds.length > 0 && db) {
        // Batch fetch from 'global_atoms' (limit 30 due to 'in' query limits, or loop)
        const chunks = [];
        for (let i = 0; i < missingIds.length; i += 10) chunks.push(missingIds.slice(i, i + 10));

        for (const chunk of chunks) {
            try {
                const snap = await db.collection('global_atoms')
                    .where('atomId', 'in', chunk)
                    .get();

                const fetched = snap.docs.map(d => d.data() as AtomCore);
                if (fetched.length > 0) {
                    await saveAtoms(fetched, 'notes'); // Save to local
                    localAtoms.push(...fetched);
                }
            } catch (e) {
                console.warn("[HYDRATOR] Global fetch failed for chunk", chunk, e);
            }
        }
    }


    return localAtoms;
}

/**
 * hydrateBySourceId (JIT Fallback)
 * Fetches atoms globally by source document fingerprint when local cache is empty.
 */
export async function hydrateBySourceId(studentId: string, sourceDocId: string): Promise<AtomCore[]> {
    if (!db) return [];
    try {
        console.log(`[HYDRATOR] JIT Fallback: Searching global_atoms for source: ${sourceDocId}`);
        const snap = await db.collection('global_atoms')
            .where('originDocFingerprint', '==', sourceDocId)
            .limit(100) // Cap for performance
            .get();

        if (snap.empty) {
            console.warn(`[HYDRATOR] JIT Fallback: No atoms found globally for ${sourceDocId}`);
            return [];
        }

        const atoms = snap.docs.map(d => d.data() as AtomCore);
        // Enrich with current user ownership before saving locally
        const enriched = atoms.map(a => ({
            ...a,
            userId: studentId,
            metadata: {
                ...a.metadata,
                sourceDocumentId: sourceDocId // Ensure consistency
            }
        }));

        await saveAtoms(enriched, 'notes');
        console.log(`[HYDRATOR] JIT Fallback: Hydrated ${atoms.length} atoms successfully.`);
        return enriched;

    } catch (e: any) {
        console.error(`[HYDRATOR] JIT Fallback Failed:`, e);
        return [];
    }
}
