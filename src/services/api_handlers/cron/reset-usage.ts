import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Security Check: Admin / Cron Only
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || 'dev_cron_secret';

    if (authHeader !== `Bearer ${cronSecret}`) {
        if (req.headers['x-vercel-cron'] !== '1') {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7); // "YYYY-MM"

        console.log(`Starting Validated Usage Reset/Check for: ${currentMonth}`);

        const subsSnapshot = await db.collection('subscriptions')
            .where('status', '==', 'active')
            .limit(100)
            .get();

        if (subsSnapshot.empty) {
            return res.status(200).json({ message: 'No active subscriptions to process.' });
        }

        const batch = db.batch();
        let operations = 0;

        for (const subDoc of subsSnapshot.docs) {
            const sub = subDoc.data();
            const ownerUid = sub.ownerUid;
            const beneficiaries = sub.beneficiaries || [ownerUid];

            for (const studentUid of beneficiaries) {
                const usageId = `student_${studentUid}_${currentMonth}`;
                const usageRef = db.collection('usage_counters').doc(usageId);

                batch.set(usageRef, {
                    studentUid: studentUid,
                    month: currentMonth,
                    lastResetCheck: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                operations++;
            }
        }

        await batch.commit();

        console.log(`Processed ${operations} usage counters for ${currentMonth}.`);
        return res.status(200).json({
            success: true,
            month: currentMonth,
            processed: operations
        });

    } catch (error) {
        console.error('Cron job failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

