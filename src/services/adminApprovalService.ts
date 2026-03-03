
import { db } from './firebaseConfig';
import { UserProfile, AtomCore } from '../types';

/**
 * EDUVA v2.2 Promote & Purge Protocol
 * Ensures atomic transition of atoms from Staging to Global Grid.
 */
export async function approveAndPromoteGroup(
  groupId: string, 
  groupData: any, 
  admin: UserProfile
): Promise<void> {
  if (!db) throw new Error("Database not initialized.");

  try {
    await db.runTransaction(async (transaction) => {
      const tempRef = db.collection('temp_global_atoms').doc(groupId);
      const tempDoc = await transaction.get(tempRef);

      if (!tempDoc.exists) {
        throw new Error("Target packet missing from staging queue.");
      }

      // 1. Promote each individual atom to the Global Grid
      // Fix: Changed non-existent Atom type to AtomCore.
      const atoms: AtomCore[] = groupData.extractedAtoms || [];
      
      atoms.forEach((atom: any) => {
        // Use the pre-calculated Global Identity Key or fallback to atomId
        const globalId = atom.globalIdentityKey || atom.atomId;
        const globalRef = db.collection('global_atoms').doc(globalId);
        
        const globalPayload = {
          ...atom,
          metadata: {
            ...atom.metadata,
            localStatus: 'trained',
            localOnly: false,
            approvedBy: admin.id,
            approvedAt: Date.now()
          },
          originDocFingerprint: groupData.originDocFingerprint,
          adminMeta: {
            approvedAt: new Date().toISOString(),
            originalTempId: groupId
          }
        };

        transaction.set(globalRef, globalPayload);
      });

      // 2. 🔪 PURGE the source packet from Staging (The "Waiting Room")
      transaction.delete(tempRef);
    });

    console.log(`[UCCS_ADMIN] Packet ${groupId} Promoted & Purged.`);
  } catch (error) {
    console.error("[UCCS_ADMIN] Promotion Transaction Fault:", error);
    throw error;
  }
}
