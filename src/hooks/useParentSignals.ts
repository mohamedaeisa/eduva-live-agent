/**
 * LIS Parent Signals Hook
 * 
 * PURPOSE: Fetch and format parent signals for Parent View UI.
 * 
 * ⚠️ NO RAW METRICS — only interpreted signals
 */

import { useState, useEffect } from 'react';
import { getParentSignals } from '../services/lisSnapshotReader';
import type { ParentSignals } from '../services/lis/types';
import { logger } from '../utils/logger';

export interface ParentSignalsUIData {
    // Overall status
    overallStatus: {
        label: string;
        emoji: string;
        trendLabel: string;
    };

    // Subject insights (prioritized)
    subjects: Array<{
        name: string;
        status: 'GREEN' | 'YELLOW' | 'RED';
        insight: string;
        recommendation: string;
    }>;

    // Engagement summary
    engagement: {
        weeklyStudyTime: string;
        consistencyLabel: string;
        trendLabel: string;
    };

    // Alerts requiring attention
    alerts: Array<{
        severity: 'CRITICAL' | 'WARNING' | 'INFO';
        message: string;
        suggestedAction: string;
    }>;

    // Recent wins (positive reinforcement)
    recentWins: Array<{
        subject: string;
        achievement: string;
        timestamp: number;
    }>;

    generatedAt: number;
}

export function useParentSignals(parentId: string) {
    const [data, setData] = useState<ParentSignalsUIData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchSignals = async () => {
            setLoading(true);
            setError(null);

            try {
                logger.orchestrator(`[LIS_UI] Fetching parent signals: ${parentId}`);

                const signals = await getParentSignals(parentId);

                if (!signals) {
                    if (isMounted) {
                        setError('No student data available yet.');
                        setLoading(false);
                    }
                    return;
                }

                // Format signals for UI (already interpreted by LIS)
                const uiData: ParentSignalsUIData = {
                    overallStatus: signals.overallStatus,
                    subjects: signals.subjects,
                    engagement: signals.engagement,
                    alerts: signals.alerts.map(a => ({
                        ...a,
                        suggestedAction: a.suggestedAction || 'Review this with your child'
                    })),
                    recentWins: signals.recentWins,
                    generatedAt: signals.generatedAt,
                };

                if (isMounted) {
                    setData(uiData);
                    setLoading(false);
                    logger.orchestrator(`[LIS_UI] Parent signals loaded: ${uiData.subjects.length} subjects`);
                }
            } catch (err: any) {
                if (isMounted) {
                    logger.error('STATE', '[LIS_UI] Failed to fetch parent signals', err);
                    setError(err.message || 'Failed to load student overview');
                    setLoading(false);
                }
            }
        };

        fetchSignals();

        return () => {
            isMounted = false;
        };
    }, [parentId]);

    return { data, loading, error };
}
