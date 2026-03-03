import { db } from '../../../firebaseConfig';
import { CurriculumMap } from '../../../../types/ingestion';
import { logger } from '../../../../utils/logger';
import { AtomCore } from '../../../../types';

/**
 * Checks if a Curriculum Map for this document already exists in the Global Verified Registry.
 * If found, returns the Map and its Atoms.
 * 
 * @param docFingerprint - Document Hash
 * @param language - Target Language (Maps are language-specific)
 */
export async function checkGlobalMapRegistry(
    docFingerprint: string,
    language: string
): Promise<{ map: CurriculumMap, atoms: AtomCore[] } | null> {
    if (!db) return null;

    try {
        const snap = await db.collection('global_verified_maps')
            .where('sourceDocumentId', '==', docFingerprint)
            .where('language', '==', language)
            .limit(1)
            .get();

        if (snap.empty) {
            return null;
        }

        const mapDoc = snap.docs[0];
        const data = mapDoc.data();

        logger.ingestion(`[GLOBAL_REGISTRY] HIT: Verified Map found for ${docFingerprint}`);

        // Extract Map
        const map: CurriculumMap = data.mapStructure;

        // Fetch Atoms 
        // In v1.3 optimization: Atoms are stored in a subcollection or array. 
        // For array (if < 1MB):
        const atoms = data.atoms as AtomCore[];

        return { map, atoms };

    } catch (e) {
        logger.error('INGESTION', `[GLOBAL_REGISTRY] Check failed`, e);
        return null;
    }
}
