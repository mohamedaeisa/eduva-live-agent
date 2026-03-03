/**
 * LIS Growth Timeline Hook
 * 
 * PURPOSE: Fetch and format growth timeline for Journey/Growth Mirror UI.
 * 
 * ⚠️ NO CALCULATIONS — reads precomputed timeline only
 */

import { useState, useEffect } from 'react';
import { getGrowthTimeline, normalizeSubject } from '../services/lisSnapshotReader';
import type { GrowthTimeline } from '../services/lis/types';
import { logger } from '../utils/logger';

export interface GrowthTimelineUIData {
    // Daily history (for line charts)
    dailySnapshots: Array<{
        date: string; // YYYY-MM-DD
        mastery: number;
        coverage: number;
        health: number;
        studyTimeSec: number;
        questionsAnswered: number;
    }>;

    // Weekly aggregates (for trends)
    weeklyAggregates: Array<{
        weekStart: string; // YYYY-MM-DD (Monday)
        avgMastery: number;
        avgCoverage: number;
        totalStudyTime: string; // Formatted
        totalQuestions: number;
        daysActive: number;
    }>;

    // Summary stats
    totalDays: number;
    totalWeeks: number;
    latestHealth: number;
    latestTrend: string;
}

export function useGrowthTimeline(
    studentId: string,
    subject: string
) {
    const [data, setData] = useState<GrowthTimelineUIData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchTimeline = async () => {
            setLoading(true);
            setError(null);

            try {
                const normalizedSubject = normalizeSubject(subject);
                logger.orchestrator(`[LIS_UI] Fetching growth timeline: ${normalizedSubject}`);

                const timeline = await getGrowthTimeline(studentId, normalizedSubject);

                if (!timeline) {
                    if (isMounted) {
                        setError('No growth history available yet.');
                        setLoading(false);
                    }
                    return;
                }

                // Format timeline for UI (pure projection)
                const uiData: GrowthTimelineUIData = {
                    dailySnapshots: timeline.dailySnapshots,

                    weeklyAggregates: timeline.weeklyAggregates.map(w => ({
                        ...w,
                        totalStudyTime: formatStudyTime(w.totalStudyTimeSec),
                    })),

                    totalDays: timeline.dailySnapshots.length,
                    totalWeeks: timeline.weeklyAggregates.length,
                    latestHealth: timeline.dailySnapshots[timeline.dailySnapshots.length - 1]?.health ?? 0,
                    latestTrend: 'Steady', // Would come from subject_health in full implementation
                };

                if (isMounted) {
                    setData(uiData);
                    setLoading(false);
                    logger.orchestrator(`[LIS_UI] Timeline loaded: ${uiData.totalDays} days`);
                }
            } catch (err: any) {
                if (isMounted) {
                    logger.error('STATE', '[LIS_UI] Failed to fetch growth timeline', err);
                    setError(err.message || 'Failed to load growth history');
                    setLoading(false);
                }
            }
        };

        fetchTimeline();

        return () => {
            isMounted = false;
        };
    }, [studentId, subject]);

    return { data, loading, error };
}

// ==================== HELPERS ====================

function formatStudyTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}
