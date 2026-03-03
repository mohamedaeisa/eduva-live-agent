
import { db } from './firebaseConfig';
import firebase from 'firebase/compat/app';

const QUEUE_DOC = 'system/concurrency';
const MAX_CONCURRENT = 10; // Stay safe under 15 RPM

/**
 * Force clears the concurrency queue.
 * Useful on app start to prevent stale locks.
 */
export const clearQueueCollection = async () => {
  if (!db) return;
  try {
    const docRef = db.doc(QUEUE_DOC);
    await docRef.delete();
  } catch (e) {
    console.warn("Failed to clear queue", e);
  }
};

/**
 * Attempts to acquire a slot in the global AI queue.
 * Returns a ticket ID if successful, or waits if full.
 */
export const acquireGlobalLock = async (
  onStatus: (msg: string) => void
): Promise<string> => {
  if (!db) return 'no_db';
  const ticketId = `tk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  let attempts = 0;
  while (attempts < 30) { // Max 5 mins wait
    try {
      const result = await db.runTransaction(async (transaction) => {
        const docRef = db.doc(QUEUE_DOC);
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          transaction.set(docRef, { active: [ticketId], lastUpdated: Date.now() });
          return { success: true };
        }
        
        const data = doc.data();
        const active = data?.active || [];
        
        // Clean up expired tickets (> 2 mins)
        const now = Date.now();
        const validActive = active.filter((t: string) => {
           const time = parseInt(t.split('_')[1]);
           return (now - time) < 120000;
        });

        if (validActive.length < MAX_CONCURRENT) {
          transaction.update(docRef, { 
            active: [...validActive, ticketId],
            lastUpdated: now
          });
          return { success: true };
        }
        
        return { success: false, queuePos: validActive.length };
      });

      if (result.success) return ticketId;
      
      onStatus(`⏳ AI Queue Full (Waiting for slot...)`);
      await new Promise(r => setTimeout(r, 10000)); // Wait 10s before re-check
      attempts++;
    } catch (e) {
      console.warn("Queue error, bypassing to prevent hang", e);
      return 'bypass';
    }
  }
  return 'timeout';
};

export const releaseGlobalLock = async (ticketId: string) => {
  if (!db || ticketId === 'bypass' || ticketId === 'no_db') return;
  try {
    const docRef = db.doc(QUEUE_DOC);
    await docRef.update({
      active: firebase.firestore.FieldValue.arrayRemove(ticketId)
    });
  } catch (e) {}
};
