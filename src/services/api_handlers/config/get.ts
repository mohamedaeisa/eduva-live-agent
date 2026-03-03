import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps } from '../_shared/guards.js';
import { db } from '../_shared/db.js';

// --- SERVER-SIDE CACHE ---
let cachedConfig: any | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 Minutes (Config changes even less than plans)

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!ensureHttps(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { force } = req.query;

    try {
        if (cachedConfig && (Date.now() - lastFetch < CACHE_TTL) && force !== 'true') {
            console.log('[API] Serving Config from Cache');
            return res.status(200).json(cachedConfig);
        }

        console.log('[API] Fetching Config from DB...');
        const doc = await db.collection('system_config').doc('monetization').get();

        let config;
        if (!doc.exists) {
            config = {
                costs: {
                    quiz: 2,
                    exam: 3,
                    ai_tutor_min: 1,
                    note: 1
                },
                packages: [
                    {
                        id: 'starter',
                        name: 'Starter Pack',
                        credits: 50,
                        price: 50,
                        currency: 'EGP',
                        description: 'Good for a few quizzes',
                        recommended: false
                    },
                    {
                        id: 'pro',
                        name: 'Exam Pack',
                        credits: 200,
                        price: 180,
                        currency: 'EGP',
                        description: 'Best for exam preparation',
                        recommended: true
                    }
                ]
            };
        } else {
            config = doc.data();
        }

        // Update Cache
        cachedConfig = config;
        lastFetch = Date.now();

        console.log('[API] GET /config/get - Success');
        return res.status(200).json(config);

    } catch (error) {
        console.error('Config Fetch Error:', error);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

