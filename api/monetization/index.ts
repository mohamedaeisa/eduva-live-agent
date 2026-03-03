import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Manually parse route from URL since we are using index.ts with wildcard rewrite
    // URL will be like /api/monetization/billing/plans
    // Or /api/monetization/billing/plans?force=false

    // We need the full URL to parse properly
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const pathname = url.pathname; // /api/monetization/billing/plans

    // Strip prefix /api/monetization/
    let path = pathname.replace(/^\/api\/monetization\/?/, '');

    // Handle root /api/monetization/ -> path is empty or just slash?
    // Remove trailing slash
    path = path.replace(/\/$/, '');

    // Fallback if path is empty (root) - currently no handler for root, so 404
    if (!path) {
        return res.status(404).json({ error: 'Root monetization endpoint not implemented' });
    }

    console.log(`[MONOLITH] Routing request (Raw): ${req.url} -> Path: ${path}`);

    try {
        switch (path) {
            // --- BILLING ROUTES ---
            case 'billing/plans':
                return await (await import('../../src/services/api_handlers/billing/plans.js')).default(req, res);
            case 'billing/history':
                return await (await import('../../src/services/api_handlers/billing/history.js')).default(req, res);
            case 'billing/checkout':
                return await (await import('../../src/services/api_handlers/billing/checkout.js')).default(req, res);
            case 'billing/checkout-credits':
                return await (await import('../../src/services/api_handlers/billing/checkout-credits.js')).default(req, res);

            // --- CONFIG ROUTES ---
            case 'config/get':
                return await (await import('../../src/services/api_handlers/config/get.js')).default(req, res);
            case 'config/update':
                return await (await import('../../src/services/api_handlers/config/update.js')).default(req, res);

            // --- WEBHOOK ROUTES ---
            case 'webhooks/webhook':
                return await (await import('../../src/services/api_handlers/webhooks/webhook.js')).default(req, res);
            case 'webhooks/paymob':
                return await (await import('../../src/services/api_handlers/webhooks/paymob.js')).default(req, res);
            case 'webhooks/kashier':
                return await (await import('../../src/services/api_handlers/webhooks/kashier.js')).default(req, res);
            case 'webhooks/stripe':
                return await (await import('../../src/services/api_handlers/webhooks/stripe.js')).default(req, res);
            case 'webhooks/mock_confirm':
                return await (await import('../../src/services/api_handlers/webhooks/mock_confirm.js')).default(req, res);

            // --- ENTITLEMENT ROUTES ---
            case 'entitlement/check':
                return await (await import('../../src/services/api_handlers/entitlement/check.js')).default(req, res);
            case 'entitlement/bulk':
                return await (await import('../../src/services/api_handlers/entitlement/bulk.js')).default(req, res);

            // --- USAGE ROUTES ---
            case 'usage/get':
                return await (await import('../../src/services/api_handlers/usage/get.js')).default(req, res);
            case 'usage/increment':
                return await (await import('../../src/services/api_handlers/usage/increment.js')).default(req, res);

            // --- AUTH & SYSTEM ROUTES ---
            case 'auth/sync-claims':
                return await (await import('../../src/services/api_handlers/auth/sync-claims.js')).default(req, res);
            case 'cron/reset-usage':
                return await (await import('../../src/services/api_handlers/cron/reset-usage.js')).default(req, res);

            // --- TEST ROUTES ---
            case 'test/db':
                return await (await import('../../src/services/api_handlers/test/db-test.js')).default(req, res);
            case 'test/paymob':
                return await (await import('../../src/services/api_handlers/test/paymob-test.js')).default(req, res);
            case 'test':
                return await (await import('../../src/services/api_handlers/test/ping.js')).default(req, res);

            default:
                console.warn(`[MONOLITH] Unknown route: ${path}`);
                return res.status(404).json({ error: 'Route not found' });
        }
    } catch (error) {
        console.error(`[MONOLITH] Error routing ${path}:`, error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
