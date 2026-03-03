import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import type { Subscription } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // Verify User Token (Security)
    const user = await verifyAuth(req, res);
    if (!user) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { planId, provider } = req.body;

    if (!planId || provider !== 'FAKE_GATEWAY') {
        return res.status(400).json({ error: 'INVALID_REQUEST' });
    }

    try {
        console.log(`[MockConfirm] Finalizing subscription for ${user.email} -> ${planId}`);
        const uid = user.uid;
        const subId = `sub_mock_${Date.now()}`;
        const now = Date.now();

        const planDoc = await db.collection('plans').doc(planId).get();
        const planData = planDoc.exists ? planDoc.data() : null;
        // PRICE HANDLING: Convert to Cents/Piastres for storage
        // If plan has price 200, we store 20000. 
        // Fallback 9900 is already in cents (99.00 EGP).
        const rawPrice = planData?.price || 99;
        const planPrice = rawPrice; // Store as Pounds
        const planCurrency = planData?.currency || 'EGP';
        const isYearly = planData?.billingCycle === 'YEARLY';
        const durationDays = isYearly ? 365 : 30;
        const expiryDate = now + (durationDays * 24 * 60 * 60 * 1000);

        // 1. SELF-HEALING: Cancel ANY existing active subscriptions first (Clean Slate)
        // ... (existing cancellation logic) ...
        const activeSubs = await db.collection('subscriptions')
            .where('ownerUid', '==', uid)
            .where('status', '==', 'active')
            .get();

        if (!activeSubs.empty) {
            console.log(`[MockConfirm] Cancelling ${activeSubs.size} existing active subscriptions for ${uid}`);
            const batch = db.batch();
            activeSubs.docs.forEach((doc: any) => {
                batch.update(doc.ref, {
                    status: 'canceled',
                    canceledAt: now,
                    cancelReason: 'upgrade_mock'
                });
            });
            await batch.commit();
        }

        // 2. Create Subscription Record (Server Side Authoritative)
        await db.collection('subscriptions').doc(subId).set({
            id: subId,
            ownerUid: uid,
            planId: planId,
            provider: 'FAKE_GATEWAY',
            providerSubId: `mock_tx_${Math.floor(Math.random() * 100000)}`,
            status: 'active',
            currentPeriodEnd: expiryDate,
            beneficiaries: [uid],
            createdAt: now,
            price: planPrice,
            currency: planCurrency
        } as Subscription);

        // 3. Update User Profile (Single Source of Truth)
        // Using structured 'plan' map, replacing legacy 'planTier'
        const importAdmin = await import('firebase-admin');
        const admin = importAdmin.default || importAdmin;

        await db.collection('users').doc(uid).update({
            plan: {
                id: planId,
                status: 'active',
                startDate: now,
                expiryDate: expiryDate
            },
            planTier: admin.firestore.FieldValue.delete(), // Cleanup legacy
            subscriptionStatus: 'ACTIVE'
        });

        // 4. Reset Usage Counters (Fresh Start)
        // Provide immediate value by clearing usage for the new plan
        const currentPeriodKey = new Date().toISOString().slice(0, 7); // YYYY-MM
        await db.collection('usage_counters').doc(`student_${uid}_${currentPeriodKey}`).delete();


        // 5. Create Billing History Event
        await db.collection('billing_events').add({
            subscriptionId: subId,
            amount: planPrice, // Use Real Price (Pounds)
            currency: planCurrency,
            status: 'paid',
            type: 'subscription_create',
            timestamp: now
        });

        return res.status(200).json({ success: true, subscriptionId: subId });

    } catch (error: any) {
        console.error('Mock Confirmation Failed:', error);
        return res.status(500).json({ error: error.message });
    }
}

