import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/analytics';

// Helper to safely get environment variables statically for Vite to parse
// 🎯 Global definition from vite.config.ts
declare global {
  const __FIREBASE_CONFIG__: any;
}

// Helper to safely get environment variables statically for Vite/Vercel to parse
const getFirebaseConfig = () => {
  // 🎯 Use the global object injected by the define block in vite.config.ts
  const config = typeof __FIREBASE_CONFIG__ !== 'undefined' ? __FIREBASE_CONFIG__ : {};

  return {
    apiKey: config.apiKey || "",
    authDomain: config.authDomain || "",
    projectId: config.projectId || "",
    storageBucket: config.storageBucket || "",
    messagingSenderId: config.messagingSenderId || "",
    appId: config.appId || "",
    measurementId: config.measurementId || ""
  };
};

const firebaseConfig = getFirebaseConfig();

// 🔍 DIAGNOSTIC LOGGING (Production)
if (typeof window !== 'undefined') {
  console.log("🔥 [FIREBASE] Diagnostic Check:", {
    has_apiKey: !!firebaseConfig.apiKey,
    apiKey_len: firebaseConfig.apiKey?.length || 0,
    has_projectId: !!firebaseConfig.projectId,
    appId_len: firebaseConfig.appId?.length || 0
  });
}

// Initialize Firebase safely
let app;
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app();
}

export const auth = app.auth();
export const db = app.firestore();

let analyticsInstance = null;
if (typeof window !== 'undefined') {
  firebase.analytics.isSupported().then((supported) => {
    if (supported) {
      analyticsInstance = firebase.analytics();
    }
  });
}

export const analytics = analyticsInstance;
export const isFirebaseInitialized = true;
export default app;