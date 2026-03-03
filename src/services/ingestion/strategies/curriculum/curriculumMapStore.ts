import { getDB } from '../../../idbService';
import { CurriculumMap } from '../../../../types/ingestion';
import { generateCurriculumMap } from './curriculumMapper.ai';
import { pruneEmptyNodes } from './pruneEmptyNodes';
import { logger } from '../../../../utils/logger';
import { sha256 } from '../../../../utils/hashUtils';

/**
 * Retrieves a Curriculum Map for the document.
 * Caching Strategy:
 * 1. Check IDB for Map with same Fingerprint + Subject + Grade
 * 2. If MISS -> Generate -> Prune -> Store -> Return
 */
export async function getOrGenerateCurriculumMap(
    docText: string,
    docFingerprint: string,
    subject: string,
    grade: string,
    onStatus?: (msg: string) => void
): Promise<CurriculumMap> {
    const db = await getDB();

    // 1. Check Cache
    // Ideally we index by 'docFingerprint', but for now we iterate or use existing index if available.
    // Assuming 'maps' store exists. If not, we might need a migration.
    // For v1 safety, let's assume we can query by fingerprint.

    // Hack for IDB v1: We might perform a getAll and filter. 
    // Optimization: Use specific index if added to DB schema.
    const cachedMaps = await db.getAll('curriculum_maps') as CurriculumMap[];
    const hit = cachedMaps.find(m => m.mapId.includes(docFingerprint) && m.subject === subject);

    if (hit) {
        logger.ingestion(`[CURRICULUM_STORE] Cache HIT for ${docFingerprint}`);
        onStatus?.("Curriculum Map found in cache.");
        return hit;
    }

    // 2. Generate
    logger.ingestion(`[CURRICULUM_STORE] Cache MISS. Generating new map...`);
    const rawMap = await generateCurriculumMap(docText, subject, grade, docFingerprint, onStatus);

    // 3. Prune
    const finalMap = pruneEmptyNodes(rawMap);

    // 4. Store
    await db.put('curriculum_maps', finalMap);
    logger.ingestion(`[CURRICULUM_STORE] Map saved: ${finalMap.mapId}`);

    return finalMap;
}
