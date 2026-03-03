import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // 1. Verify Auth
    const user = await verifyAuth(req, res);
    if (!user) return; // verifyAuth handles response

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const usageId = `student_${user.uid}_${currentMonth}`;

        console.log(`[API] Fetching usage for: ${usageId}`);

        const usageDoc = await db.collection('usage_counters').doc(usageId).get();

        if (!usageDoc.exists) {
            return res.status(200).json({
                usage: {
                    quizzesUsed: 0,
                    aiSecondsUsed: 0,
                    notesUsed: 0
                }
            });
        }

        return res.status(200).json({ usage: usageDoc.data() });

    } catch (error) {
        console.error('Usage Fetch Error:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

