import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './db.js';

// Ensure DB is initialized before using Auth
getDb();

export function ensureHttps(req: VercelRequest, res: VercelResponse): boolean {
    // 1. Allow explicit Development Mode
    if (process.env.NODE_ENV === 'development') return true;

    // 2. Allow Localhost (even if NODE_ENV is production/undefined locally)
    const host = req.headers['host'] || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return true;
    }

    // 3. Enforce HTTPS for public internet traffic
    const proto = req.headers['x-forwarded-proto'];
    if (proto !== 'https') {
        console.warn(`[GUARD] Blocked Payload. Proto: ${proto}, Host: ${host}`);
        res.status(403).json({ error: 'HTTPS_REQUIRED', message: 'This endpoint requires a secure connection.' });
        return false;
    }
    return true;
}

export async function verifyAuth(req: VercelRequest, res: VercelResponse): Promise<{ uid: string; role: string; email?: string; plan?: string } | null> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing or invalid Authorization header.' });
        return null;
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        // Real implementation:
        const decodedToken = await getAuth().verifyIdToken(token);

        // Extract useful claims
        const uid = decodedToken.uid;
        // @ts-ignore - custom claims might not be in standard type definition without extending
        const role = decodedToken.role || 'STUDENT';
        // @ts-ignore
        const plan = decodedToken.plan || 'FREE';
        const email = decodedToken.email;

        return { uid, role, email, plan };

    } catch (error) {
        console.error('Auth verification failed:', error);
        res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid token.' });
        return null;
    }
}

