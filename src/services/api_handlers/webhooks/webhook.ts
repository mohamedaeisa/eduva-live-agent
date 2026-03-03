import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Webhooks from Stripe come from their servers, not our frontend.
    if (!ensureHttps(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        // Mocking Stripe Event for Phase 4
        const event = req.body;
        const { id: eventId, type, data } = event;

        if (!eventId || !type) {
            return res.status(400).json({ error: 'INVALID_EVENT' });
        }

        // 1. Idempotency Check
        const eventRef = db.collection('processed_webhook_events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
            console.log(`Event ${eventId} already processed. Skipping.`);
            return res.status(200).json({ received: true });
        }

        if (type === 'checkout.session.completed') {
            const session = data.object;
            const ownerUid = session.client_reference_id;
            const planId = session.metadata?.planId || 'PRO'; // Should be in metadata

            console.log(`Processing subscription creation for ${ownerUid} on plan ${planId}`);

            // Idempotency Check (Business Logic - Active Sub)
            const existingSub = await db.collection('subscriptions')
                .where('ownerUid', '==', ownerUid)
                .where('status', '==', 'active')
                .get();

            const batch = db.batch();

            // 2. Deactivate old subs (Upgrade path)
            if (!existingSub.empty) {
                existingSub.docs.forEach(doc => {
                    batch.update(doc.ref, { status: 'canceled', canceledAt: admin.firestore.FieldValue.serverTimestamp() });
                });
            }

            // 3. Create New Subscription
            const newSubRef = db.collection('subscriptions').doc();
            batch.set(newSubRef, {
                id: newSubRef.id,
                ownerUid: ownerUid,
                planId: planId,
                status: 'active',
                provider: 'STRIPE', // or MOCK
                providerSubId: session.subscription, // Stripe Sub ID
                currentPeriodEnd: session.expires_at || Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 days
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                beneficiaries: [ownerUid] // Default self
            });

            // 4. Update User Profile Claims Cache (Sync optimization)
            const userRef = db.collection('users').doc(ownerUid);
            batch.update(userRef, {
                planTier: planId,
                subscriptionStatus: 'ACTIVE'
            });

            // 5. Record Processed Event (Atomically)
            batch.set(eventRef, {
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                type: type,
                provider: 'STRIPE'
            });

            await batch.commit();
            console.log('Subscription created successfully.');
        } else {
            // 4. Webhook Order Inversion / Unhandled Events
            // We strictly ignore any event that isn't the authoritative subscription creator.
            // This handles cases where invoice.paid arrives before checkout.session.completed.
            // console.log(`Ignored non-authoritative event: ${type}`);
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook processing failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

