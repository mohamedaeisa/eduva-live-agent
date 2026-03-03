import { getDB } from '../../../idbService';
import { AtomCore } from '../../../../types';
import { buildAtomCacheKey } from '../../../symbolic/buildAtomCacheKey';
import { logger } from '../../../../utils/logger';
import { saveAtoms, getAtomsForContent } from '../../../storageService';

/**
 * Checks if atoms already exist for this specific Archetype + Node context.
 * Uses the computed Cache Key as a lookup.
 */
export async function getCachedAtoms(
    docFingerprint: string,
    curriculumNodeId: string,
    archetypeId: string,
    language: string
): Promise<AtomCore[] | null> {
    const db = await getDB();
    const cacheKey = await buildAtomCacheKey(docFingerprint, curriculumNodeId, archetypeId, language);

    // 1. Look for a "Generation Manifest" or query atoms directly.
    // Querying atoms by `curriculumNodeId` + `archetypeId` (if we stored it) would be ideal.
    // For v1, we can use a simpler approach: Store a record of "Completed Generations".

    const manifest = await db.get('generation_manifests', cacheKey);
    if (manifest) {
        logger.ingestion(`[ATOM_STORE] Cache HIT for key ${cacheKey.substring(0, 8)}`);
        // Retrieve actual atoms
        // In v1, we assume all atoms for this key are stored. 
        // We might need to fetch by IDs if manifest has them.
        // simpler: fetch all atoms for doc and filter? No, inefficient.
        // If manifest contains atomIds:
        if (manifest.atomIds && Array.isArray(manifest.atomIds)) {
            const tx = db.transaction('local_atoms', 'readonly');
            const atoms = await Promise.all(manifest.atomIds.map((id: string) => tx.store.get(id)));
            await tx.done;
            return atoms.filter(Boolean) as AtomCore[];
        }
    }

    return null;
}

export async function cacheAndSaveAtoms(
    atoms: AtomCore[],
    docFingerprint: string,
    curriculumNodeId: string,
    archetypeId: string,
    language: string
): Promise<void> {
    const db = await getDB();
    const cacheKey = await buildAtomCacheKey(docFingerprint, curriculumNodeId, archetypeId, language);

    // 1. Save Atoms to main store
    await saveAtoms(atoms, 'local_atoms');

    // 2. Write Manifest
    const manifest = {
        id: cacheKey,
        docFingerprint,
        curriculumNodeId,
        archetypeId,
        language,
        atomIds: atoms.map(a => a.atomId),
        createdAt: Date.now()
    };

    await db.put('generation_manifests', manifest);
    logger.ingestion(`[ATOM_STORE] Saved manifest for ${cacheKey.substring(0, 8)} with ${atoms.length} atoms.`);
}
