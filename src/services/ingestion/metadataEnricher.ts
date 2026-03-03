import { AtomCore } from '../../types';
import { sha256 } from '../../utils/hashUtils';

/**
 * Phase 3 R3 v1.1 P2: Metadata Enrichment Utilities
 * 
 * Purpose: Populate enhanced metadata fields for atom tracking,
 * versioning, provenance, and deduplication.
 */

// Current extraction version (increment on major prompt/logic changes)
export const CURRENT_EXTRACTION_VERSION = 'R3_v1.1';

/**
 * Generate content hash for deduplication
 * Uses definition + keyRule as the canonical content signature
 */
export async function generateContentHash(atom: Partial<AtomCore>): Promise<string> {
    const canonical = `${atom.coreRepresentation?.definition || ''}|${atom.coreRepresentation?.keyRule || ''}`;
    return await sha256(canonical);
}

/**
 * Enrich atom with P2 metadata fields
 * Call this after AI generation, before storage
 */
export async function enrichAtomMetadata(
    atom: Partial<AtomCore>,
    context: {
        curriculumMapId?: string;
        aiModel?: string;
    }
): Promise<AtomCore> {

    // Generate content hash for deduplication
    const contentHash = await generateContentHash(atom);

    // Populate P2 fields
    const enriched: AtomCore = {
        ...atom,
        metadata: {
            ...atom.metadata!,

            // P2: Enhanced Metadata
            curriculumMapId: context.curriculumMapId,
            extractionVersion: CURRENT_EXTRACTION_VERSION,
            aiModelUsed: context.aiModel || 'gemini-3-flash-preview',
            contentHash,
            validatedAt: Date.now(),
        }
    } as AtomCore;

    return enriched;
}

/**
 * Bulk enrich atoms (batch operation)
 */
export async function enrichAtomsBatch(
    atoms: Partial<AtomCore>[],
    context: {
        curriculumMapId?: string;
        aiModel?: string;
    }
): Promise<AtomCore[]> {
    return Promise.all(atoms.map(atom => enrichAtomMetadata(atom, context)));
}

/**
 * Check if atom needs re-extraction based on version
 */
export function needsReExtraction(atom: AtomCore): boolean {
    if (!atom.metadata.extractionVersion) {
        return true; // Legacy atom, no version
    }

    if (atom.metadata.extractionVersion !== CURRENT_EXTRACTION_VERSION) {
        return true; // Outdated version
    }

    return false;
}

/**
 * Find duplicate atoms by content hash
 */
export function findDuplicatesByHash(atoms: AtomCore[]): Map<string, AtomCore[]> {
    const hashMap = new Map<string, AtomCore[]>();

    for (const atom of atoms) {
        const hash = atom.metadata.contentHash;
        if (!hash) continue;

        if (!hashMap.has(hash)) {
            hashMap.set(hash, []);
        }
        hashMap.get(hash)!.push(atom);
    }

    // Filter to only duplicates (more than 1 atom per hash)
    const duplicates = new Map<string, AtomCore[]>();
    for (const [hash, atomList] of hashMap.entries()) {
        if (atomList.length > 1) {
            duplicates.set(hash, atomList);
        }
    }

    return duplicates;
}

/**
 * Get atom provenance summary
 */
export function getAtomProvenance(atom: AtomCore): string {
    const parts = [
        `Version: ${atom.metadata.extractionVersion || 'Legacy'}`,
        `Model: ${atom.metadata.aiModelUsed || 'Unknown'}`,
        `Validated: ${atom.metadata.validatedAt ? new Date(atom.metadata.validatedAt).toISOString() : 'Never'}`,
    ];

    if (atom.metadata.curriculumMapId) {
        parts.push(`Map: ${atom.metadata.curriculumMapId.substring(0, 8)}...`);
    }

    if (atom.metadata.curriculumNodeId) {
        parts.push(`Node: ${atom.metadata.curriculumNodeId.substring(0, 8)}...`);
    }

    return parts.join(' | ');
}
