import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import type { Plan } from '../../../types.js';

// --- SERVER-SIDE CACHE ---
// This persists as long as the Vercel function container is warm.
let cachedPlans: any[] | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 Minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { force } = req.query;

    try {
        // Return Cache if valid and not forced
        if (cachedPlans && (Date.now() - lastFetch < CACHE_TTL) && force !== 'true') {
            console.log('[API] Serving Plans from Cache');
            return res.status(200).json({ plans: cachedPlans });
        }

        console.log('[API] Fetching Plans from DB...');
        const plansSnapshot = await db.collection('plans')
            .where('isActive', '==', true)
            .get();

        const plans = plansSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                price: data.price,
                currency: data.currency,
                billingCycle: data.billingCycle,
                limits: data.limits,
                features: data.features,
                isActive: data.isActive,
                marketingFeatures: data.marketingFeatures
            } as Plan;
        });

        // Update Cache
        cachedPlans = plans;
        lastFetch = Date.now();

        console.log(`[API] GET /billing/plans - Success (${plans.length} plans)`);
        return res.status(200).json({ plans });

    } catch (error) {
        console.error('Failed to fetch plans:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

