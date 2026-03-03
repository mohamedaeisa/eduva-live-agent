/**
 * EDUVA PARENT DATA SERVICE
 * 
 * READ-ONLY service for parent screens (Screens 1, 2, 3).
 * NO computation, NO AI calls, NO aggregation.
 * Pure data retrieval from pre-computed parent_* collections.
 */

import { db } from './firebaseConfig';
import {
    ParentStudentOverview,
    ParentSubjectOverview,
    ParentSubjectProgressReport
} from '../types/parentAggregation';
import { logger } from '../utils/logger';

/**
 * Get Overall Student Overview (Screen 1 data)
 * @param parentId - Parent's user ID
 * @param studentId - Student's user ID
 * @returns Pre-aggregated overview or null if not yet generated
 */
export const getStudentOverview = async (
    parentId: string,
    studentId: string
): Promise<ParentStudentOverview | null> => {
    try {
        const doc = await db.collection('parent_student_overview')
            .doc(`${parentId}_${studentId}`)
            .get();

        if (!doc.exists) {
            logger.db(`[PARENT_DATA] No overview found for ${parentId}_${studentId}`);
            return null;
        }

        return doc.data() as ParentStudentOverview;
    } catch (e) {
        logger.error('STATE', '[PARENT_DATA] Failed to fetch student overview', e);
        return null;
    }
};

/**
 * Get All Subject Overviews for a Student (Screen 2 data)
 * @param parentId - Parent's user ID
 * @param studentId - Student's user ID
 * @returns Array of subject overviews
 */
export const getSubjectOverviews = async (
    parentId: string,
    studentId: string
): Promise<ParentSubjectOverview[]> => {
    try {
        const snap = await db.collection('parent_subject_overview')
            .where('parentId', '==', parentId)
            .where('studentId', '==', studentId)
            .get();

        const overviews = snap.docs.map(d => d.data() as ParentSubjectOverview);

        logger.db(`[PARENT_DATA] Found ${overviews.length} subject overviews`);
        return overviews;
    } catch (e) {
        logger.error('STATE', '[PARENT_DATA] Failed to fetch subject overviews', e);
        return [];
    }
};

/**
 * Get Subject Progress Report (Screen 3 data)
 * @param parentId - Parent's user ID
 * @param studentId - Student's user ID
 * @param subject - Normalized subject name
 * @returns Pre-aggregated progress report or null
 */
export const getSubjectProgressReport = async (
    parentId: string,
    studentId: string,
    subject: string
): Promise<ParentSubjectProgressReport | null> => {
    try {
        const doc = await db.collection('parent_subject_progress_report')
            .doc(`${parentId}_${studentId}_${subject}`)
            .get();

        if (!doc.exists) {
            logger.db(`[PARENT_DATA] No progress report for ${subject}`);
            return null;
        }

        return doc.data() as ParentSubjectProgressReport;
    } catch (e) {
        logger.error('STATE', '[PARENT_DATA] Failed to fetch progress report', e);
        return null;
    }
};

/**
 * Subscribe to Student Overview changes (real-time)
 * Use for instant updates when student completes activity
 */
export const subscribeToStudentOverview = (
    parentId: string,
    studentId: string,
    callback: (overview: ParentStudentOverview | null) => void
): (() => void) => {
    const unsubscribe = db.collection('parent_student_overview')
        .doc(`${parentId}_${studentId}`)
        .onSnapshot(
            doc => {
                if (doc.exists) {
                    callback(doc.data() as ParentStudentOverview);
                } else {
                    callback(null);
                }
            },
            error => {
                logger.error('STATE', '[PARENT_DATA] Subscription error', error);
                callback(null);
            }
        );

    return unsubscribe;
};

/**
 * Subscribe to Subject Overviews changes (real-time)
 */
export const subscribeToSubjectOverviews = (
    parentId: string,
    studentId: string,
    callback: (overviews: ParentSubjectOverview[]) => void
): (() => void) => {
    const unsubscribe = db.collection('parent_subject_overview')
        .where('parentId', '==', parentId)
        .where('studentId', '==', studentId)
        .onSnapshot(
            snap => {
                const overviews = snap.docs.map(d => d.data() as ParentSubjectOverview);
                callback(overviews);
            },
            error => {
                logger.error('STATE', '[PARENT_DATA] Subscription error', error);
                callback([]);
            }
        );

    return unsubscribe;
};
