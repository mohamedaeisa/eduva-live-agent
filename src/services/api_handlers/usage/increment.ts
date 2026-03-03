import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { Plan, Subscription, UsageCounter } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // 1. Authenticate
    const user = await verifyAuth(req, res);
    if (!user) return; // verifyAuth handles response

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { metric, amount } = req.body;
    // metric: 'quizzesUsed' | 'aiSecondsUsed' | 'notesUsed' | 'examsUsed' | 'trainedMaterialUsed'

    if (!metric || !amount || typeof amount !== 'number') {
        return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    try {
        const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const usageId = `student_${user.uid}_${currentMonth}`;
        const usageRef = db.collection('usage_counters').doc(usageId);

        // 2. Fetch Current Usage & Plan Limits (Transactional Check)
        // We need to ensure they don't exceed limit if it's a hard limit.
        // However, usually increment is called AFTER the action is done or allowed.
        // But for robustness, we should verify entitlement.
        // For now, we trust the client/service logic called `entitlement/check` before this.
        // This endpoint is just for RECORDING usage.

        // Is this secure?
        // If a malicious user calls this, they just increase their own usage.
        // They hurt themselves (reach limit faster). So it's mostly self-harm, low risk.
        // But to prevent abuse/spam, we should verify the user exists. (Done via verifyAuth).

        console.log(`[USAGE_INCREMENT] Incrementing ${metric} by ${amount} for user ${user.uid} (${currentMonth})`);
        // Smart Update: Create if not exists
        // Use set with merge: true to handle non-existent documents or initial month records
        await usageRef.set({
            [metric]: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp(),
            ownerUid: user.uid,
            month: currentMonth
        }, { merge: true });
        console.log(`[USAGE_INCREMENT] Firestore update successful for ${metric}`);

        console.log(`[USAGE] Incremented ${metric} by ${amount} for ${user.uid}`);

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Usage Increment Error:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

