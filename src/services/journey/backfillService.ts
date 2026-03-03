
import firebase from 'firebase/compat/app';
import { db } from '../firebaseConfig';
import { JourneyEventBuilder } from './journeyEventBuilder';
import { JourneyEvent, JourneySyncState } from '../../types/journey';
import { QuizResult, HistoryItem } from '../../types';

const BATCH_SIZE = 400; // robust batch size (limit is 500)

/**
 * BackfillService
 * 
 * One-time migration utility to populate 'journey_events' from legacy data.
 * - Reads 'exam_results' (Quizzes)
 * - Reads 'history' (Study/Notes)
 * - Generates JourneyEvents
 * - Assigns Monotonic Versions
 * - Writes to Firestore
 */
export const BackfillService = {

    /**
     * Run backfill for a single student
     */
    runForStudent: async (studentId: string): Promise<{ events: number, success: boolean }> => {
        console.log(`[Backfill] Starting for student: ${studentId}`);

        try {
            // 1. Fetch Source Data
            const [quizSnap, historySnap] = await Promise.all([
                db.collection('exam_results').where('userId', '==', studentId).get(),
                db.collection('history').where('userId', '==', studentId).get()
            ]);

            const events: JourneyEvent[] = [];

            // 2. Build Events
            quizSnap.docs.forEach(doc => {
                const data = doc.data() as QuizResult & { startedAt?: number, finishedAt?: number };
                // Inject ID if missing
                if (!data.id) data.id = doc.id;

                const event = JourneyEventBuilder.fromQuizResult(data, 'adaptive');
                events.push(event);
            });

            historySnap.docs.forEach(doc => {
                const data = doc.data() as HistoryItem;
                const event = JourneyEventBuilder.fromHistoryItem(data);
                if (event) events.push(event);
            });

            if (events.length === 0) {
                console.log('[Backfill] No historical data found.');
                return { events: 0, success: true };
            }

            // 3. Sort Chronologically (Oldest First) for logical versioning
            events.sort((a, b) => a.startAt - b.startAt);

            // 4. Assign Monotonic Versions
            // Start from 1 (or current + 1 if re-running? Assuming fresh backfill)
            let versionCounter = 1;
            const finalEvents = events.map(ev => ({
                ...ev,
                version: versionCounter++,
                updatedAt: firebase.firestore.Timestamp.now(),
                syncStatus: undefined // Don't write this to Firestore
            }));

            // 5. Write to Firestore in Batches
            // We use batches instead of transactions for speed, as we are rewriting history.
            // Assumption: No concurrent writes during backfill.

            const chunks = chunkArray(finalEvents, BATCH_SIZE);

            for (const chunk of chunks) {
                const batch = db.batch();

                chunk.forEach(ev => {
                    const ref = db.collection('journey_events')
                        .doc(studentId)
                        .collection('events')
                        .doc(ev.id);

                    // Sanitize undefineds
                    const payload = JSON.parse(JSON.stringify(ev));
                    delete payload.syncStatus;

                    batch.set(ref, payload);
                });

                await batch.commit();
                console.log(`[Backfill] Wrote batch of ${chunk.length} events`);
            }

            // 6. Finalize Sync State
            const lastVersion = versionCounter - 1;
            await db.collection('journey_sync_state').doc(studentId).set({
                lastVersion,
                lastUpdatedAt: firebase.firestore.Timestamp.now()
            } as JourneySyncState);

            console.log(`[Backfill] Complete. Total events: ${lastVersion}`);
            return { events: lastVersion, success: true };

        } catch (error) {
            console.error('[Backfill] Failed:', error);
            return { events: 0, success: false };
        }
    }
};

function chunkArray<T>(array: T[], size: number): T[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
