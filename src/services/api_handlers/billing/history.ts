import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import type { BillingEvent } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // 1. Verify Authentication
    const user = await verifyAuth(req, res);
    if (!user) return; // verifyAuth handles response

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        // 2. Fetch User's Subscriptions
        const subsSnapshot = await db.collection('subscriptions')
            .where('ownerUid', '==', user.uid)
            .get();

        if (subsSnapshot.empty) {
            return res.status(200).json({ events: [] });
        }

        const subIds = subsSnapshot.docs.map(doc => doc.id);

        // 3. Fetch Billing Events for these Subscriptions
        // Note: Firestore 'in' query supports max 10 values.
        // For robustness, we will chunk the requests if user has many subscriptions (rare, but correct).
        const chunks = [];
        for (let i = 0; i < subIds.length; i += 10) {
            chunks.push(subIds.slice(i, i + 10));
        }

        let allEvents: BillingEvent[] = [];

        for (const chunk of chunks) {
            const eventsSnapshot = await db.collection('billing_events')
                .where('subscriptionId', 'in', chunk)
                .get();

            const chunkEvents = eventsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as BillingEvent));
            allEvents = allEvents.concat(chunkEvents);
        }

        // 4. Sort Descending by Date (Newest First)
        allEvents.sort((a, b) => b.timestamp - a.timestamp);

        return res.status(200).json({ events: allEvents });

    } catch (error) {
        console.error('Billing History Fetch Error:', error);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

