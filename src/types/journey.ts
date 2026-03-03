
import { Timestamp } from 'firebase/firestore';

export type JourneyEventType = 'quiz' | 'exam' | 'study' | 'notes' | 'class';
export type JourneyEventSource = 'compass' | 'adaptive' | 'class' | 'library';
export type JourneySyncStatus = 'synced' | 'dirty';

export interface JourneyEvent {
    id: string;                    // UUID (stable)
    studentId: string;

    date: string;                  // YYYY-MM-DD
    startAt: number;               // Epoch Milliseconds
    endAt: number;                 // Epoch Milliseconds
    durationMin: number;

    type: JourneyEventType;
    subjectId: string;
    title: string;
    source: JourneyEventSource;
    refId: string;                 // quizId | contentId | classId

    metrics: Record<string, any>;   // type-specific metrics, e.g. { scorePercent, correct, total, timeTakenMin }

    version: number;               // monotonic counter per student
    updatedAt: Timestamp;          // serverTimestamp (global)

    // Local-only field, never written to Firestore
    syncStatus?: JourneySyncStatus;
}

export interface JourneySyncState {
    lastVersion: number;
    lastUpdatedAt: Timestamp;
}

export interface JourneySyncStateLocal {
    studentId: string;
    lastKnownVersion: number;
    lastSyncedAt: number;
}
