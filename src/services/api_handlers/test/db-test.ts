import { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvLocal(log: (msg: string) => void) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return;
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/FIREBASE_SERVICE_ACCOUNT_KEY='(.+)'/);
            if (match && match[1]) {
                process.env.FIREBASE_SERVICE_ACCOUNT_KEY = match[1];
            }
        }
    } catch (e) { }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    log('--- DB CONNECTION TEST (CONSOLIDATED) ---');
    loadEnvLocal(log);

    const firebaseApp = (admin as any).default || admin;

    try {
        const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (envKey) {
            log('FIREBASE_SERVICE_ACCOUNT_KEY found.');
        } else {
            log('WARNING: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is MISSING.');
        }

        const appCount = firebaseApp.apps ? firebaseApp.apps.length : 0;
        if (appCount === 0) {
            if (envKey) {
                firebaseApp.initializeApp({
                    credential: firebaseApp.credential.cert(JSON.parse(envKey))
                });
            } else {
                firebaseApp.initializeApp();
            }
        }

        const db = firebaseApp.firestore();
        const collections = await db.listCollections();
        const collectionNames = collections.map((c: any) => c.id);
        log(`SUCCESS! Found collections: ${collectionNames.join(', ')}`);
        return res.status(200).json({ status: 'OK', logs, collections: collectionNames });

    } catch (err: any) {
        log(`ERROR: ${err.message}`);
        return res.status(500).json({ status: 'FAIL', logs, error: err.message });
    }
}

