
import { db } from './firebaseConfig';
import {
    GrowthMirrorDelta, DeltaSignal, ContextLevel, UnderstandingContext, HeadlineKey
} from '../types';
import { logger } from '../utils/logger';
import firebase from 'firebase/compat/app';

/**
 * GROWTH MIRROR V2 SERVICE
 * 
 * Architecture: Delta-Only + Context + Pattern
 * Responsibility: Compute change metrics without exposing absolute numbers.
 */

// ==================== PUBLIC API ====================

export const generateGrowthMirrorDelta = async (studentId: string): Promise<GrowthMirrorDelta | null> => {
    logger.module(`[GROWTH_MIRROR] Starting delta aggregation for ${studentId}`);

    try {
        // 1. Fetch Window Data (Last 14 Days) & User Profile
        const [{ currentWindow, previousWindow }, userDoc] = await Promise.all([
            fetchComparisonWindows(studentId),
            db.collection('users').doc(studentId).get()
        ]);

        const userProfile = userDoc.data();
        const enrolledSubjects = userProfile?.subjects || [];

        // 2. Compute Core Signals
        const consistency = computeConsistencySignal(currentWindow, previousWindow);
        const understanding = computeUnderstandingSignal(currentWindow, previousWindow);
        const confidence = computeConfidenceSignal(currentWindow, previousWindow);

        // 3. Detect Meta Patterns
        const meta = detectMetaPatterns(currentWindow, previousWindow, consistency);

        // 4. Detect Subject Momentum
        const subjects = detectSubjectMomentum(currentWindow, previousWindow, enrolledSubjects);

        // 5. Derive Headline Archetype
        const headlineKey = detectPatternArchetype(consistency, understanding, meta, subjects);

        const delta: GrowthMirrorDelta = {
            studentId,
            period: 'WEEK',
            comparedTo: 'PREVIOUS_WEEK',
            generatedAt: new Date().toISOString(),
            deltas: {
                consistency: consistency.signal,
                consistency_context: consistency.context,
                understanding: understanding.signal,
                understanding_context: understanding.context,
                confidence: confidence.signal
            },
            subjects,
            meta,
            headlineKey
        };

        // 6. Persist
        await saveGrowthMirrorDelta(delta);

        // 🧠 ANTIGRAVITY RADAR TRIGGER
        // Rebuild radar as confidence signals may have changed
        try {
            const { rebuildRadar } = await import('./radarSnapshotBuilder');
            await rebuildRadar(studentId);
        } catch (radarError) {
            logger.error('INGESTION', `[RADAR_TRIGGER_FAIL] Could not rebuild radar after growth delta: ${radarError}`);
        }

        return delta;

    } catch (e: any) {
        logger.error('INGESTION', `[GROWTH_MIRROR] Aggregation failed`, e);
        return null;
    }
};

export const getLatestGrowthMirrorDelta = async (studentId: string): Promise<GrowthMirrorDelta | null> => {
    try {
        const docId = `${studentId}_WEEK`;
        const doc = await db.collection('student_growth_mirror_delta').doc(docId).get();
        if (doc.exists) {
            const data = doc.data() as GrowthMirrorDelta;
            // Self-healing: If subjects are missing/empty, regenerate immediately using new logic
            if (!data.subjects || Object.keys(data.subjects).length === 0) {
                logger.module(`[GROWTH_MIRROR] Stale data detected (no subjects). Regenerating...`);
                return await generateGrowthMirrorDelta(studentId);
            }
            return data;
        }
        return null;
    } catch (e) {
        logger.error('INGESTION', `[GROWTH_MIRROR] Fetch failed`, e);
        return null;
    }
};

// ==================== INTERNAL HELPERS ====================

interface WindowMetrics {
    activeDays: number;
    totalSessions: number;
    avgMastery: number;
    avgTimePerQuestion: number;
    totalAttempts: number;
    maxDifficultyBySubject: Record<string, number>;
    gapDays: number; // Max gap in days
}

const fetchComparisonWindows = async (studentId: string): Promise<{ currentWindow: WindowMetrics, previousWindow: WindowMetrics }> => {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    const startOfCurrent = now - oneWeekMs;
    const startOfPrevious = now - twoWeeksMs;

    // Fetch last 14 days of events
    const snap = await db.collection('telemetry_events')
        .where('studentId', '==', studentId)
        .where('timestamp', '>=', new Date(startOfPrevious).toISOString())
        .orderBy('timestamp', 'asc')
        .get();

    const allEvents = snap.docs.map(d => ({ ...d.data(), timestamp: new Date(d.data().timestamp).getTime() }));

    const currentEvents = allEvents.filter(e => e.timestamp >= startOfCurrent);
    const previousEvents = allEvents.filter(e => e.timestamp < startOfCurrent);

    return {
        currentWindow: calculateWindowMetrics(currentEvents),
        previousWindow: calculateWindowMetrics(previousEvents)
    };
};

