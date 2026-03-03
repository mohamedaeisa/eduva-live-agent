
import { UserProfile, UserPreferences, Language, EducationSystem, DailyActivity, UserRole } from '../types';
import { YEARS, SUBJECTS } from '../constants';
import { auth, db } from './firebaseConfig';

const INITIAL_GAMIFICATION = {
  xp: 0,
  level: 1,
  streak: 0,
  lastStudyDate: 0,
  earnedBadges: []
};

const INITIAL_DAILY_STATS: DailyActivity = {
  date: new Date().toISOString().split('T')[0],
  filesProcessed: 0,
  actionsPerformed: 0
};

/**
 * Generates a unique 6-digit alphanumeric code.
 */
const generateLinkCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Validates and normalizes language strings to valid enum values.
 */
const normalizeLanguage = (lang: string | undefined): Language => {
  if (lang === Language.ENGLISH || lang === Language.ARABIC) return lang;
  if (lang === 'en') return Language.ENGLISH;
  if (lang === 'ar') return Language.ARABIC;
  return Language.ENGLISH;
};

// CACHE KEYS
const PROFILE_CACHE_KEY_PREFIX = 'user_profile_';

export const cacheUserProfile = (profile: UserProfile) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY_PREFIX + profile.id, JSON.stringify(profile));
  } catch (e) { console.warn('Failed to cache profile', e); }
};

export const getCachedUserProfile = (uid: string): UserProfile | null => {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY_PREFIX + uid);
    return cached ? JSON.parse(cached) : null;
  } catch (e) { return null; }
};

/**
 * Maps Firebase User and Firestore data to app-internal UserProfile
 */
export const syncUserProfile = async (firebaseUser: any): Promise<UserProfile | null> => {
  if (!firebaseUser) return null;

  try {
    const doc = await db.collection('users').doc(firebaseUser.uid).get();
    const data = doc.data();

    const rawPrefs = data?.preferences || {};

    // FORCIBLY PURGE ANY TRACE OF GEMMA/GAMMA FROM THE DATABASE PREFERENCES
    let aiModel = rawPrefs.aiModel || 'gemini-3-flash-preview';
    if (aiModel.toLowerCase().includes('gemma') || aiModel.toLowerCase().includes('gamma')) {
      aiModel = 'gemini-3-flash-preview';
    }

    const preferences: UserPreferences = {
      defaultYear: rawPrefs.defaultYear || '', // Return empty to trigger Welcome Modal if unset
      defaultCurriculum: rawPrefs.defaultCurriculum || EducationSystem.NEIS,
      defaultLanguage: normalizeLanguage(rawPrefs.defaultLanguage),
      defaultSubject: rawPrefs.defaultSubject || '',
      subjects: rawPrefs.subjects || (rawPrefs.defaultSubject ? [rawPrefs.defaultSubject] : [SUBJECTS[0]]),
      theme: rawPrefs.theme || 'light',
      enableNotifications: rawPrefs.enableNotifications !== undefined ? rawPrefs.enableNotifications : true,
      enableVibration: rawPrefs.enableVibration !== undefined ? rawPrefs.enableVibration : true,
      aiModel: aiModel,
      masteryMap: rawPrefs.masteryMap || {}
    };

    const role = data?.role || UserRole.STUDENT;
    let linkCode = data?.linkCode;

    // AUTHORITATIVE FIX: Generate link code for existing students who don't have one
    if (role === UserRole.STUDENT && !linkCode) {
      linkCode = generateLinkCode();
      await db.collection('users').doc(firebaseUser.uid).set({ linkCode }, { merge: true });
    }

    return {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      name: data?.displayName || firebaseUser.displayName || 'User',
      role: role,
      linkCode: linkCode,
      preferences,
      joinedAt: data?.createdAt?.toMillis() || Date.now(),
      // Fix: Mapped lastLoginAt correctly
      lastLoginAt: data?.lastLoginAt?.toMillis() || Date.now(),
      dailyStats: data?.dailyStats || INITIAL_DAILY_STATS,
      gamification: {
        ...INITIAL_GAMIFICATION,
        ...(data?.gamification || {}),
        masteryMap: data?.gamification?.masteryMap || {}
      },
      // Monetization (PA8.1) - Nested Plan Schema
      plan: data?.plan || undefined,
      linkedParentId: data?.linkedParentId,
    };
  } catch (e) {
    console.error("Profile Sync Error", e);
    return null;
  }
};

export const updateUserPreferences = async (user: UserProfile, newPrefs: Partial<UserPreferences>): Promise<UserProfile> => {
  const updatedUser = {
    ...user,
    preferences: { ...user.preferences, ...newPrefs }
  };

  if (updatedUser.preferences.aiModel?.toLowerCase().includes('gemma')) {
    updatedUser.preferences.aiModel = 'gemini-3-flash-preview';
  }

  await db.collection('users').doc(user.id).set({
    preferences: updatedUser.preferences
  }, { merge: true });

  return updatedUser;
};

export const updateUserRole = async (userId: string, newRole: UserRole): Promise<void> => {
  const updates: any = { role: newRole };

  if (newRole === UserRole.STUDENT) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.data()?.linkCode) {
      updates.linkCode = generateLinkCode();
    }
  }

  await db.collection('users').doc(userId).set(updates, { merge: true });

  if (newRole === UserRole.PARENT) {
    const pDoc = await db.collection('parent_profiles').doc(userId).get();
    if (!pDoc.exists) {
      await db.collection('parent_profiles').doc(userId).set({
        userId,
        linkedStudents: [],
        preferences: {
          learningIntent: 'BALANCED',
          strictnessLevel: 0.5,
          difficultyGrowthRate: 0.5,
          hintTolerance: 0.5,
          foundationRepairThreshold: 0.8,
          rescheduleInterval: 2,
          rescheduleUnit: 'HOURS'
        }
      });
    }
  }
};

export const updateFullUserProfile = async (
  userId: string,
  updates: {
    name: string;
    year: string;
    curriculum: EducationSystem;
    subject: string;
    subjects?: string[];
    theme?: 'light' | 'dark';
    enableNotifications?: boolean;
    enableVibration?: boolean;
    aiModel?: string;
  }
): Promise<void> => {
  let cleanAiModel = updates.aiModel;
  if (cleanAiModel && (cleanAiModel.toLowerCase().includes('gemma') || cleanAiModel.toLowerCase().includes('gamma'))) {
    cleanAiModel = 'gemini-3-flash-preview';
  }

  const preferences: any = {
    defaultYear: updates.year,
    defaultCurriculum: updates.curriculum,
    defaultSubject: updates.subject
  };

  if (updates.subjects) preferences.subjects = updates.subjects;
  if (updates.theme) preferences.theme = updates.theme;
  if (updates.enableNotifications !== undefined) preferences.enableNotifications = updates.enableNotifications;
  if (updates.enableVibration !== undefined) preferences.enableVibration = updates.enableVibration;
  if (cleanAiModel) preferences.aiModel = cleanAiModel;

  const payload = {
    displayName: updates.name,
    preferences: preferences
  };

  await db.collection('users').doc(userId).set(payload, { merge: true });

  if (auth.currentUser) {
    await auth.currentUser.updateProfile({ displayName: updates.name });
  }
};

export const getActiveUser = async (): Promise<UserProfile | null> => {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;
  return syncUserProfile(fbUser);
};

export const logoutUser = async () => {
  await auth.signOut();
};
