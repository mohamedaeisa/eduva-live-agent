
// vite.config.ts
// EDUVA v7 — Worker-stable Vite config
// 🔒 LOCKED — DO NOT TOUCH pdfjs settings without ARCH REVIEW

import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, '.', '') };

  console.log("--------------------------------------------------");
  console.log("[BUILD] VITE CONFIG LOADING...");
  console.log("[BUILD] Mode:", mode);

  // 🔥 Production Stability: Verify Firebase Presence (Silent Summary)
  const firebaseKeys = Object.keys(env).filter(k => k.includes('FIREBASE'));
  const missingFirebase = firebaseKeys.filter(k => !env[k]);

  if (missingFirebase.length > 0) {
    console.warn(`[BUILD] ⚠️ Missing Firebase keys: ${missingFirebase.join(', ')}`);
  } else {
    console.log(`[BUILD] ✅ Firebase Configuration: Found ${firebaseKeys.length} items.`);
  }

  // AI Service Keys Availability
  const mainApiKey = env.API_KEY_PRIVATETEACHER || env.GEMINI_API_KEY || env.API_KEY || '';
  console.log(`[BUILD] ✅ AI Service Key (Private Teacher): ${mainApiKey ? "LOADED" : "MISSING"}`);
  console.log("--------------------------------------------------");

  return {
    server: {
      host: '0.0.0.0',
    },

    plugins: [react()],

    /**
     * 🔒 CRITICAL
     * pdfjs-dist MUST NOT be prebundled
     * Otherwise workerSrc resolution BREAKS at runtime
     */
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },

    /**
     * 🔑 ENV KEYS — PRESERVED AS-IS
     * Required for EDUVA multi-agent AI routing
     */
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY_PRIVATETEACHER || env.GEMINI_API_KEY || env.API_KEY || ''),
      'process.env.API_KEY_NOTES': JSON.stringify(env.API_KEY_NOTES || env.API_KEY || ''),
      'process.env.API_KEY_QUIZ': JSON.stringify(env.API_KEY_QUIZ || env.API_KEY || ''),
      'process.env.API_KEY_EXAM': JSON.stringify(env.API_KEY_EXAM || env.API_KEY || ''),
      'process.env.API_KEY_TUTOR': JSON.stringify(env.API_KEY_TUTOR || env.API_KEY || ''),
      'process.env.API_KEY_UTILITY': JSON.stringify(env.API_KEY_UTILITY || env.API_KEY || ''),
      'process.env.API_KEY_CHEATSHEET': JSON.stringify(env.API_KEY_CHEATSHEET || env.API_KEY || ''),
      'process.env.API_KEY_PARENT': JSON.stringify(env.API_KEY_PARENT || env.API_KEY || ''),
      'process.env.API_KEY_PRIVATETEACHER': JSON.stringify(env.API_KEY_PRIVATETEACHER || env.API_KEY || ''),
      'process.env.API_KEY_INGESTION': JSON.stringify(env.API_KEY_INGESTION || env.API_KEY || ''),

      // 🔥 Unified Firebase Config (Standardized & Secure)
      '__FIREBASE_CONFIG__': JSON.stringify({
        apiKey: env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || '',
        authDomain: env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || '',
        measurementId: env.FIREBASE_MEASUREMENT_ID || env.VITE_FIREBASE_MEASUREMENT_ID || ''
      }),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,

      /**
       * 🔒 REQUIRED
       * Workers must be emitted as real files (not inlined)
       * This is REQUIRED for pdf.worker.min.js
       */
      assetsInlineLimit: 0,

      rollupOptions: {
        output: {
          manualChunks: {
            vendor: [
              'react',
              'react-dom',
              'recharts',
              'firebase/compat/app',
              'firebase/compat/auth',
              'firebase/compat/firestore',
            ],
            pdf: [
              'pdfjs-dist',
              'pdf-lib',
              '@react-pdf/renderer',
              'jspdf',
              'html2canvas',
            ],
          },
        },
      },
    },
  };
});
