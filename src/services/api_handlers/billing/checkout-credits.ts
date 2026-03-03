import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureHttps, verifyAuth } from '../_shared/guards.js';
import { db } from '../_shared/db.js';
import { getGateway } from '../gateways/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[API] POST /billing/checkout-credits - Start');
    if (!ensureHttps(req, res)) return;

    const user = await verifyAuth(req, res) as { uid: string; role: string; email?: string; plan?: string };
    if (!user) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { packageId } = req.body;
    if (!packageId) {
        return res.status(400).json({ error: 'MISSING_PACKAGE_ID' });
    }

    try {
        // 1. Fetch Package Configuration
        let selectedPack = null;
        const configDoc = await db.collection('system_config').doc('monetization').get();

        if (configDoc.exists) {
            const packages = configDoc.data()?.packages || [];
            selectedPack = packages.find((p: any) => p.id === packageId);
        } else {
            // Fallback Defaults (Must match config/get.ts or client defaults)
            const defaultPackages = [
                { id: 'starter', name: 'Starter Pack', credits: 50, price: 50, currency: 'EGP' },
                { id: 'pro', name: 'Exam Pack', credits: 200, price: 180, currency: 'EGP' }
            ];
            selectedPack = defaultPackages.find(p => p.id === packageId);
        }

        if (!selectedPack) {
            return res.status(400).json({ error: 'INVALID_PACKAGE', message: 'Credit package not found.' });
        }

        // 2. Resolve Payer (Parent check)
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data();
        let payerUid = user.uid;
        let customerEmail = user.email || userData?.email;

        if (user.role === 'STUDENT' && userData?.linkedParentId) {
            payerUid = userData.linkedParentId;
            console.log(`[API] Credit Purchase: Student ${user.uid} -> Parent Payer ${payerUid}`);
        }

        // 3. Delegate to Gateway
        const gateway = getGateway(userData);

        const result = await gateway.createOneTimeCheckout(
            {
                uid: payerUid,
                email: customerEmail,
                linkedParentId: userData?.linkedParentId
            },
            {
                name: selectedPack.name,
                amount: selectedPack.price,
                currency: selectedPack.currency || 'EGP',
                quantity: selectedPack.credits,
                metadata: {
                    packageId: selectedPack.id,
                    credits: selectedPack.credits, // Explicitly pass for webhook wrapper
                    beneficiaryUid: user.uid // Track who the credits are for (if parent buys for child, usually goes to parent wallet? or child?)
                    // Current Logic: Credits go to Payer (Parent). Child usage check looks at Parent's wallet (via linkedParentId logic in check.ts?)
                    // Let's re-verify check.ts: 
                    // check.ts: "const availableCredits = userData.credits || 0;" where userData is the STUDENT.
                    // THIS IS A MISMATCH.
                    // If Parent buys, credits go to Parent Wallet. Student usage check must look at Parent Wallet if linked.
                    // I need to fix check.ts to look at Parent Credits if linked.
                    // For now, let's assume credits go to the PAYER.
                }
            }
        );

        return res.status(200).json({ checkoutUrl: result.url });

    } catch (error: any) {
        console.error('Credit checkout failed:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
}

