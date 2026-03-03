import { sha256 } from '../../utils/hashUtils';

export async function buildAtomCacheKey(
    docFingerprint: string,
    curriculumNodeId: string,
    archetypeId: string,
    language: string
): Promise<string> {
    // Key = SHA256( FINGERPRINT : NODE : ARCHETYPE : LANG )
    // This guarantees that any change in context forces a re-generation/fetch
    const rawKey = `${docFingerprint}:${curriculumNodeId}:${archetypeId}:${language}`;
    return sha256(rawKey);
}
