import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import type { EntitlementResult } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // 1. Authenticate
    const user = await verifyAuth(req, res);
    if (!user) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { capabilities } = req.body; // Array of strings: ['quizzes', 'notes', 'radar']

    if (!capabilities || !Array.isArray(capabilities)) {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'capabilities must be an array' });
    }

    try {
        // 2. Resolve Account Owner (O(1) logic)
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND' });
        }
        const userData = userDoc.data();

        let payerUid = user.uid;
        if (user.role === 'STUDENT' && userData?.linkedParentId) {
            payerUid = userData.linkedParentId;
        }

        // 3. Fetch Active Subscription
        const subQuery = await db.collection('subscriptions')
            .where('ownerUid', '==', payerUid)
            .where('status', '==', 'active')
            .limit(1)
            .get();

        let planId = 'FREE';
        if (!subQuery.empty) {
            const subDoc = subQuery.docs[0];
            const sub = subDoc.data() as any;
            const now = Date.now();

            // --- EXPIRY CHECK ---
            if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
                console.warn(`[BulkEntitlement] Plan Expired for User ${payerUid}. Auto-downgrading.`);

                await db.runTransaction(async (t: any) => {
                    t.update(subDoc.ref, { status: 'past_due', endedAt: now });
                    t.update(db.collection('users').doc(payerUid), {
                        'plan.id': 'FREE',
                        'plan.status': 'canceled',
                        'plan.expiryDate': null
                    });
                }).catch(err => console.error('[BulkEntitlement] Auto-downgrade failed:', err));

                planId = 'FREE';
            } else {
                planId = sub.planId;
            }
        }

        // 4. Load Plan Limits & Usage
        const currentMonth = new Date().toISOString().slice(0, 7);
        const [planDoc, usageDoc] = await Promise.all([
            db.collection('plans').doc(planId).get(),
            db.collection('usage_counters').doc(`student_${user.uid}_${currentMonth}`).get()
        ]);

        const planLimits = planDoc.exists ? planDoc.data()?.limits : { quizzes: 3, ai_minutes: 5, notes: 2, linked_accounts: 1 };
        const usage = usageDoc.exists ? usageDoc.data() : { quizzesUsed: 0, aiSecondsUsed: 0, notesUsed: 0 };

        // 5. Capability Mapping Strategy
        const metricMap: Record<string, { limit: string, used: string }> = {
            'quizzes': { limit: 'quizzes', used: 'quizzesUsed' },
            'notes': { limit: 'notes', used: 'notesUsed' },
            'ai_seconds': { limit: 'ai_minutes', used: 'aiSecondsUsed' },
            'ai_minutes': { limit: 'ai_minutes', used: 'aiSecondsUsed' },
            'exams': { limit: 'exams', used: 'examsUsed' },
            'trainedmaterial': { limit: 'trainedmaterial', used: 'trainedMaterialUsed' },
            'pageLimit': { limit: 'pageLimit', used: 'none' } // pageLimit is a constraint, not a counter
        };

        const results: Record<string, EntitlementResult> = {};

        capabilities.forEach(cap => {
            const mapping = metricMap[cap];

            // Fallback for unknown capabilities (check features)
            if (!mapping) {
                const planData = planDoc.exists ? (planDoc.data() as any) : null;
                const features = planData?.features || {};
                const isAllowed = !!features[cap];
                results[cap] = {
                    allowed: isAllowed,
                    remaining: isAllowed ? -1 : 0,
                    reason: isAllowed ? undefined : 'plan_restriction'
                };
                return;
            }

            const limit = planLimits[mapping.limit] ?? 0;

            // Handle pure constraints (like pageLimit)
            if (mapping.used === 'none') {
                results[cap] = { allowed: true, remaining: limit };
                return;
            }

            // Handle counters
            let used = usage[mapping.used] ?? 0;

            // Special conversion for AI Seconds -> Minutes
            if (cap === 'ai_seconds' || cap === 'ai_minutes') {
                used = used / 60;
            }

            if (limit === -1) {
                results[cap] = { allowed: true, remaining: -1 };
            } else {
                const remaining = Math.max(0, limit - used);
                results[cap] = {
                    allowed: remaining > 0,
                    remaining: cap === 'ai_seconds' ? Math.floor(remaining * 60) : Math.floor(remaining),
                    reason: remaining <= 0 ? 'quota_exceeded' : undefined
                };
            }
        });

        console.log(`[BULK_ENTITLEMENT] Processed ${capabilities.length} checks for ${user.uid} (Plan: ${planId})`);
        return res.status(200).json(results);

    } catch (error) {
        console.error('Bulk Entitlement Error:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

