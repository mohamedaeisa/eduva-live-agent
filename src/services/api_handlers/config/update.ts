import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // Verify Auth & Admin Role
    const user = await verifyAuth(req, res);
    if (!user) return; // verifyAuth handles response

    // Check for admin role logic
    if (user.role !== 'ADMIN' && user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const { costs, packages } = req.body;

        if (!costs || !packages) {
            return res.status(400).json({ error: 'MISSING_DATA' });
        }

        await db.collection('system_config').doc('monetization').set({
            costs,
            packages,
            updatedAt: Date.now(),
            updatedBy: user.uid
        });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Config Update Error:', error);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

