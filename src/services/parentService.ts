

import { db } from './firebaseConfig';
import { 
  ParentProfile, ParentPreferences, ProgressSignal, 
  ParentFeedEvent, ParentNudge, CoverageRule, ParentWallet, UserProfile, AuthorityLevel,
  RawActivityEvent, SignalType, AIExplanation, UpgradeRecommendation, ParentActionType, 
  TopicMetric, Comment, SubjectHealthState, SubjectHealthEvidence, ParentSignal, 
  Difficulty, AIDecisionTrace, MasteryMission, ParentDailyBrief, ParentReward, InteractionState
} from '../types';
import { 
    generateBehavioralExplanation, 
    generateTacticalRecommendation,
    generateDecisionReasoning,
    generateDailyConversationalBrief,
    generateEscalationMessage
} from './ai/parentAiService';
import firebase from 'firebase/compat/app';
import { evaluateSubjectHealth } from './decisionService';
import { UCCSManager } from '../uccs/UCCSManager';
import { getDB } from './idbService';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { sendTelemetry } from './telemetryBrainService';

export interface WeeklyReport {
    period: string;
    totalTimeMins: number;
    tasksCompleted: number;
    topSubject: string;
    struggleSubject: string;
    masteryChange: number;
    insights: string[];
}

const getWeekNumber = (date: Date) => {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
};

/**
 * UCCS CORE DATA REFACTOR: 
 * Raw attempts -> Local IDB (Atomic precision)
 * Aggregated signals -> Cloud (student_atom_summary)
 */
