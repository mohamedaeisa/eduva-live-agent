import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Can be called by Frontend after successful payment/upgrade to force refresh token
    if (!ensureHttps(req, res)) return;

    const user = await verifyAuth(req, res);
    if (!user) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        // 1. Fetch Authoritative User Data
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        const userData = userDoc.data();
        const planTier = userData?.planTier || 'FREE';
        const role = userData?.role || 'STUDENT';

        // 2. Set Custom Claims via Admin SDK
        await admin.auth().setCustomUserClaims(user.uid, {
            plan: planTier,
            role: role
        });

        return res.status(200).json({ success: true, plan: planTier });

    } catch (error) {
        console.error('Claims sync failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

