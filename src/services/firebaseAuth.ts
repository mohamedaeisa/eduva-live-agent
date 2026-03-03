
import { auth, db } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { UserRole } from '../types';

export interface AuthResult {
  user: firebase.User | null;
  error: string | null;
}

const updateLoginStats = async (uid: string) => {
  try {
    await db.collection('users').doc(uid).update({
      loginCount: firebase.firestore.FieldValue.increment(1),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn("Could not update login stats", e);
  }
};

/**
 * Generates a unique 6-digit alphanumeric code.
 */
const generateUniqueLinkCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars like 0, O, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Register a new user with Role support
 * SECURITY: Role is sanitized to allow only STUDENT or PARENT. 
 * Admin roles must be assigned via backend tools.
 */
export const signUp = async (email: string, password: string, displayName: string, role: string = UserRole.STUDENT): Promise<AuthResult> => {
  try {
    // SECURITY: Whitelist allowed roles for client-side registration
    const safeRole = (role === UserRole.PARENT) ? UserRole.PARENT : UserRole.STUDENT;

    const result = await auth.createUserWithEmailAndPassword(email, password);
    if (result.user) {
      await result.user.updateProfile({ displayName });

      const linkCode = safeRole === UserRole.STUDENT ? generateUniqueLinkCode() : null;

      // Create user document in Firestore
      const userRef = db.collection('users').doc(result.user.uid);
      await userRef.set({
        uid: result.user.uid,
        email: result.user.email,
        displayName: displayName,
        role: safeRole,
        linkCode: linkCode,
        plan: "FREE",
        loginCount: 1,
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        preferences: {
          defaultYear: '', // Empty to trigger Welcome Modal
          defaultCurriculum: 'Standard',
          defaultLanguage: 'English',
          defaultSubject: '',
          theme: 'light',
          enableNotifications: true,
          enableSounds: true,
          enableVibration: true,
          aiModel: 'gemini-3-flash-preview'
        },
        gamification: {
          xp: 0,
          level: 1,
          streak: 0,
          lastStudyDate: 0,
          earnedBadges: []
        },
        dailyStats: {
          date: new Date().toISOString().split('T')[0],
          filesProcessed: 0,
          actionsPerformed: 0
        }
      });

      // If parent, initialize parent profile
      if (safeRole === UserRole.PARENT) {
        await db.collection('parent_profiles').doc(result.user.uid).set({
          userId: result.user.uid,
          linkedStudents: [],
          preferences: {
            learningIntent: 'BALANCED',
            strictnessLevel: 0.5,
            difficultyGrowthRate: 0.5,
            hintTolerance: 0.5
          }
        });
      }
    }
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error("Sign Up Error:", error);
    return { user: null, error: error.message };
  }
};

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    if (result.user) {
      await updateLoginStats(result.user.uid);
    }
    return { user: result.user, error: null };
  } catch (error: any) {
    // Handle expected user errors gracefully without polluting console with errors
    if (
      error.code === 'auth/invalid-credential' ||
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.message?.includes('invalid-credential')
    ) {
      console.warn("Sign In Failed (Invalid Credentials):", email);
    } else {
      console.error("Sign In Error:", error);
    }
    return { user: null, error: error.message };
  }
};

export const resetPassword = async (email: string): Promise<{ success: boolean; error: string | null }> => {
  try {
    await auth.sendPasswordResetEmail(email);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const signInWithGoogle = async (): Promise<AuthResult> => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    if (result.user) {
      const userRef = db.collection('users').doc(result.user.uid);
      const doc = await userRef.get();

      if (!doc.exists) {
        await userRef.set({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          role: UserRole.STUDENT,
          linkCode: generateUniqueLinkCode(),
          plan: "FREE",
          loginCount: 1,
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          preferences: {
            defaultYear: '', // Empty to trigger Welcome Modal
            defaultCurriculum: 'Standard',
            defaultLanguage: 'English',
            defaultSubject: '',
            theme: 'light',
            enableNotifications: true,
            enableSounds: true,
            enableVibration: true,
            aiModel: 'gemini-3-flash-preview'
          },
          gamification: {
            xp: 0,
            level: 1,
            streak: 0,
            lastStudyDate: 0,
            earnedBadges: []
          },
          dailyStats: {
            date: new Date().toISOString().split('T')[0],
            filesProcessed: 0,
            actionsPerformed: 0
          }
        });
      } else {
        await updateLoginStats(result.user.uid);
      }
    }
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error("Google Sign-In Error:", error);
    return { user: null, error: error.message };
  }
};

export const signInGuest = async (): Promise<AuthResult> => {
  try {
    const result = await auth.signInAnonymously();
    if (result.user) {
      const userRef = db.collection('users').doc(result.user.uid);
      const doc = await userRef.get();

      if (!doc.exists) {
        await userRef.set({
          uid: result.user.uid,
          email: null,
          displayName: "Guest",
          role: UserRole.STUDENT,
          linkCode: generateUniqueLinkCode(),
          plan: "FREE",
          loginCount: 1,
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          preferences: {
            defaultYear: '', // Empty to trigger Welcome Modal
            defaultCurriculum: 'Standard',
            defaultLanguage: 'English',
            defaultSubject: '',
            theme: 'light',
            enableNotifications: true,
            enableSounds: true,
            enableVibration: true,
            aiModel: 'gemini-3-flash-preview'
          },
          gamification: {
            xp: 0,
            level: 1,
            streak: 0,
            lastStudyDate: 0,
            earnedBadges: []
          },
          dailyStats: {
            date: new Date().toISOString().split('T')[0],
            filesProcessed: 0,
            actionsPerformed: 0
          }
        });
      } else {
        await updateLoginStats(result.user.uid);
      }
    }
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error("Guest Sign-In Error:", error);
    return { user: null, error: error.message };
  }
};

export const signOut = async (): Promise<{ success: boolean; error: string | null }> => {
  try {
    await auth.signOut();
    return { success: true, error: null };
  } catch (error: any) {
    console.error("Sign Out Error:", error);
    return { success: false, error: error.message };
  }
};
