
import firebase from 'firebase/compat/app';
import { Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getDB } from '../idbService';
import { JourneyEvent, JourneySyncState } from '../../types/journey';

const COLLECTION_EVENTS = 'journey_events';
const COLLECTION_SYNC_STATE = 'journey_sync_state';

export const JourneySyncService = {

    /**
     * Main Sync Orchestrator
     * 1. Check Metadata
     * 2. Push Dirty (if local has changes)
     * 3. Pull New (if global has changes)
     */
    sync: async (studentId: string) => {
        try {
            if (typeof window === 'undefined') return; // Guard for SSR

            // 1. Get Local State
            const idb = await getDB();
            const localState = await idb.get('journey_sync_state_local', studentId);
            const localLastVersion = localState?.lastKnownVersion || 0;

            // 2. Get Global Metadata (Cheap Read)
            const globalStateRef = db.collection(COLLECTION_SYNC_STATE).doc(studentId);
            const globalSnapshot = await globalStateRef.get();
            const globalData = globalSnapshot.data() as JourneySyncState | undefined;
            const globalLastVersion = globalData?.lastVersion || 0;

            // 3. PUSH: If we have dirty events (Check IDB index)
            const dirtyEvents = await idb.getAllFromIndex('journey_events_local', 'by_sync_status', 'dirty');

            if (dirtyEvents.length > 0) {
                await JourneySyncService.push(studentId, dirtyEvents);
            }

            // 4. PULL: If global is ahead of local
            // We check this AFTER push because push might have updated global version, 
            // but effectively we want to pull anything we don't have.
            // If we just pushed, globalVersion (fetched at start) might be stale if we used that comparison.
            // But since we are transactionally updating global, we should re-check or just define the pull condition:

            // Re-fetch global version? No, that costs reads.
            // If we pushed, we updated our localLastVersion to the new max.

            // Simple logic: If we saw global > local at start, OR if we want to be safe.
            // Actually, best practice: Push first, then Pull.

            if (globalLastVersion > localLastVersion) {
                await JourneySyncService.pull(studentId, localLastVersion);
            }

        } catch (error) {
            console.error('[JourneySync] Sync failed:', error);
        }
    },

    /**
     * PUSH: Upload dirty events to Firestore
     * Uses Transaction to ensure monotonic versioning
     */
    push: async (studentId: string, dirtyEvents: JourneyEvent[]) => {
        const idb = await getDB();

        // We process in batches if needed, but for now simple loop inside transaction or sequential transactions.
        // To guarantee strict monotonic versioning for ALL events, we should do one transaction for the batch 
        // OR sequential transactions. 
        // One transaction is better for atomicity but has size limits (500). 
        // Assuming typical user won't have 500 dirty events.

        try {
            await db.runTransaction(async (transaction) => {
                const globalStateRef = db.collection(COLLECTION_SYNC_STATE).doc(studentId);
                const globalDoc = await transaction.get(globalStateRef);

                let currentVer = 0;
                if (globalDoc.exists) {
                    const data = globalDoc.data() as JourneySyncState;
                    currentVer = data.lastVersion;
                }

                // Process all dirty events
                // Sort them? Order doesn't matter strictly as long as version increments
                dirtyEvents.forEach((event, index) => {
                    const nextVer = currentVer + 1 + index; // Increment per event

                    const eventRef = db
                        .collection(COLLECTION_EVENTS)
                        .doc(studentId)
                        .collection('events')
                        .doc(event.id);

                    // Payload to write (remove syncStatus)
                    const { syncStatus, ...rest } = event;
                    const eventPayload: JourneyEvent = {
                        ...rest,
                        version: nextVer,
                        updatedAt: Timestamp.now()
                    };

                    transaction.set(eventRef, eventPayload);
                });

                // Update Sync State
                const finalVer = currentVer + dirtyEvents.length;
                transaction.set(globalStateRef, {
                    lastVersion: finalVer,
                    lastUpdatedAt: Timestamp.now()
                }, { merge: true });

                // Return context for post-transaction local update
                return { finalVer, count: dirtyEvents.length };
            });

            // Post-Transaction: Update Local DB
            // We assume success if no error thrown
            // We need to fetch the pushed events effectively? 
            // We can just update them locally because we know what version we assigned!

            // We need to know the starting version... 
            // Wait, inside transaction we read global state. Outside we don't know what it *was* exactly unless verified.
            // BUT: runTransaction returns what we return.

            // Refetching global state is one extra read.
            // Or we can rely on PULL to update our local state?
            // "Standard Pattern": Push marks dirty -> clean locally. 
            // If we update local version to match what we just pushed, we save a pull.
            // BUT: We need to know strict mapping of ID -> assignedVersion.

            // Optimized: We pushed X events. 
            // But doing it perfectly safely: Just mark them synced?
            // If we mark them 'synced' but don't update their version locally, 
            // then `localLastVersion` remains old. 
            // Then PULL will see `global > local` and pull them back. 
            // This is "Idempotent / Safe" but creates extra reads (reading back own writes).

            // "Zero-Read" Optimization:
            // We really should update local state with assumed versions if transaction succeeded.
            // However, getting the exact `startVersion` from inside the transaction out to here 
            // is tricky if there was a retry (transaction might re-run). 
            // Actually, transaction retries RE-RUN the function. 
            // So if it returns, it succeeded with final logic.

            // For V1, let's rely on PULLing back our own writes if needed to ensure consistency, 
            // OR simpler: Just mark dirty -> synced.
            // And update local sync state to `finalVer`? 
            // No, because we don't have the event bodies with the version number in IDB yet.
            // So PULL is safest to ensure IDB has the authoritative version number.

            // Action: Just mark dirty -> synced (so we don't push again).
            // Actually, if we don't update version in IDB, next PULL will overwrite them with correct version. 
            // This is perfect.

            const txn = idb.transaction('journey_events_local', 'readwrite');
            await Promise.all(dirtyEvents.map(ev => {
                // We keep them as dirty? No, momentarily 'synced' so we don't re-push.
                // But better yet: SyncStatus 'synced'.
                // Next Pull will update them with server version.
                const updated = { ...ev, syncStatus: 'synced' as const };
                return txn.store.put(updated);
            }));
            await txn.done;

        } catch (error) {
            console.error('[JourneySync] Push failed:', error);
            throw error;
        }
    },

    /**
     * PULL: Download new events from Firestore
     */
    pull: async (studentId: string, localLastVersion: number) => {
        const idb = await getDB();

        try {
            const snapshot = await db
                .collection(COLLECTION_EVENTS)
                .doc(studentId)
                .collection('events')
                .where('version', '>', localLastVersion)
                .orderBy('version', 'asc')
                .get();

            if (snapshot.empty) return;

            let maxVer = localLastVersion;

            const txn = idb.transaction(['journey_events_local', 'journey_sync_state_local'], 'readwrite');

            for (const doc of snapshot.docs) {
                const data = doc.data() as JourneyEvent;
                // Upsert to local
                const localEvent = {
                    ...data,
                    syncStatus: 'synced' as const
                };
                await txn.objectStore('journey_events_local').put(localEvent);

                if (data.version > maxVer) {
                    maxVer = data.version;
                }
            }

            // Update local watermark
            await txn.objectStore('journey_sync_state_local').put({
                studentId,
                lastKnownVersion: maxVer,
                lastSyncedAt: Date.now()
            });

            await txn.done;
            console.log(`[JourneySync] Pulled ${snapshot.size} events. New version: ${maxVer}`);

        } catch (error) {
            console.error('[JourneySync] Pull failed:', error);
            throw error;
        }
    }
};
