
import { db } from './firebaseConfig';
import { Classroom, Challenge, ClassroomAssignment, ClassroomAnnouncement, ClassroomFeedItem, QuizData, UserProfile, Comment, ExamGrading } from '../types';
import { logEvent } from './analyticsService';
import firebase from 'firebase/compat/app';

// --- LocalStorage Fallback Helper ---
const getLocal = <T>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
};
const setLocal = (key: string, data: any[]) => localStorage.setItem(key, JSON.stringify(data));

export const createChallenge = async (
  quizData: QuizData, 
  creator: UserProfile, 
  score: number, 
  total: number
): Promise<string> => {
  const challenge: Challenge = {
    id: `ch_${Date.now()}`, 
    quizData,
    creatorName: creator.name,
    creatorId: creator.id,
    creatorScore: score,
    creatorTotal: total,
    timestamp: Date.now()
  };

  logEvent('Create Challenge', `Topic: ${quizData.topic} | Score: ${score}/${total}`);

  if (db) {
    try {
      const { id, ...data } = challenge;
      const docRef = await db.collection('challenges').add(data);
      return docRef.id;
    } catch (e) { console.warn("Firebase unavailable, using local"); }
  }

  const challenges = getLocal<Challenge>('eduva_challenges');
  challenges.push(challenge);
  setLocal('eduva_challenges', challenges);
  return challenge.id;
};

export const getChallenge = async (id: string): Promise<Challenge | null> => {
  if (db) {
    try {
      const doc = await db.collection('challenges').doc(id).get();
      if (doc.exists) return { ...doc.data(), id: doc.id } as Challenge;
    } catch (e) { console.warn("Firebase unavailable, using local"); }
  }
  const challenges = getLocal<Challenge>('eduva_challenges');
  return challenges.find(c => c.id === id) || null;
};

export const getLeaderboard = async (limit: number, gradeFilter?: string): Promise<any[]> => {
  if (db) {
    try {
      const snapshot = await db.collection('users').get();
      let users = snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id } as UserProfile));
      
      if (gradeFilter) {
        users = users.filter((u: any) => u.preferences?.defaultYear === gradeFilter);
      }
      
      users.sort((a: any, b: any) => (b.gamification?.xp || 0) - (a.gamification?.xp || 0));
      
      return users.slice(0, limit).map((u: any) => ({
        name: u.name,
        xp: u.gamification?.xp || 0,
        level: u.gamification?.level || 1,
        grade: u.preferences?.defaultYear
      }));
    } catch (e) {
      console.warn("Firebase unavailable, using local for leaderboard");
    }
  }

  try {
    const usersMap = JSON.parse(localStorage.getItem('eduva_users') || '{}');
    let users = Object.values(usersMap) as UserProfile[];
    if (gradeFilter) {
      users = users.filter(u => u.preferences?.defaultYear === gradeFilter);
    }
    users.sort((a, b) => (b.gamification?.xp || 0) - (a.gamification?.xp || 0));
    return users.slice(0, limit).map(u => ({
      name: u.name,
      xp: u.gamification?.xp || 0,
      level: u.gamification?.level || 1,
      grade: u.preferences?.defaultYear
    }));
  } catch (e) {
    return [];
  }
};

const generateClassCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export const createClassroom = async (user: UserProfile, name: string): Promise<Classroom> => {
  const code = generateClassCode();
  const classroom: Classroom = {
    id: `cls_${Date.now()}`,
    name,
    code,
    creatorId: user.id,
    members: [user.id], 
    memberProfiles: [{ id: user.id, name: user.name }],
    grade: user.preferences.defaultYear,
    curriculum: user.preferences.defaultCurriculum,
    createdAt: Date.now()
  };

  logEvent('Create Classroom', `Name: ${name} | Code: ${code}`);

  if (db) {
    try {
      const { id, ...data } = classroom;
      const docRef = await db.collection('classrooms').add(data);
      return { ...classroom, id: docRef.id };
    } catch (e) { console.warn("Using local storage for class"); }
  }

  const classes = getLocal<Classroom>('eduva_classrooms');
  classes.push(classroom);
  setLocal('eduva_classrooms', classes);
  return classroom;
};

