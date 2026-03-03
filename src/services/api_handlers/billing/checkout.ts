import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import { getGateway } from '../gateways/index.js'; // Gateway Factory
import type { BillingResponse } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[API] POST /billing/checkout - Start');
    if (!ensureHttps(req, res)) return;

    const user = await verifyAuth(req, res) as { uid: string; role: string; email?: string; plan?: string };
    if (!user) return;
    console.log(`[API] Checkout initiated by user: ${user.uid}`);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { planId, cycle } = req.body;
    console.log(`[API] Plan: ${planId}, Cycle: ${cycle}`);

    if (!planId) {
        return res.status(400).json({ error: 'MISSING_PLAN_ID' });
    }

    try {
        // 1. Verify Plan Exists and is Active
        const planDoc = await db.collection('plans').doc(planId).get();
        if (!planDoc.exists || !planDoc.data()?.isActive) {
            console.warn(`[API] Plan ${planId} invalid or inactive.`);
            return res.status(400).json({ error: 'INVALID_PLAN', message: 'This plan is not available.' });
        }

        const plan = { id: planDoc.id, ...planDoc.data() } as any;

        // 2. Resolve Payer (O(1))
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data();
        let payerUid = user.uid;
        let customerEmail = user.email || userData?.email;

        // Parent pays for Student check
        if (user.role === 'STUDENT' && userData?.linkedParentId) {
            payerUid = userData.linkedParentId;
            // ideally fetch parent email
            console.log(`[API] Student ${user.uid} -> Parent Payer ${payerUid}`);
        }

        // 3. Check for Existing Active Subscription
        const subQuery = await db.collection('subscriptions')
            .where('ownerUid', '==', payerUid)
            .where('status', '==', 'active')
            .get();

        if (!subQuery.empty) {
            const sub = subQuery.docs[0].data();
            if (sub.planId === planId) {
                console.log(`[API] User ${payerUid} already on plan ${planId}`);
                return res.status(400).json({ error: 'ALREADY_SUBSCRIBED', message: 'You are already on this plan.' });
            }
            // In a real app, you'd handle upgrades (proration) here via customer portal or update logic
            // providing a redirect to the portal is often best for existing subs
        }

        // 4. Handle Free Plans (Bypass Gateway)
        if (plan.price === 0) {
            console.log(`[API] Processing FREE plan subscription for ${payerUid}`);
            const now = Date.now();

            // A. Cancel Old Active Subscriptions (Self-Healing)
            const oldSubsQuery = await db.collection('subscriptions')
                .where('ownerUid', '==', payerUid)
                .where('status', '==', 'active')
                .get();

            if (!oldSubsQuery.empty) {
                console.log(`[API] Canceling ${oldSubsQuery.size} existing active subscriptions for clean Free state.`);
                const batch = db.batch();
                oldSubsQuery.docs.forEach(doc => {
                    batch.update(doc.ref, { status: 'canceled', canceledAt: now });
                });
                await batch.commit();
            }

            // B. Create New Free Subscription
            const subId = `sub_free_${now}`;
            await db.collection('subscriptions').doc(subId).set({
                id: subId,
                ownerUid: payerUid,
                planId: plan.id,
                provider: 'INTERNAL',
                providerSubId: 'free_tier',
                status: 'active',
                currentPeriodEnd: now + (30 * 24 * 60 * 60 * 1000), // +30 days (or infinite?)
                beneficiaries: [payerUid],
                createdAt: now
            });

            // C. Update User Profile
            // C. Update User Profile (Single Source of Truth)
            // We write the structured 'plan' map, replacing legacy 'planTier'
            const importAdmin = await import('firebase-admin'); // Import specifically for FieldValue
            const admin = importAdmin.default || importAdmin;
            await db.collection('users').doc(payerUid).update({
                plan: {
                    id: plan.id,
                    status: 'active',
                    startDate: now,
                    expiryDate: now + (30 * 24 * 60 * 60 * 1000) // 30 Days Validity
                },
                planTier: admin.firestore.FieldValue.delete(), // Cleanup legacy field
                subscriptionStatus: 'ACTIVE' // Maintain for other systems if needed, or delete? Keeping for safety.
            });

            // D. RESET USAGE QUOTA
            const currentMonth = new Date().toISOString().slice(0, 7);
            await db.collection('usage_counters').doc(`student_${payerUid}_${currentMonth}`).delete();

            const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
            return res.status(200).json({ checkoutUrl: `${baseUrl}/billing/success?session_id=free_upgrade` });
        }

        // 5. Delegate to Payment Gateway
        // The factory determines whether to use Paymob, Stripe, or Fake
        // based on keys and user location.
        const gateway = getGateway(userData);
        let baseUrl = (req.headers.origin && req.headers.origin !== 'null')
            ? req.headers.origin
            : (req.headers.host ? `http://${req.headers.host}` : process.env.NEXT_PUBLIC_APP_URL) || 'http://localhost:5173';

        // Sanitize: Remove quotes and trailing slashes for consistency
        baseUrl = baseUrl.replace(/['"]/g, '').replace(/\/$/, '');

        const result = await gateway.createCheckoutSession(
            {
                uid: payerUid,
                email: customerEmail,
                role: user.role,
                linkedParentId: userData?.linkedParentId
            },
            plan,
            { cycle },
            { baseUrl, cycle }
        );

        console.log('[API] Checkout session created successfully.');
        return res.status(200).json({ checkoutUrl: result.url });

    } catch (error: any) {
        console.error('Checkout creation failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
}