const calculateWindowMetrics = (events: any[]): WindowMetrics => {
    if (events.length === 0) {
        return { activeDays: 0, totalSessions: 0, avgMastery: 0, avgTimePerQuestion: 0, totalAttempts: 0, maxDifficultyBySubject: {}, gapDays: 0 };
    }

    const activeDays = new Set(events.map(e => new Date(e.timestamp).toDateString())).size;

    // Gap Days Calculation
    let gapDays = 0;
    if (events.length > 1) {
        let maxGap = 0;
        for (let i = 1; i < events.length; i++) {
            const diff = events[i].timestamp - events[i - 1].timestamp;
            const diffDays = diff / (24 * 60 * 60 * 1000);
            if (diffDays > maxGap) maxGap = diffDays;
        }
        gapDays = Math.round(maxGap);
    }

    let totalScorePct = 0;
    let validScoreCount = 0;
    let totalTime = 0;
    let totalQuestions = 0;
    const maxDiff: Record<string, number> = {};

    events.forEach(e => {
        const p = e.payload || {};

        // Mastery
        if (typeof p.score === 'number' && typeof p.total === 'number' && p.total > 0) {
            totalScorePct += (p.score / p.total) * 100;
            validScoreCount++;
            totalQuestions += p.total;
        }

        // Time
        if (typeof p.timeSpent === 'number') {
            totalTime += p.timeSpent; // Assumed in seconds
        }

        // Max Difficulty (Frontier)
        const sub = p.metadata?.subject || 'General';
        const diff = p.metadata?.difficultyLevel || 0; // Assuming 1-10 or similar scale
        if (diff > (maxDiff[sub] || 0)) {
            maxDiff[sub] = diff;
        }
    });

    return {
        activeDays,
        totalSessions: events.length,
        avgMastery: validScoreCount > 0 ? totalScorePct / validScoreCount : 0,
        avgTimePerQuestion: totalQuestions > 0 ? totalTime / totalQuestions : 0,
        totalAttempts: totalQuestions,
        maxDifficultyBySubject: maxDiff,
        gapDays
    };
};

const computeConsistencySignal = (current: WindowMetrics, previous: WindowMetrics): { signal: DeltaSignal, context: ContextLevel } => {
    let signal: DeltaSignal = 'SAME';
    if (current.activeDays > previous.activeDays) signal = 'UP';
    else if (current.activeDays < previous.activeDays) signal = 'DOWN';

    let context: ContextLevel = 'MID';
    if (current.activeDays >= 5) context = 'HIGH';
    else if (current.activeDays <= 1) context = 'LOW';

    return { signal, context };
};

const computeUnderstandingSignal = (current: WindowMetrics, previous: WindowMetrics): { signal: DeltaSignal, context: UnderstandingContext } => {
    let signal: DeltaSignal = 'SAME';
    // Use a 5% buffer for significance
    if (current.avgMastery > previous.avgMastery + 5) signal = 'UP';
    else if (current.avgMastery < previous.avgMastery - 5) signal = 'DOWN';

    let context: UnderstandingContext = 'STEADY';

    // RUSHING DETECTOR: Time dropped significanty (< 15s avg) AND mastery is low/dropping
    if (current.avgTimePerQuestion < 15 && signal === 'DOWN') {
        context = 'RUSHING';
    }
    // CAREFUL DETECTOR: Taking time (> 45s avg) even if score is steady
    else if (current.avgTimePerQuestion > 45) {
        context = 'CAREFUL';
    }

    return { signal, context };
};

const computeConfidenceSignal = (current: WindowMetrics, previous: WindowMetrics): { signal: DeltaSignal } => {
    let signal: DeltaSignal = 'SAME';
    // Faster average time usually implies confidence, but too fast is rushing (handled in understanding)
    if (current.avgTimePerQuestion < previous.avgTimePerQuestion - 5) signal = 'UP';
    else if (current.avgTimePerQuestion > previous.avgTimePerQuestion + 5) signal = 'DOWN';
    return { signal };
};

