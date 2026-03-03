/**
 * LIS-Powered Compass Hook
 * 
 * PURPOSE: Fetch and format LIS compass snapshot for UI consumption.
 * 
 * ⚠️ NO CALCULATIONS — reads precomputed snapshots only
 */

import { useState, useEffect } from 'react';
import { getCompassSnapshot, normalizeSubject } from '../services/lisSnapshotReader';
import type { CompassSnapshot } from '../services/lis/types';
import { logger } from '../utils/logger';

export interface CompassUIData {
    // Top-level metrics (from snapshot)
    contentCoverage: number;
    learningProgress: number;
    healthScore: number;
    healthStatus: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
    trendLabel: string;
    totalStudyTime: string; // Formatted
    weakAtomsCount: number; // Raw count for UI card

    // Material breakdown
    materials: Array<{
        materialId: string;
        materialName: string;
        materialType: 'PDF' | 'VIDEO' | 'LESSON' | 'UNKNOWN';
        coveragePercent: number;
        masteryPercent: number;
        atoms: Array<{
            atomId: string;
            conceptTag: string;
            mastery: number;
            masteryLevel: 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNKNOWN';
            stability: number;
        }>;
    }>;

    // Radar signals
    radarSignals: Array<{
        type: string;
        priority: string;
        title: string;
        description: string;
        actionLabel: string;
    }>;

    // Recommended action
    recommendedAction: {
        type: string;
        label: string;
        rationale: string;
    };

    // Weak clusters
    weakClusters: Array<{
        topic: string;
        avgMastery: number;
        atomCount: number;
    }>;
}

export function useCompassSnapshot(
    studentId: string,
    subject: string
) {
    const [data, setData] = useState<CompassUIData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchSnapshot = async () => {
            setLoading(true);
            setError(null);

            try {
                const normalizedSubject = normalizeSubject(subject);
                logger.orchestrator(`[LIS_UI] Fetching compass snapshot: ${normalizedSubject}`);

                const snapshot = await getCompassSnapshot(studentId, normalizedSubject);

                if (!snapshot) {
                    if (isMounted) {
                        setError('No learning data available yet. Complete a quiz to see your progress.');
                        setLoading(false);
                    }
                    return;
                }

                // Format snapshot for UI (pure projection, no calculation)
                const uiData: CompassUIData = {
                    contentCoverage: snapshot.contentCoverage,
                    learningProgress: snapshot.learningProgress,
                    healthScore: snapshot.healthScore,
                    healthStatus: snapshot.healthStatus,
                    trendLabel: formatTrendLabel(snapshot.trendClassification),
                    totalStudyTime: formatStudyTime(snapshot.totalStudyTimeSec),
                    weakAtomsCount: snapshot.weakAtoms ?? 0,

                    materials: snapshot.materials,
                    radarSignals: snapshot.radarSignals,
                    recommendedAction: snapshot.recommendedAction,

                    weakClusters: snapshot.weakClusters.map(c => ({
                        topic: c.topic,
                        avgMastery: c.avgMastery,
                        atomCount: c.atomIds.length,
                    })),
                };

                if (isMounted) {
                    setData(uiData);
                    setLoading(false);
                    logger.orchestrator(`[LIS_UI] Snapshot loaded: ${snapshot.materials.length} materials`);
                }
            } catch (err: any) {
                if (isMounted) {
                    logger.error('STATE', '[LIS_UI] Failed to fetch compass snapshot', err);
                    setError(err.message || 'Failed to load learning data');
                    setLoading(false);
                }
            }
        };

        fetchSnapshot();

        return () => {
            isMounted = false;
        };
    }, [studentId, subject]);

    return { data, loading, error };
}

// ==================== FORMATTING HELPERS ====================

function formatTrendLabel(trend: 'improving' | 'stable' | 'at_risk'): string {
    switch (trend) {
        case 'improving': return 'Improving ↗';
        case 'stable': return 'Steady →';
        case 'at_risk': return 'Needs Attention ↘';
    }
}

function formatStudyTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}
