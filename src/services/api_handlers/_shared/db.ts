import type { ServiceAccount } from 'firebase-admin';
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Helper to manually load .env.local if Vercel/Node didn't (Local Dev Fix)
// Helper to manually load .env.local if Vercel/Node didn't (Local Dev Fix)
// --- SINGLETON SETUP ---
// We attach to the global scope to survive module re-evaluations in dev mode
const globalAny: any = global;

function loadEnvLocal() {
    if (globalAny._envLoaded) return;

    try {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return;

        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').replace(/^['"]|['"]$/g, '').trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
            console.log('[DB] .env.local loaded successfully.');
        }
        globalAny._envLoaded = true;
    } catch (e) {
        console.warn('[DB] Failed to manual load .env.local', e);
    }
}

// Ensure env is loaded before anything else
loadEnvLocal();

function initializeFirebase() {
    if (globalAny._firebaseInstance) {
        return globalAny._firebaseInstance;
    }

    const firebaseApp = (admin as any).default || admin;

    if (!firebaseApp.apps?.length) {
        try {
            const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

            if (serviceAccountJson) {
                // console.log('[DB] Initializing Firebase Admin...');
                const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
                firebaseApp.initializeApp({
                    credential: firebaseApp.credential.cert(serviceAccount)
                });
                // console.log('[DB] Firebase Admin Initialized Successfully.');
            } else {
                console.warn('[DB] No FIREBASE_SERVICE_ACCOUNT_KEY found. Using default.');
                firebaseApp.initializeApp();
            }
        } catch (error) {
            console.error('[DB] CRITICAL: Firebase Init Failed:', error);
            throw error;
        }
    }

    // Cache the instance globally
    globalAny._firebaseInstance = firebaseApp.firestore();
    return globalAny._firebaseInstance;
}

// Single singleton instance
export const db = initializeFirebase();

/** @deprecated Use direct 'db' import for better performance */
export function getDb() {
    return db;
}