export const joinClassroom = async (user: UserProfile, code: string): Promise<Classroom | null> => {
  logEvent('Join Classroom', `Code: ${code}`);
  if (db) {
    try {
      const snapshot = await db.collection('classrooms').where('code', '==', code.toUpperCase()).get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const cls = doc.data() as Classroom;
        
        if (!cls.members.includes(user.id)) {
          await doc.ref.update({
            members: firebase.firestore.FieldValue.arrayUnion(user.id),
            memberProfiles: firebase.firestore.FieldValue.arrayUnion({ id: user.id, name: user.name })
          });
          cls.members.push(user.id);
          if (!cls.memberProfiles) cls.memberProfiles = [];
          cls.memberProfiles.push({ id: user.id, name: user.name });
        }
        return { ...cls, id: doc.id };
      }
    } catch (e) { console.warn("Using local storage for join"); }
  }

  const classes = getLocal<Classroom>('eduva_classrooms');
  const cls = classes.find(c => c.code === code.toUpperCase());
  if (cls) {
    if (!cls.members.includes(user.id)) {
      cls.members.push(user.id);
      if (!cls.memberProfiles) cls.memberProfiles = [];
      cls.memberProfiles.push({ id: user.id, name: user.name });
      setLocal('eduva_classrooms', classes);
    }
    return cls;
  }
  throw new Error("Classroom not found");
};

export const getUserClassrooms = async (userId: string): Promise<Classroom[]> => {
  if (db) {
    try {
      const snapshot = await db.collection('classrooms').where('members', 'array-contains', userId).get();
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Classroom));
    } catch (e) { console.warn("Using local storage for fetching classes"); }
  }
  return getLocal<Classroom>('eduva_classrooms').filter(c => c.members.includes(userId));
};

export const createAssignment = async (classroomId: string, user: UserProfile, topic: string, type: 'quiz' | 'notes', dueDate?: number) => {
  const assignment: ClassroomAssignment = {
    id: `asg_${Date.now()}`,
    itemType: 'assignment',
    classroomId,
    type,
    topic,
    dueDate,
    createdBy: user.name,
    creatorId: user.id,
    createdAt: Date.now(),
    submissions: {},
    comments: [],
    likes: []
  };
  
  logEvent('Create Assignment', `Type: ${type} | Topic: ${topic}`);

  if (db) {
    try {
      const { id, ...data } = assignment;
      await db.collection('assignments').add(data);
      return;
    } catch (e) {}
  }

  const assigns = getLocal<ClassroomAssignment>('eduva_assignments');
  assigns.push(assignment);
  setLocal('eduva_assignments', assigns);
};

export const createAnnouncement = async (classroomId: string, user: UserProfile, text: string) => {
  const announcement: ClassroomAnnouncement = {
    id: `ann_${Date.now()}`,
    itemType: 'announcement',
    classroomId,
    text,
    createdBy: user.name,
    creatorId: user.id,
    createdAt: Date.now(),
    comments: [],
    likes: []
  };

  logEvent('Create Announcement', `Classroom: ${classroomId}`);

  if (db) {
    try {
      const { id, ...data } = announcement;
      await db.collection('announcements').add(data);
      return;
    } catch(e) { console.error("Announcement DB Error", e); }
  }

  const anns = getLocal<ClassroomAnnouncement>('eduva_announcements');
  anns.push(announcement);
  setLocal('eduva_announcements', anns);
};

export const toggleLike = async (collection: 'assignments' | 'announcements', docId: string, userId: string) => {
  logEvent('Like Post', `ID: ${docId}`);
  if (db) {
    try {
      const docRef = db.collection(collection).doc(docId);
      const doc = await docRef.get();
      if (!doc.exists) return;
      
      const data = doc.data();
      const likes = data?.likes || [];
      const isLiked = likes.includes(userId);
      
      if (isLiked) {
        await docRef.update({
          likes: firebase.firestore.FieldValue.arrayRemove(userId)
        });
      } else {
        await docRef.update({
          likes: firebase.firestore.FieldValue.arrayUnion(userId)
        });
      }
      return;
    } catch (e) {
      console.error("Like Error", e);
    }
  }

  const key = collection === 'assignments' ? 'eduva_assignments' : 'eduva_announcements';
  const items = getLocal<any>(key);
  const item = items.find(i => i.id === docId);
  if (item) {
    item.likes = item.likes || [];
    if (item.likes.includes(userId)) {
      item.likes = item.likes.filter((id: string) => id !== userId);
    } else {
      item.likes.push(userId);
    }
    setLocal(key, items);
  }
};

