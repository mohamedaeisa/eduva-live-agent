/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Growth Timeline Builder
 * 
 * PURPOSE: Maintain longitudinal history for trend explanations.
 * 
 * ⚠️ NO FORMULAS — only appending snapshots
 * ⚠️ Triggered by compass builder, NOT by UI
 */

import { db } from '../firebaseConfig';
import type { SubjectHealth, GrowthTimeline, DailySnapshot, WeeklyAggregate } from './types';
import {
    GROWTH_TIMELINE_DAILY_WINDOW,
    GROWTH_TIMELINE_WEEKLY_WINDOW,
    LIS_SCHEMA_VERSION,
} from './constants';

// ==================== TIMELINE UPDATE ====================

/**
 * Updates growth timeline with current subject health.
 * 
 * Appends daily snapshot and recalculates weekly aggregates.
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID
 * @param health - Current subject health (pre-calculated)
 */
export async function updateGrowthTimeline(
    studentId: string,
    subjectId: string,
    health: SubjectHealth
): Promise<void> {
    const docId = `${studentId}_${subjectId}`;
    const docRef = db.collection('student_growth_timeline').doc(docId);

    // Fetch existing timeline
    const doc = await docRef.get();
    let timeline: GrowthTimeline;

    if (!doc.exists) {
        timeline = createInitialTimeline(studentId, subjectId);
    } else {
        timeline = doc.data() as GrowthTimeline;
    }

    // ========== ADD/UPDATE DAILY SNAPSHOT ==========

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const newSnapshot: DailySnapshot = {
        date: today,
        mastery: health.subjectMastery,
        coverage: health.coverage,
        stability: health.stability,
        health: health.health,
        studyTimeSec: health.totalStudyTimeSec,
        questionsAnswered: health.totalAtoms, // Proxy for activity
    };

    // Check if today already has a snapshot
    const existingIndex = timeline.dailySnapshots.findIndex(s => s.date === today);

    if (existingIndex >= 0) {
        // Update existing snapshot
        timeline.dailySnapshots[existingIndex] = newSnapshot;
    } else {
        // Append new snapshot
        timeline.dailySnapshots.push(newSnapshot);

        // Maintain rolling window (last N days)
        if (timeline.dailySnapshots.length > GROWTH_TIMELINE_DAILY_WINDOW) {
            timeline.dailySnapshots = timeline.dailySnapshots.slice(-GROWTH_TIMELINE_DAILY_WINDOW);
        }
    }

    // Sort by date (newest last)
    timeline.dailySnapshots.sort((a, b) => a.date.localeCompare(b.date));

    // ========== RECALCULATE WEEKLY AGGREGATES ==========

    timeline.weeklyAggregates = calculateWeeklyAggregates(timeline.dailySnapshots);

    // ========== SAVE ==========

    await docRef.set(timeline);

    console.log(`[LIS_TIMELINE] Timeline updated: ${timeline.dailySnapshots.length} days, ${timeline.weeklyAggregates.length} weeks`);

    // ========== TRIGGER PARENT SIGNALS ==========

    const { propagateParentSignals } = await import('./parentPropagator');
    await propagateParentSignals(studentId);
}

// ==================== EVENT LOGGING ====================

/**
 * Logs a GRANULAR event to the timeline (for History Screen).
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID
 * @param type - Event type (e.g. 'RESOURCE_STUDIED')
 * @param label - Human readable label
 * @param metadata - Optional metadata
 */
export async function logTimelineEvent(
    studentId: string,
    subjectId: string,
    type: string, // Typed as TimelineEventType but kept string for flexibility
    label: string,
    metadata?: Record<string, any>
): Promise<void> {
    const docId = `${studentId}_${subjectId}`;
    const docRef = db.collection('student_growth_timeline').doc(docId);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            // If timeline doesn't exist, create it (lazy initialization)
            const timeline = doc.exists
                ? (doc.data() as GrowthTimeline)
                : createInitialTimeline(studentId, subjectId);

            const events = timeline.timelineEvents || [];

            events.push({
                id: crypto.randomUUID(),
                type: type as any,
                timestamp: Date.now(),
                label,
                metadata
            });

            // Keep last 100 events
            const recentEvents = events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);

            // Ensure schema version is updated
            timeline.timelineEvents = recentEvents;

            t.set(docRef, timeline, { merge: true });
        });
        console.log(`[LIS_TIMELINE] Logged event: ${type}`);
    } catch (e) {
        console.error(`[LIS_TIMELINE] Failed to log event`, e);
    }
}

// ==================== WEEKLY AGGREGATION (PROJECTION) ====================

/**
 * Calculates weekly aggregates from daily snapshots.
 * 
 * Groups by week (Monday start) and averages.
 */
function calculateWeeklyAggregates(dailySnapshots: DailySnapshot[]): WeeklyAggregate[] {
    if (dailySnapshots.length === 0) return [];

    // Group by week
    const weekMap = new Map<string, DailySnapshot[]>();

    for (const snapshot of dailySnapshots) {
        const date = new Date(snapshot.date);
        const weekStart = getWeekStart(date);

        if (!weekMap.has(weekStart)) {
            weekMap.set(weekStart, []);
        }
        weekMap.get(weekStart)!.push(snapshot);
    }

    // Calculate aggregates per week
    const aggregates: WeeklyAggregate[] = [];

    for (const [weekStart, snapshots] of weekMap.entries()) {
        const avgMastery = Math.round(
            snapshots.reduce((sum, s) => sum + s.mastery, 0) / snapshots.length
        );

        const avgCoverage = Math.round(
            snapshots.reduce((sum, s) => sum + s.coverage, 0) / snapshots.length
        );

        const totalStudyTimeSec = snapshots.reduce((sum, s) => sum + s.studyTimeSec, 0);
        const totalQuestions = snapshots.reduce((sum, s) => sum + s.questionsAnswered, 0);

        aggregates.push({
            weekStart,
            avgMastery,
            avgCoverage,
            totalStudyTimeSec,
            totalQuestions,
            daysActive: snapshots.length,
        });
    }

    // Sort by week (newest last)
    aggregates.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    // Maintain rolling window (last N weeks)
    return aggregates.slice(-GROWTH_TIMELINE_WEEKLY_WINDOW);
}

// ==================== HELPERS ====================

function createInitialTimeline(studentId: string, subjectId: string): GrowthTimeline {
    return {
        studentId,
        subjectId,
        dailySnapshots: [],
        weeklyAggregates: [],
        timelineEvents: [], // Initialize empty
        schemaVersion: LIS_SCHEMA_VERSION,
    };
}

/**
 * Gets Monday of the week containing the given date.
 */
function getWeekStart(date: Date): string {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(date.getFullYear(), date.getMonth(), diff);
    return monday.toISOString().split('T')[0];
}
