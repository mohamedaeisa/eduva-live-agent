import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import type { EntitlementResult, Plan, Subscription, UsageCounter } from '../../../types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    // 1. Authenticate Request
    const user = await verifyAuth(req, res);
    if (!user) return; // verifyAuth handles response

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { capability } = req.body; // e.g., 'quizzes', 'ai_minutes'

    try {
        // 2. Resolve Account Owner (O(1) logic)
        // Fetch full user profile to get linkedParentId
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND' });
        }
        const userData = userDoc.data();

        let payerUid = user.uid;
        // PA8.1 Fix: Use direct link if available
        if (user.role === 'STUDENT' && userData?.linkedParentId) {
            payerUid = userData.linkedParentId;
        }

        // 3. Fetch Active Subscription
        // Rule: Only ONE active subscription per owner
        const subQuery = await db.collection('subscriptions')
            .where('ownerUid', '==', payerUid)
            .where('status', '==', 'active')
            .limit(1)
            .get();

        let planId = 'FREE'; // Default
        if (!subQuery.empty) {
            const subDoc = subQuery.docs[0];
            const sub = subDoc.data() as Subscription;
            const now = Date.now();

            // --- LAYER 1: EXPIRY CHECK ---
            // Automated System Check: Is the plan expired?
            if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
                console.warn(`[Entitlement] Plan Expired for User ${payerUid}. Auto-downgrading to FREE.`);

                // 1. Update Subscription Status in background (Fire & Forget for speed, or await if strict)
                // We await to ensure DB consistency before returning 'allowed'
                await db.runTransaction(async (t: any) => {
                    t.update(subDoc.ref, { status: 'past_due', endedAt: now });
                    t.update(db.collection('users').doc(payerUid), {
                        'plan.id': 'FREE',
                        'plan.status': 'canceled',
                        'plan.expiryDate': null
                    });
                }).catch(err => console.error('[Entitlement] Failed to auto-downgrade:', err));

                // 2. Force Free Tier for THIS request
                planId = 'FREE';

            } else {
                // Verify beneficiary if payer is different
                if (payerUid !== user.uid) {
                    if (sub.beneficiaries && sub.beneficiaries.includes(user.uid)) {
                        planId = sub.planId;
                    } else {
                        // Formatting Note: Parent has sub, but student isn't in it -> FREE
                        planId = 'FREE';
                    }
                } else {
                    planId = sub.planId;
                }
            }
        }

        // 4. Load Plan Limits
        const planDoc = await db.collection('plans').doc(planId).get();
        // Fallback to coded defaults if FREE plan doc missing (safety)
        const planLimits = planDoc.exists ? (planDoc.data() as Plan).limits : { quizzes: 3, ai_minutes: 5, notes: 2, linked_accounts: 1 };

        // 5. Check Usage (for the Student, NOT the Payer)
        const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const usageId = `student_${user.uid}_${currentMonth}`;
        const usageDoc = await db.collection('usage_counters').doc(usageId).get();
        const usage = usageDoc.exists ? (usageDoc.data() as UsageCounter) : { quizzesUsed: 0, aiSecondsUsed: 0, notesUsed: 0 };

        // 6. Fetch System Configuration for Costs
        let costs = { quiz: 2, exam: 3, ai_tutor_min: 1, note: 1 }; // Default fallback
        try {
            const configDoc = await db.collection('system_config').doc('monetization').get();
            if (configDoc.exists) {
                costs = { ...costs, ...configDoc.data()?.costs };
            }
        } catch (e) {
            console.warn('Failed to fetch monetization config, using defaults');
        }

        // Fetch Credits from PAYER (Parent if linked)
        let availableCredits = 0;
        if (payerUid === user.uid) {
            availableCredits = userData?.credits || 0;
        } else {
            // Fetch Parent Doc
            const parentDoc = await db.collection('users').doc(payerUid).get();
            availableCredits = parentDoc.exists ? (parentDoc.data()?.credits || 0) : 0;
        }

        // 7. Calculate Entitlement
        let allowed = false;
        let remaining = 0;
        let reason: EntitlementResult['reason'] = undefined;

        const checkCreditFallback = (cost: number) => {
            if (availableCredits >= cost) {
                return { allowed: true, usingCredits: true, cost };
            }
            return { allowed: false, reason: 'insufficient_credits' as const };
        };

        switch (capability) {
            case 'quizzes':
                if (planLimits.quizzes === -1) {
                    allowed = true;
                    remaining = -1;
                } else {
                    remaining = Math.max(0, planLimits.quizzes - (usage.quizzesUsed || 0));
                    if (remaining > 0) {
                        allowed = true;
                    } else {
                        // Plan quota exhausted, check credits
                        const creditCheck = checkCreditFallback(costs.quiz);
                        if (creditCheck.allowed) {
                            allowed = true;
                            // We don't verify 'remaining' for credits here, just allowance
                        } else {
                            allowed = false;
                            reason = 'quota_exceeded';
                        }
                    }
                }
                break;

            case 'ai_minutes':
                if (planLimits.ai_minutes === -1) {
                    allowed = true;
                    remaining = -1;
                } else {
                    const usedMinutes = (usage.aiSecondsUsed || 0) / 60;
                    remaining = Math.max(0, planLimits.ai_minutes - usedMinutes);
                    if (remaining > 0) {
                        allowed = true;
                    } else {
                        const creditCheck = checkCreditFallback(costs.ai_tutor_min);
                        if (creditCheck.allowed) {
                            allowed = true;
                        } else {
                            allowed = false;
                            reason = 'quota_exceeded';
                        }
                    }
                }
                break;

            case 'notes':
                {
                    const limit = (planLimits as any).notes ?? -1;
                    const used = (usage as any).notesUsed ?? 0;
                    if (limit === -1) {
                        allowed = true;
                        remaining = -1;
                    } else {
                        remaining = Math.max(0, limit - used);
                        if (remaining > 0) {
                            allowed = true;
                        } else {
                            const creditCheck = checkCreditFallback(costs.note);
                            if (creditCheck.allowed) {
                                allowed = true;
                            } else {
                                allowed = false;
                                reason = 'quota_exceeded';
                            }
                        }
                    }
                }
                break;

            case 'exams':
                {
                    const limit = (planLimits as any).exams ?? -1;
                    const used = (usage as any).examsUsed ?? 0;
                    if (limit === -1) {
                        allowed = true;
                        remaining = -1;
                    } else {
                        remaining = Math.max(0, limit - used);
                        if (remaining > 0) {
                            allowed = true;
                        } else {
                            const creditCheck = checkCreditFallback(costs.exam);
                            if (creditCheck.allowed) {
                                allowed = true;
                            } else {
                                allowed = false;
                                reason = 'quota_exceeded';
                            }
                        }
                    }
                }
                break;

            case 'trainedmaterial':
                {
                    const limit = (planLimits as any).trainedmaterial ?? -1;
                    const used = (usage as any).trainedMaterialUsed ?? 0;
                    console.log(`[ENTITLEMENT] Checking trainedmaterial: Limit=${limit}, Used=${used}`);
                    if (limit === -1) {
                        allowed = true;
                        remaining = -1;
                    } else {
                        remaining = Math.max(0, limit - used);
                        if (remaining > 0) {
                            allowed = true;
                        } else {
                            // No credit fallback yet for library training unless specified?
                            // Defaulting to quota_exceeded
                            allowed = false;
                            reason = 'quota_exceeded';
                        }
                    }
                    console.log(`[ENTITLEMENT] Result for trainedmaterial: Allowed=${allowed}, Remaining=${remaining}, Reason=${reason}`);
                }
                break;

            default:
                // Feature Flags
                const planData = planDoc.exists ? (planDoc.data() as Plan) : null;
                const planFeatures = planData?.features || {};

                if (planFeatures[capability as keyof typeof planFeatures]) {
                    allowed = true;
                    remaining = -1;
                } else {
                    // Feature flags generally isn't covered by credits (unless we sell features)
                    allowed = false;
                    reason = 'plan_restriction';
                }
        }

        const result: EntitlementResult = { allowed, remaining, reason };
        return res.status(200).json(result);

    } catch (error) {
        console.error('Entitlement check failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