export const addComment = async (collection: 'assignments' | 'announcements', docId: string, user: UserProfile, text: string) => {
  const newComment: Comment = {
    id: `cmt_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
    userId: user.id,
    userName: user.name,
    text: text,
    timestamp: Date.now()
  };

  logEvent('Add Comment', `ID: ${docId}`);

  if (db) {
    try {
      const docRef = db.collection(collection).doc(docId);
      await docRef.update({
        comments: firebase.firestore.FieldValue.arrayUnion(newComment)
      });
      return;
    } catch (e) {
      console.error("Comment Error", e);
    }
  }

  const key = collection === 'assignments' ? 'eduva_assignments' : 'eduva_announcements';
  const items = getLocal<any>(key);
  const item = items.find(i => i.id === docId);
  if (item) {
    item.comments = item.comments || [];
    item.comments.push(newComment);
    setLocal(key, items);
  }
};

export const submitAssignment = async (assignmentId: string, userId: string, score: number) => {
  let currentAttempts = 0;
  const localAssigns = getLocal<ClassroomAssignment>('eduva_assignments');
  const localIdx = localAssigns.findIndex(a => a.id === assignmentId);
  if (localIdx !== -1) {
    const existing = localAssigns[localIdx].submissions?.[userId];
    currentAttempts = existing?.attempts || 0;
  }

  const submissionData = {
    score,
    timestamp: Date.now(),
    completed: true,
    attempts: currentAttempts + 1
  };

  logEvent('Submit Assignment', `Assignment: ${assignmentId} | Score: ${score}`);

  if (db) {
    try {
      const docRef = db.collection('assignments').doc(assignmentId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) return;
        const data = doc.data() as ClassroomAssignment;
        const existing = data.submissions?.[userId];
        const attempts = (existing?.attempts || 0) + 1;
        const existingGrading = existing?.grading;
        
        t.update(docRef, {
          [`submissions.${userId}`]: { ...submissionData, attempts, grading: existingGrading }
        });
      });
      return;
    } catch (e) { console.warn("Firebase update failed, trying local"); }
  }

  if (localIdx !== -1) {
    if (!localAssigns[localIdx].submissions) localAssigns[localIdx].submissions = {};
    localAssigns[localIdx].submissions[userId] = submissionData;
    setLocal('eduva_assignments', localAssigns);
  }
};

export const saveExamGrading = async (assignmentId: string, userId: string, grading: ExamGrading) => {
  logEvent('Grade Exam', `Assignment: ${assignmentId} | Student: ${userId}`);

  if (db) {
    try {
      const docRef = db.collection('assignments').doc(assignmentId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) return;
        const data = doc.data() as ClassroomAssignment;
        const currentSubmission = data.submissions?.[userId] || { 
            score: grading.totalScore, 
            timestamp: Date.now(), 
            completed: true, 
            attempts: 1 
        };

        t.update(docRef, {
          [`submissions.${userId}`]: { 
              ...currentSubmission, 
              score: grading.totalScore, 
              grading 
          }
        });
      });
      return;
    } catch (e) {
      console.error("Firebase grading save failed", e);
      throw new Error("Could not save grading.");
    }
  }

  const assigns = getLocal<ClassroomAssignment>('eduva_assignments');
  const assignment = assigns.find(a => a.id === assignmentId);
  if (assignment) {
      if (!assignment.submissions) assignment.submissions = {};
      const current = assignment.submissions[userId] || { score: grading.totalScore, timestamp: Date.now(), completed: true, attempts: 1 };
      assignment.submissions[userId] = { ...current, score: grading.totalScore, grading };
      setLocal('eduva_assignments', assigns);
  }
};

export const getClassFeed = async (classroomId: string): Promise<ClassroomFeedItem[]> => {
  let assignments: ClassroomAssignment[] = [];
  let announcements: ClassroomAnnouncement[] = [];
  const errors: string[] = [];

  if (db) {
    try {
      const snap = await db.collection('assignments').where('classroomId', '==', classroomId).limit(50).get();
      assignments = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ClassroomAssignment));
    } catch (e: any) {
        console.error("Fetch Assignments Error:", e);
        errors.push(`Assignments Error: ${e.message}`);
    }
    
    try {
      const snap = await db.collection('announcements').where('classroomId', '==', classroomId).limit(50).get();
      announcements = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ClassroomAnnouncement));
    } catch(e: any) {
        console.error("Fetch Announcements Error:", e);
        errors.push(`Announcements Error: ${e.message}`);
    }
  } else {
    assignments = getLocal<ClassroomAssignment>('eduva_assignments').filter(a => a.classroomId === classroomId);
    announcements = getLocal<ClassroomAnnouncement>('eduva_announcements').filter(a => a.classroomId === classroomId);
  }

  if (db && errors.length > 0) {
      throw new Error(errors.join("\n"));
  }

  const feed: ClassroomFeedItem[] = [
    ...assignments.map(a => ({ ...a, itemType: 'assignment' } as ClassroomFeedItem)),
    ...announcements.map(a => ({ ...a, itemType: 'announcement' } as ClassroomFeedItem))
  ];

  return feed.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const subscribeToClassFeed = (classroomId: string, callback: (feed: ClassroomFeedItem[]) => void) => {
  if (!db) {
    getClassFeed(classroomId).then(callback);
    return () => {};
  }

  let assignments: any[] = [];
  let announcements: any[] = [];

  const merge = () => {
    const safeAssigns = Array.isArray(assignments) ? assignments : [];
    const safeAnns = Array.isArray(announcements) ? announcements : [];

    const feed = [
      ...safeAssigns.map(a => ({ 
        ...a, 
        itemType: 'assignment',
        likes: a.likes || [],
        comments: a.comments || [] 
      })),
      ...safeAnns.map(a => ({ 
        ...a, 
        itemType: 'announcement',
        likes: a.likes || [],
        comments: a.comments || []
      }))
    ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    callback(feed as ClassroomFeedItem[]);
  };

  const unsub1 = db.collection('assignments')
    .where('classroomId', '==', classroomId)
    .onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        assignments = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        merge();
      }, 
      err => console.error("Assignments Listener Error", err)
    );

  const unsub2 = db.collection('announcements')
    .where('classroomId', '==', classroomId)
    .onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        announcements = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        merge();
      },
      err => console.error("Announcements Listener Error", err)
    );

  return () => {
    unsub1();
    unsub2();
  };
};

export const getClassLeaderboard = async (classId: string): Promise<any[]> => {
  let profiles: { id: string, name: string }[] = [];
  
  if (db) {
    try {
      const clsDoc = await db.collection('classrooms').doc(classId).get();
      if (clsDoc.exists) {
        const data = clsDoc.data() as Classroom;
        if (data.memberProfiles && data.memberProfiles.length > 0) {
          profiles = data.memberProfiles;
        } else {
          const memberIds = data.members || [];
          if (memberIds.length > 0) {
             const chunks = [];
             for (let i=0; i<memberIds.length; i+=10) chunks.push(memberIds.slice(i, i+10));
             for (const chunk of chunks) {
               const snap = await db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
               profiles.push(...snap.docs.map(d => ({ ...d.data(), id: d.id } as any)).map((u:any) => ({ id: u.id, name: u.name })));
             }
          }
        }
      }
    } catch(e) {}
  }
  
  if (profiles.length === 0) {
     const cls = getLocal<Classroom>('eduva_classrooms').find(c => c.id === classId);
     profiles = cls?.memberProfiles || cls?.members.map(m => ({ id: m, name: 'Student' })) || [];
  }

  const leaderboard = [];
  for (const p of profiles) {
    let xp = 0;
    let level = 1;
    let streak = 0;
    
    if (db) {
       try {
         const uDoc = await db.collection('users').doc(p.id).get();
         if (uDoc.exists) {
            const uData = uDoc.data();
            xp = uData?.gamification?.xp || 0;
            level = uData?.gamification?.level || 1;
            streak = uData?.gamification?.streak || 0;
         }
       } catch(e) {}
    }

    leaderboard.push({
      id: p.id,
      name: p.name,
      xp,
      level,
      streak
    });
  }

  return leaderboard.sort((a, b) => b.xp - a.xp);
};