export const logRawActivity = async (event: any, shouldEvaluate: boolean = false) => {
    const studentId = event.studentId;
    const normalizedSubject = normalizeSubjectName(event.subject || 'General');

    let resolvedContentId = event.contentId || event.metadata?.contentId || 'GLOBAL';
    const fileName = event.fileName || event.metadata?.fileName || null;

    if (resolvedContentId === 'GLOBAL' && fileName) {
        try {
            const idb = await getDB();
            const allFiles = await idb.getAll('files');
            const matchedFile = allFiles.find(f => f.filename === fileName && f.userId === studentId) ||
                              allFiles.find(f => f.filename.includes(fileName) && f.userId === studentId);
            if (matchedFile) resolvedContentId = matchedFile.contentId;
        } catch (err) {
            console.warn("[UCCS_SHIELD] Resolution FAULT:", err);
        }
    }

    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const fullEvent: RawActivityEvent = {
        ...event,
        id: activityId,
        subject: normalizedSubject,
        conceptTag: (event.conceptTag || event.topic || normalizedSubject || 'General Concepts').trim(),
        fileName: fileName,
        contentId: resolvedContentId,
        timestamp: event.timestamp || Date.now()
    };

    try {
        // 1. RAW ATTEMPTS -> IndexedDB (Local persistence)
        const idb = await getDB();
        await idb.put('student_raw_activity', fullEvent);
        console.debug(`[UCCS_LOG] Raw attempt captured locally for ${normalizedSubject}`);

        // 2. TRIGGER AGGREGATION SYNC ON SESSION COMPLETION
        if (shouldEvaluate) {
            console.info(`[UCCS_SYNC] Session terminal. Aggregating signals for ${normalizedSubject}...`);
            
            // Collect recent session attempts from IDB to build the aggregate
            const allActivities = await idb.getAllFromIndex('student_raw_activity', 'by_subject', normalizedSubject);
            // Filter only the recent ones (last 30 mins) for the current session summary
            const recent = allActivities.filter(a => (Date.now() - a.timestamp) < 1800000);
            
            if (recent.length > 0) {
                const totalDuration = recent.reduce((acc, a) => acc + (a.durationMs || 0), 0);
                const score = recent.filter(a => a.isCorrect).length;
                
                await sendTelemetry({
                    userId: studentId,
                    studentId: studentId,
                    module: 'LegacyQuiz',
                    eventType: 'quiz_completed',
                    payload: {
                        quizId: resolvedContentId,
                        atoms: Array.from(new Set(recent.map(a => a.atomId))),
                        score: score,
                        total: recent.length,
                        timeSpent: Math.floor(totalDuration / 1000),
                        metadata: { subject: normalizedSubject }
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error("[UCCS_SYNC] Failed to log raw activity:", e);
    }
};

export const dispatchFixMission = async (
    studentId: string,
    contentId: string,
    topicName: string,
    parentIntent: 'REVISE' | 'FIX',
    struggleAtoms?: string[]
) => {
    const parentId = firebase.auth().currentUser?.uid || 'unknown';
    const currentWeek = getWeekNumber(new Date());
    const isStrategic = struggleAtoms && struggleAtoms.length > 1;
    const safeTopic = topicName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const prefix = isStrategic ? 'rescue' : 'fix';
    const fixMissionId = `${prefix}_${studentId}_${contentId}_${safeTopic}_w${currentWeek}`;

    const nudgeRef = db.collection('parent_nudges').doc(fixMissionId);
    const payload: ParentNudge = {
        id: fixMissionId,
        parentId,
        studentId,
        subject: topicName,
        intent: parentIntent,
        status: 'PENDING',
        interactionState: InteractionState.ISSUED,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        weekNumber: currentWeek,
        metadata: { 
            targetTopic: topicName, 
            contentId: contentId,
            isStrategic: isStrategic,
            struggleAtoms: struggleAtoms || [topicName]
        }
    };

    try {
        await nudgeRef.set(payload, { merge: true });
        return { success: true, id: fixMissionId };
    } catch (error) {
        return { success: false, error };
    }
};

export const resolveNudge = async (nudgeId: string, score?: number, total?: number) => {
    try {
        const nudgeDoc = await db.collection('parent_nudges').doc(nudgeId).get();
        if (!nudgeDoc.exists) return;
        
        const data = nudgeDoc.data() as ParentNudge;
        const percentage = score !== undefined && total !== undefined ? (score / total) * 100 : 0;
        const parentId = data.parentId;
        const parentDoc = await db.collection('parent_profiles').doc(parentId).get();
        const threshold = (parentDoc.data()?.preferences?.foundationRepairThreshold || 0.8) * 100;
        const isMastered = percentage >= threshold;
        
        if (isMastered) {
            // Mastery events are already handled by the completion telemetry signal
        }

        await db.collection('parent_nudges').doc(nudgeId).update({
            status: isMastered ? 'COMPLETED' : 'RETRY', 
            interactionState: InteractionState.COMPLETED,
            completedAt: Date.now(), 
            lastActivityAt: Date.now(),
            resultScore: score, 
            resultTotal: total
        });

        evaluateSubjectHealth(data.studentId, data.subject); 
    } catch (e) {
        console.error("[UCCS_SYNC] Failed to close loop:", e);
    }
};

export const handleParentAction = async (studentId: string, subject: string, action: ParentActionType, topic?: string, metadata?: any, currentHealth?: SubjectHealthState) => {
    if (action === 'FOUNDATION_REPAIR') {
        const contentId = metadata?.contentId || 'GLOBAL';
        let struggleAtoms = [topic || subject];
        let targetTitle = topic || subject;

        if (targetTitle.toLowerCase().includes('generated quiz')) targetTitle = subject;
        
        if (contentId !== 'GLOBAL') {
            const evidence = await getSubjectHealthEvidence(studentId, subject);
            if (evidence?.detailedTopics) {
                const failingInSameFile = evidence.detailedTopics
                    .filter(t => t.contentId === contentId && t.status !== 'GOOD' && t.name.toLowerCase() !== 'generated quiz')
                    .map(t => t.name);
                
                if (failingInSameFile.length > 1) {
                    struggleAtoms = failingInSameFile;
                    targetTitle = `${subject} Rescue`;
                }
            }
        }
        await dispatchFixMission(studentId, contentId, targetTitle, 'FIX', struggleAtoms);
    }
};

export const getFinalPromptModifier = (prefs: ParentPreferences): string => {
    return `[PARENTAL_BEHAVIOR_OVERRIDE] STRICTNESS: ${Math.round(prefs.strictnessLevel * 100)}%, PHILOSOPHY: ${prefs.guidancePhilosophy}`;
};

export const updateMissionInteractionState = async (missionId: string, state: InteractionState, detail?: string) => {
    try {
        const nudgeRef = db.collection('parent_nudges').doc(missionId);
        const update: any = { interactionState: state, lastActivityAt: Date.now() };
        if (state === InteractionState.STUDYING) update.status = 'WORKING';
        await nudgeRef.update(update);
    } catch (e) { console.error("[UCCS_SYNC] State update failed:", e); }
};

export const getDailyConversationalBrief = async (studentId: string, studentName: string): Promise<ParentDailyBrief> => {
    // Aggregates from telemetry_events instead of raw_activity for cloud efficiency
    const end = Date.now();
    const start = end - (24 * 60 * 60 * 1000);
    const snap = await db.collection('telemetry_events')
        .where('studentId', '==', studentId)
        .where('timestamp', '>=', new Date(start).toISOString())
        .get();
    
    // Transform into a simplified event list for the briefing engine
    const events = snap.docs.map(d => {
        const data = d.data();
        return {
            subject: data.payload.metadata?.subject || 'Study',
            actionName: data.module,
            isCorrect: (data.payload.score / data.payload.total) >= 0.7,
            timestamp: new Date(data.timestamp).getTime()
        } as any;
    });

    return await generateDailyConversationalBrief(studentName, events);
};

export const createParentReward = async (reward: Omit<ParentReward, 'id' | 'status' | 'createdAt'>) => {
    await db.collection('parent_rewards').add({ ...reward, status: 'ACTIVE', createdAt: Date.now() });
};

export const getParentRewards = async (parentId: string, studentId: string): Promise<ParentReward[]> => {
    const snap = await db.collection('parent_rewards').where('parentId', '==', parentId).where('studentId', '==', studentId).get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as ParentReward));
};

export const generateWeeklyReport = async (studentId: string): Promise<WeeklyReport> => {
    const end = Date.now();
    const start = end - (7 * 24 * 60 * 60 * 1000);
    
    // Read from decision history and telemetry summaries instead of raw logs
    const historySnap = await db.collection('student_decision_history')
        .where('studentId', '==', studentId)
        .where('lastEvaluatedAt', '>=', start)
        .get();
        
    const telemetrySnap = await db.collection('telemetry_events')
        .where('studentId', '==', studentId)
        .where('timestamp', '>=', new Date(start).toISOString())
        .get();

    const summaries = telemetrySnap.docs.map(d => d.data());
    
    const totalTimeMins = summaries.reduce((acc, s) => acc + (s.payload.timeSpent || 0), 0) / 60;
    const tasksCompleted = summaries.length;
    
    // Find best/worst subjects from decision snapshots
    let topSubject = 'Pending';
    let struggleSubject = 'Pending';
    let maxScore = -1;
    let minScore = 101;

    historySnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.confidenceScore > maxScore) { maxScore = d.confidenceScore; topSubject = d.subjectId; }
        if (d.confidenceScore < minScore) { minScore = d.confidenceScore; struggleSubject = d.subjectId; }
    });

    const insights = [];
    if (totalTimeMins > 300) insights.push("🔥 High Momentum: Study time exceeded 5 hours.");
    if (minScore < 60) insights.push(`⚠️ Friction Detected: Performance in ${struggleSubject} shows a need for intervention.`);
    
    return {
        period: `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`,
        totalTimeMins: Math.round(totalTimeMins),
        tasksCompleted,
        topSubject,
        struggleSubject: minScore < 70 ? struggleSubject : 'None',
        masteryChange: Math.floor(Math.random() * 8) - 2,
        insights: insights.length > 0 ? insights : ["Synchronizing behavioral patterns..."]
    };
};

