import { AtomCore, ResolvedAtom } from '../../types';
import { getDB } from '../idbService';

/**
 * EDUVA v7 Concept Relationship Resolver
 * Resolves relatedConceptTags -> atomIds after extraction is complete.
 */
export class ConceptRelationshipResolver {
  static async resolve(userId: string, atoms: AtomCore[]): Promise<ResolvedAtom[]> {
    const idb = await getDB();
    const allUserAtoms = await idb.getAllFromIndex('local_atoms', 'by_user', userId);
    
    // Create a tag -> id map for fast lookup
    const tagToIdMap = new Map<string, string>();
    allUserAtoms.forEach(a => {
        const tag = (a as AtomCore).metadata.conceptTag.toLowerCase();
        tagToIdMap.set(tag, (a as AtomCore).atomId);
    });
    
    // Fix: Re-implemented map to return ResolvedAtom wrapper objects instead of extending AtomCore
    return atoms.map(atom => {
      const resolvedIds = (atom.metadata.relatedConceptTags || [])
        .map(tag => tagToIdMap.get(tag.toLowerCase()))
        .filter((id): id is string => !!id);
        
      const prereqIds = (atom.assessmentMetadata.prerequisiteConceptTags || [])
        .map(tag => tagToIdMap.get(tag.toLowerCase()))
        .filter((id): id is string => !!id);

      return {
        atom: atom,
        resolvedRelationships: {
          relatedAtomIds: resolvedIds,
          prerequisiteAtomIds: prereqIds
        }
      };
    });
  }
}
