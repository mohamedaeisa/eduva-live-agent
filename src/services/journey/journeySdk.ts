
import { getDB } from '../idbService';
import { JourneyEvent } from '../../types/journey';
import { JourneySyncService } from './journeySyncService';

/**
 * JourneySDK
 * 
 * Single entry point for "My Journey" Timeline data.
 * Adopts a Local-First architecture:
 * - Reads always come from IndexedDB (local cache).
 * - Writes go to IndexedDB first, then trigger background sync.
 * - UI NEVER talks to Firestore directly for this data.
 */
export const JourneySDK = {

    /**
     * Get events for a specific date (UI Timeline View)
     * @param studentId 
     * @param dateString YYYY-MM-DD
     */
    getEventsByDate: async (studentId: string, dateString: string): Promise<JourneyEvent[]> => {
        const db = await getDB();

        // Use compound index [studentId, date, startAt] for efficiency
        const range = IDBKeyRange.bound(
            [studentId, dateString, -Infinity],
            [studentId, dateString, Infinity]
        );

        const events = await db.getAllFromIndex('journey_events_local', 'by_date_student', range);

        // Sort in memory just to be safe (though index usually handles it)
        return events.sort((a, b) => b.startAt - a.startAt); // Descending (newest first)
    },

    /**
     * Get ALL events for a student (For Performance/Stats aggregation)
     * @param studentId
     */
    getAllEvents: async (studentId: string): Promise<JourneyEvent[]> => {
        const db = await getDB();
        const range = IDBKeyRange.bound(
            [studentId, '0000-00-00', -Infinity],
            [studentId, '9999-12-31', Infinity]
        );
        const events = await db.getAllFromIndex('journey_events_local', 'by_date_student', range);
        return events.sort((a, b) => b.startAt - a.startAt);
    },

    /**
     * Get all days that have events within a range (For Date Selector)
     * @param studentId 
     * @param fromDate 
     * @param toDate 
     */
    getDays: async (studentId: string, fromDate: Date, toDate: Date): Promise<string[]> => {
        const db = await getDB();

        // We scan the range to find unique dates
        // Since we don't have a specific "unique dates" index, we iterate the efficient index
        // This is safe because even "heavy" users have < 20 events/day.

        // Format YYYY-MM-DD
        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = toDate.toISOString().split('T')[0];

        const range = IDBKeyRange.bound(
            [studentId, fromStr, -Infinity],
            [studentId, toStr, Infinity]
        );

        const events = await db.getAllFromIndex('journey_events_local', 'by_date_student', range);

        // Extract unique dates
        const uniqueDates = new Set(events.map(e => e.date));
        return Array.from(uniqueDates).sort();
    },

    /**
     * Create a new Journey Event (Local Write -> Sync Trigger)
     * @param event Partial event data
     */
    createEvent: async (event: Omit<JourneyEvent, 'id' | 'syncStatus' | 'updatedAt' | 'version'> & { id?: string }): Promise<void> => {
        const db = await getDB();

        const newEvent: JourneyEvent = {
            id: event.id || crypto.randomUUID(),
            ...event,
            version: 0, // Placeholder, will be updated by sync/backfill logic if authoritative, but locally we just store it
            // Actually, for local creation we don't assign version yet, or we assign 0.
            // When syncing push happens, if we are the authority (e.g. valid source), we might need logic.
            // BUT: Per spec, "JourneyEventBuilder" creates these.
            // We'll mark it dirty.

            // However, we need a Timestamp for updatedAt type compatibility? 
            // The type says Firestore.Timestamp. Locally we can't easily generate that class without importing firebase.
            // We will store it as object or mocked timestamp if needed, but IDB stores structural clones.
            // For now, let's assume strict typing.
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,

            syncStatus: 'dirty'
        };

        await db.put('journey_events_local', newEvent);

        // Trigger generic sync (non-blocking)
        // Fire and forget, but catch errors to avoid unhandled rejections
        JourneySyncService.sync(event.studentId || newEvent.studentId).catch(err => {
            console.error('[JourneySDK] Background Sync Trigger Failed:', err);
        });
    }
};