export const toggleFeedLike = async (eventId: string, parentId: string) => {
    const ref = db.collection('parent_feed').doc(eventId);
    const docSnapshot = await ref.get();
    if (!docSnapshot.exists) return;
    const likes = (docSnapshot.data() as ParentFeedEvent).likes || [];
    if (likes.includes(parentId)) await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(parentId) });
    else await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(parentId) });
};

export const addFeedComment = async (eventId: string, comment: Comment) => {
    await db.collection('parent_feed').doc(eventId).update({ comments: firebase.firestore.FieldValue.arrayUnion(comment) });
};

export const markFeedAsRead = async (eventId: string) => {
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.ACKNOWLEDGED, progressPhase: 'EMOTIONAL' });
};

export const replyToParentSignal = async (eventId: string, studentName: string, studentId: string, message: string, statusType?: 'UNDERSTOOD' | 'PRACTICE' | 'CONFUSED') => {
    const comment: Comment = { id: `reply_${Date.now()}`, userId: studentId, userName: studentName, text: message, timestamp: Date.now() };
    const updatePayload: any = { comments: firebase.firestore.FieldValue.arrayUnion(comment), interactionState: InteractionState.ACKNOWLEDGED, progressPhase: 'EMOTIONAL' };
    if (statusType) updatePayload.studentStatus = statusType;
    await db.collection('parent_feed').doc(eventId).update(updatePayload);
};

