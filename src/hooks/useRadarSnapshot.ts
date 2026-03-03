import { useState, useEffect } from 'react';
import { db } from '../services/firebaseConfig';
import { StudentRadarSnapshot } from '../types/radar';
import { logger } from '../utils/logger';

/**
 * HOOK: useRadarSnapshot
 * 
 * PURPOSE: Real-time subscription to the student_radar_snapshot collection.
 * This ensures the Radar UI always reflects the latest LIS strategy decisions.
 * 
 * @param studentId 
 * @returns 
 */
export function useRadarSnapshot(studentId: string) {
    const [snapshot, setSnapshot] = useState<StudentRadarSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!studentId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const docRef = db.collection('student_radar_snapshot').doc(studentId);

        const unsubscribe = docRef.onSnapshot(
            (doc) => {
                if (doc.exists) {
                    const data = doc.data() as StudentRadarSnapshot;
                    setSnapshot(data);
                    logger.db(`[RADAR_HOOK] Received snapshot update for ${studentId}`, data.strategyOfTheDay);
                } else {
                    logger.warn('DB', `[RADAR_HOOK] No snapshot found for ${studentId}`);
                    setSnapshot(null);
                }
                setLoading(false);
            },
            (err) => {
                logger.error('DB', `[RADAR_HOOK] Subscription error for ${studentId}`, err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [studentId]);

    return { snapshot, loading, error };
}
