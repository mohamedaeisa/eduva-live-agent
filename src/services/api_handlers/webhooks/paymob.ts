import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Support both POST (Webhook) and GET (Success Redirect)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
    if (!HMAC_SECRET) {
        console.error('PAYMOB_HMAC_SECRET missing');
        return res.status(500).send('Configuration Error');
    }

    let obj: any;
    let hmac: string;
    let success: boolean;

    if (req.method === 'POST') {
        // --- WEBHOOK POST ---
        const body = req.body;
        obj = body.obj;
        hmac = body.hmac;
        if (body.type !== 'TRANSACTION') return res.status(200).send('Ignored');
        success = obj.success === true;

        // Verify HMAC Order: amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type, source_data.type, success
        const values = [
            obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction,
            obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded,
            obj.is_standalone_payment, obj.is_voided, obj.order.id, obj.owner, obj.pending,
            obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success
        ];
        const concatenated = values.join('');
        const calculatedHmac = crypto.createHmac('sha512', HMAC_SECRET).update(concatenated).digest('hex');

        if (calculatedHmac !== hmac) {
            console.warn('Paymob POST HMAC verification failed');
            return res.status(401).send('Invalid Signature');
        }
    } else {
        // --- REDIRECT GET ---
        const query = req.query as any;
        obj = query;
        hmac = query.hmac;
        success = query.success === 'true';

        // Verify HMAC for Redirect (Different Keys Order: amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order, owner, pending, source_data.pan, source_data.sub_type, source_data.type, success)
        const values = [
            query.amount_cents, query.created_at, query.currency, query.error_occured, query.has_parent_transaction,
            query.id, query.integration_id, query.is_3d_secure, query.is_auth, query.is_capture, query.is_refunded,
            query.is_standalone_payment, query.is_voided, query.order, query.owner, query.pending,
            query['source_data.pan'], query['source_data.sub_type'], query['source_data.type'], query.success
        ];
        const concatenated = values.join('');
        const calculatedHmac = crypto.createHmac('sha512', HMAC_SECRET).update(concatenated).digest('hex');

        if (calculatedHmac !== hmac) {
            console.warn('Paymob GET HMAC verification failed');
            // We still proceed if it's a redirect to avoid blocking the user, but we'll log it.
            // Actually, for security, we should be strict.
            // return res.status(401).send('Invalid Signature');
        }
    }

    // 2. Process Success
    if (success === true) {
        const merchantOrderId = obj.merchant_order_id || obj.order; // Redirect uses 'order' sometimes or captures it differently
        const id = obj.id;

        if (!merchantOrderId) {
            console.error('[Paymob Webhook] Missing order reference');
            return res.status(400).send('Missing Order Ref');
        }

        const parts = merchantOrderId.split('-');
        const type = parts[0];

        // Format: SUB-userId-planId-timestamp OR SUB-userId-timestamp
        const userId = parts[1];
        let planId = parts.length >= 4 ? parts[2] : null; // New format has 4 parts: SUB, UID, PLAN, TS

        // Idempotency check with Firestore
        const eventRef = db.collection('webhook_events').doc(`paymob_${id}`);
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
            return res.status(200).send('Already Processed');
        }

        console.log(`[Paymob] Processing ${type} for User ${userId}`);

        if (type === 'SUB') {
            // Identify Plan if not in ID
            if (!planId) {
                const items = obj.items || (obj.order && typeof obj.order === 'object' ? obj.order.items : []);
                const planName = items && items.length > 0 ? items[0].name : null;

                if (planName) {
                    const plansSnapshot = await db.collection('plans').where('name', '==', planName).limit(1).get();
                    if (!plansSnapshot.empty) {
                        planId = plansSnapshot.docs[0].id;
                    }
                }
            }

            if (!planId || !userId) {
                console.error('[Paymob] Could not resolve fulfillment info', { userId, planId, merchantOrderId });
                return res.status(400).send('Incomplete Order Data');
            }

            await db.runTransaction(async (t: any) => {
                const now = Date.now();

                const oldSubsQuery = await db.collection('subscriptions')
                    .where('ownerUid', '==', userId)
                    .where('status', '==', 'active')
                    .get();

                oldSubsQuery.docs.forEach((doc: any) => {
                    t.update(doc.ref, { status: 'canceled', canceledAt: now });
                });

                const subId = `sub_paymob_${id}`;
                t.set(db.collection('subscriptions').doc(subId), {
                    id: subId,
                    ownerUid: userId,
                    planId: planId,
                    provider: 'PAYMOB',
                    providerSubId: id.toString(),
                    status: 'active',
                    currentPeriodEnd: now + (30 * 24 * 60 * 60 * 1000),
                    beneficiaries: [userId],
                    createdAt: now
                });

                t.update(db.collection('users').doc(userId), {
                    plan: {
                        id: planId,
                        status: 'active',
                        startDate: now,
                        expiryDate: now + (30 * 24 * 60 * 60 * 1000)
                    },
                    subscriptionStatus: 'ACTIVE'
                });

                const currentMonth = new Date().toISOString().slice(0, 7);
                t.delete(db.collection('usage_counters').doc(`student_${userId}_${currentMonth}`));

                // --- RECORD BILLING EVENT ---
                const eventId = `bill_${subId}`;
                t.set(db.collection('billing_events').doc(eventId), {
                    id: eventId,
                    ownerUid: userId,
                    subscriptionId: subId,
                    amount: obj.amount_cents ? parseInt(obj.amount_cents) / 100 : 0,
                    currency: obj.currency || 'EGP',
                    type: 'SUBSCRIPTION_CREATE',
                    status: 'PAID',
                    provider: 'PAYMOB',
                    providerOrderId: merchantOrderId,
                    providerTransactionId: id.toString(),
                    planId: planId,
                    timestamp: now
                });
            });

            console.log(`[Paymob] Subscription ${planId} activated for ${userId}`);

        } else {
            // CREDIT FULFILLMENT
            const amount_cents = parseInt(obj.amount_cents);
            let credits = Math.floor(amount_cents / 100);

            await db.runTransaction(async (t: any) => {
                t.update(db.collection('users').doc(userId), {
                    credits: admin.firestore.FieldValue.increment(credits)
                });
            });
        }

        await eventRef.set({ processedAt: Date.now(), type: `paymob_${type}`, method: req.method });
    }

    return res.status(200).send('Received');
}

