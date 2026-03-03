import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Environment Variables from .env.local
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const index = trimmed.indexOf('=');
            if (index > 0) {
                const key = trimmed.substring(0, index).trim();
                const value = trimmed.substring(index + 1).replace(/^['"]|['"]$/g, '').trim();
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log('✅ .env.local loaded.');
    } else {
        console.error('❌ .env.local not found.');
        process.exit(1);
    }
}

loadEnv();

// 2. Initialize Firebase Admin
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in environment.');
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function cleanAnonymousUsers() {
    console.log('--- DB CLEANUP START ---');

    let totalDeleted = 0;
    let nextPageToken;

    try {
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);

            for (const userRecord of listUsersResult.users) {
                // Criteria for anonymous/guest users:
                // 1. providerData is empty (no Google, Password, etc.)
                // 2. email is missing
                const isAnonymous = userRecord.providerData.length === 0 && !userRecord.email;

                if (isAnonymous) {
                    console.log(`[Target] UID: ${userRecord.uid} | Name: ${userRecord.displayName || 'Unnamed'}`);

                    // Delete from Firestore
                    await db.collection('users').doc(userRecord.uid).delete();
                    console.log(`  - Deleted Firestore doc: ${userRecord.uid}`);

                    // Delete from Auth
                    await auth.deleteUser(userRecord.uid);
                    console.log(`  - Deleted Auth user: ${userRecord.uid}`);

                    totalDeleted++;
                }
            }

            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        console.log(`\n✅ Cleanup complete. Total anonymous users purged: ${totalDeleted}`);

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        process.exit(0);
    }
}

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
    console.log('⚠️ DRY RUN ENABLED - No deletions will occur.');
    async function dryRun() {
        let count = 0;
        let nextPageToken;
        try {
            do {
                const listUsersResult = await auth.listUsers(1000, nextPageToken);
                for (const userRecord of listUsersResult.users) {
                    if (userRecord.providerData.length === 0 && !userRecord.email) {
                        console.log(`[Potential Match] UID: ${userRecord.uid} | Name: ${userRecord.displayName}`);
                        count++;
                    }
                }
                nextPageToken = listUsersResult.pageToken;
            } while (nextPageToken);
            console.log(`\nFound ${count} anonymous users to clean.`);
        } catch (error) {
            console.error('❌ Error during dry-run:', error);
        } finally {
            process.exit(0);
        }
    }
    dryRun();
} else {
    cleanAnonymousUsers();
}