const detectMetaPatterns = (current: WindowMetrics, previous: WindowMetrics, consistency: { signal: DeltaSignal }) => {
    // Recharging: Short gap after a strong previous week
    const isRecharging = current.gapDays <= 2 && previous.activeDays >= 5 && consistency.signal === 'DOWN';

    // Frontier Breached: Reached higher difficulty in any subject
    const frontierBreached: string[] = [];
    for (const sub in current.maxDifficultyBySubject) {
        const currMax = current.maxDifficultyBySubject[sub] || 0;
        const prevMax = previous.maxDifficultyBySubject[sub] || 0;
        // Logic: Strictly if current max > historical max (represented here by previous window for delta, 
        // ideally should be all-time but v2 spec implies relative to previous for the "breach" signal this week)
        if (currMax > prevMax) {
            frontierBreached.push(sub.toLowerCase());
        }
    }

    return { isRecharging, frontierBreached };
};

const detectSubjectMomentum = (
    current: WindowMetrics,
    previous: WindowMetrics,
    enrolledSubjects: string[]
): Record<string, 'FORWARD' | 'STABLE' | 'BACKWARD'> => {
    const subjects: Record<string, 'FORWARD' | 'STABLE' | 'BACKWARD'> = {};

    // Use dynamic enrolled subjects from profile, fallback to Core Subjects if empty
    const CORE_SUBJECTS = ['Math', 'Science', 'English', 'Arabic', 'ICT'];
    const dynamicSubjects = enrolledSubjects.length > 0 ? enrolledSubjects : CORE_SUBJECTS;

    // Iterate over union of detected subjects + enrolled subjects
    const allSubs = new Set([
        ...Object.keys(current.maxDifficultyBySubject),
        ...Object.keys(previous.maxDifficultyBySubject),
        ...dynamicSubjects
    ]);

    allSubs.forEach(sub => {
        const currMax = current.maxDifficultyBySubject[sub] || 0;
        const prevMax = previous.maxDifficultyBySubject[sub] || 0;
        const hasActivity = (current.maxDifficultyBySubject[sub] !== undefined);

        // Minimal Safe Rules (v2)
        // Normalize key for output to match UI expectations (Option A)
        const outputKey = sub.toLowerCase();

        // Minimal Safe Rules (v2)
        if (currMax > prevMax) {
            subjects[outputKey] = 'FORWARD'; // Frontier breached OR higher difficulty touched
        } else if (hasActivity) {
            subjects[outputKey] = 'STABLE'; // Subject activity exists but no frontier change
        } else if (currMax < prevMax) {
            subjects[outputKey] = 'BACKWARD'; // Clear regression signal
        } else {
            // Fallback for enrolled subjects with no activity in either window:
            subjects[outputKey] = 'STABLE';
        }
    });

    return subjects;
};

const detectPatternArchetype = (
    consistency: { signal: DeltaSignal, context: ContextLevel },
    understanding: { signal: DeltaSignal, context: UnderstandingContext },
    meta: { isRecharging: boolean, frontierBreached: string[] },
    subjects: Record<string, string>
): HeadlineKey => {

    // 1. Recharging Pause (Highest Priority)
    if (meta.isRecharging) return 'RECHARGING_PAUSE';

    // 2. Efficiency Mode
    // consistency = DOWN && understanding = UP
    if (consistency.signal === 'DOWN' && understanding.signal === 'UP') return 'EFFICIENCY_DETECTED';

    // 3. Rushing Trap (Need Focus)
    // consistency = UP && understanding = DOWN && understanding_context = RUSHING
    if (consistency.signal === 'UP' && understanding.signal === 'DOWN' && understanding.context === 'RUSHING') return 'NEED_FOCUS';

    // 4. Frontier Breach (New Territory)
    if (meta.frontierBreached.length > 0) return 'NEW_TERRITORY';

    // Fallbacks based on Consistency Context
    if (consistency.signal === 'SAME') {
        if (consistency.context === 'HIGH') return 'UNSTOPPABLE_RHYTHM';
        if (consistency.context === 'LOW') return 'QUIET_WEEK';
        return 'STEADY_ROUTINE';
    }

    if (consistency.signal === 'UP') return 'CONSISTENCY_BUILDING';

    return 'STEADY_ROUTINE';
};

const saveGrowthMirrorDelta = async (delta: GrowthMirrorDelta) => {
    const docId = `${delta.studentId}_${delta.period}`;
    await db.collection('student_growth_mirror_delta').doc(docId).set(delta);
    logger.db(`[GROWTH_MIRROR] Saved delta for ${delta.studentId}`);
};
