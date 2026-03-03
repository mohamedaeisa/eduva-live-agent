
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { collectDeviceMetadata } from '../utils/telemetry';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export const useSession = () => {
  const [user, setUser] = useState<firebase.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const fetchGeoData = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        return { ip: data.ip, city: data.city, country: data.country_name };
      }
      return {}; 
    } catch (e) { return {}; }
  };

  const startSession = async (currentUser: firebase.User) => {
    try {
      const uid = currentUser.uid;
      const userRef = db.collection('users').doc(uid);
      const geoData = await fetchGeoData();
      const metadata = collectDeviceMetadata(geoData);
      
      const userSnapshot = await userRef.get();
      const isFirstTimeUser = !userSnapshot.exists;

      const userData = {
        uid,
        name: currentUser.displayName || 'Guest',
        email: currentUser.email || null,
        photoURL: currentUser.photoURL || null,
        userType: currentUser.isAnonymous ? 'Guest' : 'Registered',
        provider: currentUser.isAnonymous ? 'anonymous' : 'google',
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        sessionsCount: firebase.firestore.FieldValue.increment(1),
        ...(isFirstTimeUser && {
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          optInAnalytics: true 
        })
      };

      await userRef.set(userData, { merge: true });

      const newSessionPayload = {
        uid,
        userType: userData.userType,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        startAt: firebase.firestore.FieldValue.serverTimestamp(),
        startTimeMs: Date.now(),
        ...metadata,
        featureUsed: [],
        isFirstTimeUser
      };

      const sessionDoc = await db.collection('sessions').add(newSessionPayload);
      
      setSessionId(sessionDoc.id);
      sessionIdRef.current = sessionDoc.id;
      startTimeRef.current = Date.now();

    } catch (error) {
      console.error("Session Start Error:", error);
    }
  };

  const endSession = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || !auth.currentUser) return;

    try {
      const end = Date.now();
      const start = startTimeRef.current || end;
      const durationSeconds = Math.floor((end - start) / 1000);

      const sessionRef = db.collection('sessions').doc(currentSessionId);
      
      await sessionRef.update({
        endAt: firebase.firestore.FieldValue.serverTimestamp(),
        sessionDuration: durationSeconds
      });
      
      const userRef = db.collection('users').doc(auth.currentUser.uid);
      await userRef.update({
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error("Session End Error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (!sessionIdRef.current) {
          await startSession(currentUser);
        }
      } else {
        if (sessionIdRef.current) {
          await endSession();
          sessionIdRef.current = null;
          setSessionId(null);
        }
        setUser(null);
      }
      setLoading(false);
    });

    const handleTabClose = () => {
      if (sessionIdRef.current) endSession();
    };

    window.addEventListener('beforeunload', handleTabClose);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, []);

  return { user, loading, sessionId };
};