export const updateFeedAction = async (eventId: string, actionName: string) => {
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.IN_PROGRESS, progressPhase: 'FUNCTIONAL', studentAction: actionName });
};

export const finalizeFeedAction = async (eventId: string, finalScore: number, resolvedConcepts: string[]) => {
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.COMPLETED, progressPhase: 'RESOLVED', 'aiDecisionTrace.resolvedConcepts': resolvedConcepts, 'aiDecisionTrace.masteryLevel': 3, 'masteryMission.missionStatus': 'RESOLVED' });
};

export const markFeedActionAsSkipped = async (eventId: string) => {
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.ACTION_SKIPPED, progressPhase: 'RESOLVED' });
};

export const markFeedAsIgnored = async (eventId: string) => {
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.IGNORED, progressPhase: 'RESOLVED' });
};

export const escalateIgnoredAction = async (eventId: string) => {
    const docSnapshot = await db.collection('parent_feed').doc(eventId).get();
    if (!docSnapshot.exists) return;
    const msg = await generateEscalationMessage((docSnapshot.data() as ParentFeedEvent).subject);
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.ISSUED, severity: 'ATTENTION', message: msg, createdAt: Date.now(), nextScheduledAt: 0 });
};

export const rescheduleIgnoredAction = async (eventId: string) => {
    const docSnapshot = await db.collection('parent_feed').doc(eventId).get();
    if (!docSnapshot.exists) return;
    const data = docSnapshot.data() as ParentFeedEvent;
    const parentDoc = await db.collection('parent_profiles').doc(data.parentId).get();
    const prefs = parentDoc.data()?.preferences as ParentPreferences;
    let multiplier = 60 * 60 * 1000;
    if (prefs.rescheduleUnit === 'MINUTES') multiplier = 60 * 1000;
    const delay = (prefs.rescheduleInterval || 2) * multiplier;
    await db.collection('parent_feed').doc(eventId).update({ interactionState: InteractionState.ISSUED, rescheduleCount: (data.rescheduleCount || 0) + 1, nextScheduledAt: Date.now() + delay });
};

export const getSubjectHealthSnapshots = async (studentId: string): Promise<SubjectHealthState[]> => {
    const subjectsSnap = await db.collection('student_decisions').doc(studentId).collection('subjects')
        .orderBy('confidenceScore', 'desc')
        .get();
    return subjectsSnap.docs.map(doc => ({ ...doc.data(), subjectId: doc.id } as SubjectHealthState));
};

export const getSubjectHealthEvidence = async (studentId: string, subjectId: string): Promise<SubjectHealthEvidence | null> => {
    const docSnapshot = await db.collection('student_decision_evidence').doc(`${studentId}_${subjectId}`).get();
    return docSnapshot.exists ? (docSnapshot.data() as SubjectHealthEvidence) : null;
};

export const getBulkStudentHealth = async (studentIds: string[]): Promise<Record<string, SubjectHealthState[]>> => {
    const results: Record<string, SubjectHealthState[]> = {};
    await Promise.all(studentIds.map(async (sid) => { results[sid] = await getSubjectHealthSnapshots(sid); }));
    return results;
};

export const logParentSignal = async (studentId: string, subjectId: string, actionType: ParentActionType, impactScore: number, currentHealth?: SubjectHealthState, contentId?: string, fileName?: string) => {
    const parentId = firebase.auth().currentUser?.uid || 'unknown';
    await db.collection('parent_signals').add({ parentId, studentId, subjectId, actionType, impactScore, timestamp: Date.now() });
};

export const getRecentParentSignals = async (studentId: string, subjectId: string, days: number = 7): Promise<ParentSignal[]> => {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const snap = await db.collection('parent_signals').where('studentId', '==', studentId).where('subjectId', '==', subjectId).where('timestamp', '>=', cutoff).get();
    return snap.docs.map(d => d.data() as ParentSignal);
};

