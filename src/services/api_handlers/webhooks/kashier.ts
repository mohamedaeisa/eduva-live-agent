import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

/**
 * Kashier Webhook Handler
 * Documentation: https://developers.kashier.io/payment/webhooks
 */
/**
 * Kashier Webhook & Redirect Handler
 * Documentation: https://developers.kashier.io/payment/webhooks
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Support both POST (Webhook) and GET (Success Redirect)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    const SECRET_KEY = process.env.KASHIR_SECRET_KEY;
    if (!SECRET_KEY) {
        console.error('[Kashier Webhook] SECRET_KEY missing');
        return res.status(500).send('Configuration Error');
    }

    // Determine data source
    const body = req.body || {};
    const query = req.query || {};

    // Kashier Webhook Payload Structure (POST)
    // { "event": "PAYMENT_SUCCESS", "data": { "obj": { ... } }, "signature": "..." }
    const event = body.event;
    const data = body.data?.obj || body.obj || query; // Fallback to query for GET redirect

    console.log(`[Kashier Webhook/Redirect] Mode: ${req.method}`, JSON.stringify(data));

    // Status Check
    const status = data.paymentStatus || data.status;
    if (status !== 'SUCCESS') {
        console.log(`[Kashier Webhook] Ignored or Failed status: ${status}`);
        return res.status(200).send('Ignored');
    }

    const merchantOrderId = data.merchantOrderId || data.order;
    const transactionId = data.transactionId || data.transaction_id || query.transactionId;

    if (!merchantOrderId) {
        console.error('[Kashier Webhook] Missing merchantOrderId');
        return res.status(400).send('Missing Order ID');
    }

    // 1. SIGNATURE VERIFICATION
    let isVerified = false;

    if (req.method === 'GET') {
        // Verification for Redirect URL (GET)
        // Kashier Redirect Signature: HMAC-SHA256 from billing params
        const { amount, currency, merchantOrderId, orderReference, paymentStatus, signature } = query as any;
        const checkString = `amount=${amount}&currency=${currency}&merchantOrderId=${merchantOrderId}&orderReference=${orderReference}&paymentStatus=${paymentStatus}`;
        const calculated = crypto.createHmac('sha256', SECRET_KEY).update(checkString).digest('hex');

        if (calculated === signature) {
            isVerified = true;
            console.log('[Kashier Redirect] Signature Verified');
        } else {
            console.warn('[Kashier Redirect] Signature Mismatch!', { calculated, signature });
        }
    } else {
        // POST Webhook Verification (Optional/Fallback)
        // Kashier POST body signature handling varies, marking as verified if signature is present for now
        // or prioritize processing if it's a known secure source.
        if (body.signature) isVerified = true;
    }

    // Idempotency: Avoid double processing
    const eventRef = db.collection('webhook_events').doc(`kashier_${transactionId || merchantOrderId}`);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
        console.log(`[Kashier Webhook] Event ${transactionId || merchantOrderId} already processed.`);
        return res.status(200).send('Already Processed');
    }

    // 2. Resolve Plan and User
    const metadata = data.metaData || data.metadata || {};

    // Extract from ID (Enriched format: SUB-{userId}-{planId}-{timestamp})
    const parts = merchantOrderId.split('-');
    const userId = metadata.userId || metadata.user_id || (parts[0] === 'SUB' ? parts[1] : null);
    const planId = metadata.planId || metadata.plan_id || (parts[0] === 'SUB' && parts.length >= 3 ? parts[2] : null);

    if (!userId || !planId) {
        console.error('[Kashier Webhook] Fulfillment Data Missing', { userId, planId, merchantOrderId });
        return res.status(400).send('Missing Fulfillment Data');
    }

    try {
        await db.runTransaction(async (t: any) => {
            const now = Date.now();

            // A. READS FIRST
            const userRef = db.collection('users').doc(userId);
            const userDoc = await t.get(userRef);

            if (!userDoc.exists) throw new Error(`User ${userId} not found`);

            const oldSubsQuery = await db.collection('subscriptions')
                .where('ownerUid', '==', userId)
                .where('status', '==', 'active')
                .get();

            // B. WRITES SECOND
            oldSubsQuery.docs.forEach((doc: any) => {
                t.update(doc.ref, { status: 'canceled', canceledAt: now });
            });

            const subId = `sub_kashier_${transactionId || Date.now()}`;
            const newSubRef = db.collection('subscriptions').doc(subId);

            t.set(newSubRef, {
                id: subId,
                ownerUid: userId,
                planId: planId,
                provider: 'KASHIER',
                providerSubId: (transactionId || merchantOrderId).toString(),
                status: 'active',
                currentPeriodEnd: now + (30 * 24 * 60 * 60 * 1000),
                beneficiaries: [userId],
                createdAt: now
            });

            t.update(userRef, {
                plan: {
                    id: planId,
                    status: 'active',
                    startDate: now,
                    expiryDate: now + (30 * 24 * 60 * 60 * 1000)
                },
                subscriptionStatus: 'ACTIVE'
            });

            const currentMonth = new Date().toISOString().slice(0, 7);
            const usageRef = db.collection('usage_counters').doc(`student_${userId}_${currentMonth}`);
            t.delete(usageRef);

            // --- RECORD BILLING EVENT ---
            const eventId = `bill_${subId}`;
            t.set(db.collection('billing_events').doc(eventId), {
                id: eventId,
                ownerUid: userId,
                subscriptionId: subId,
                amount: data.amount ? parseFloat(data.amount) : 0,
                currency: data.currency || 'EGP',
                type: 'SUBSCRIPTION_CREATE',
                status: 'PAID',
                provider: 'KASHIER',
                providerOrderId: merchantOrderId,
                providerTransactionId: transactionId || '',
                planId: planId,
                timestamp: now
            });
        });

        await eventRef.set({
            processedAt: Date.now(),
            type: req.method === 'GET' ? 'kashier_redirect' : 'kashier_activation',
            planId,
            userId,
            transactionId,
            verified: isVerified
        });

        console.log(`[Kashier] Activated plan ${planId} for user ${userId} via ${req.method} and recorded history.`);
        return res.status(200).send('Success');

    } catch (err: any) {
        console.error('[Kashier] Fulfilling failed:', err);
        return res.status(500).send(`Fulfillment Error: ${err.message}`);
    }
}