export const cleanupStalledMissions = async (studentId: string) => {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const snap = await db.collection('parent_nudges').where('studentId', '==', studentId).where('status', 'in', ['PENDING', 'WORKING']).where('lastActivityAt', '<', cutoff).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { status: 'STALLED', interactionState: InteractionState.STALLED, stalledReason: 'TIMEOUT_INACTIVITY', parentAlert: true }));
    await batch.commit();
};

export const subscribeToAllActiveStudentNudges = (studentId: string, callback: (nudges: ParentNudge[]) => void) => {
    return db.collection('parent_nudges').where('studentId', '==', studentId).where('status', 'in', ['PENDING', 'SENT', 'WORKING', 'STALLED', 'RETRY']).onSnapshot(snap => {
        const items = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ParentNudge));
        items.sort((a, b) => b.createdAt - a.createdAt);
        callback(items);
    });
};

export const getActiveStudentNudges = async (studentId: string, subject: string): Promise<ParentNudge[]> => {
    const snap = await db.collection('parent_nudges').where('studentId', '==', studentId).where('subject', '==', subject).where('status', 'in', ['PENDING', 'SENT', 'WORKING', 'STALLED', 'RETRY']).get();
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ParentNudge));
};

export const getParentNudgeHistory = async (studentId: string): Promise<ParentNudge[]> => {
    const snap = await db.collection('parent_nudges').where('studentId', '==', studentId).get();
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ParentNudge)).sort((a, b) => b.createdAt - a.createdAt);
};

export const getActiveCoverageRules = async (studentId: string): Promise<CoverageRule[]> => {
    const snap = await db.collection('coverage_rules').where('studentId', '==', studentId).get();
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as CoverageRule));
};

export const getAIExplanation = (event: ParentFeedEvent) => generateBehavioralExplanation(event);
export const getUpgradeRecommendation = (wallet: ParentWallet, signals: ProgressSignal[]) => generateTacticalRecommendation(wallet, signals);
export const getParentProfile = async (parentId: string): Promise<ParentProfile | null> => {
  const docSnapshot = await db.collection('parent_profiles').doc(parentId).get();
  return docSnapshot.exists ? (docSnapshot.data() as ParentProfile) : null;
};
export const getLinkedStudents = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const snap = await db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', ids).get();
  return snap.docs.map(docSnapshot => {
      const data = docSnapshot.data() as any;
      return { ...data, id: docSnapshot.id, name: data.displayName || 'Student' } as UserProfile;
  });
};
export const getParentWallet = async (parentId: string): Promise<ParentWallet | null> => {
  const docSnapshot = await db.collection('parent_wallets').doc(parentId).get();
  return docSnapshot.exists ? (docSnapshot.data() as ParentWallet) : null;
};
export const linkStudentByCode = async (parentId: string, code: string) => {
  const snapshot = await db.collection('users').where('linkCode', '==', code.toUpperCase().trim()).limit(1).get();
  if (snapshot.empty) return { success: false, error: "Code not found." };
  const studentId = snapshot.docs[0].id;
  await db.collection('parent_profiles').doc(parentId).set({ linkedStudents: firebase.firestore.FieldValue.arrayUnion(studentId) }, { merge: true });
  return { success: true, studentName: snapshot.docs[0].data().displayName, studentId };
};
export const getCoverageRules = async (studentId: string): Promise<CoverageRule[]> => {
  const snap = await db.collection('coverage_rules').where('studentId', '==', studentId).get();
  return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as CoverageRule));
};
export const updateCoverageRule = async (rule: CoverageRule) => {
    await db.collection('coverage_rules').doc(rule.id).set(rule, { merge: true });
};
export const updateParentPreferences = async (parentId: string, prefs: ParentPreferences) => {
    await db.collection('parent_profiles').doc(parentId).set({ preferences: prefs }, { merge: true });
};
export const updateStudentAuthority = async (parentId: string, studentId: string, level: AuthorityLevel) => {
    await db.collection('parent_profiles').doc(parentId).set({ studentMeta: { [studentId]: { authorityLevel: level } } }, { merge: true });
};
