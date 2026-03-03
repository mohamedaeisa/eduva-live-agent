import type { PaymentGateway, CheckoutSessionResult, WebhookResult } from './types.js';
import type { Plan } from '../../../types.js';
import * as crypto from 'crypto';

export class KashierGateway implements PaymentGateway {
    private mid: string;
    private apiKey: string;
    private secretKey: string;
    private apiUrl: string;

    constructor() {
        this.mid = process.env.KASHIR_INTEGRATION_ID || '';
        this.apiKey = process.env.KASHIR_API_KEY || '';
        this.secretKey = process.env.KASHIR_SECRET_KEY || '';
        // Determine API URL based on Environment
        // Test Mode: https://test-api.kashier.io
        // Live Mode: https://api.kashier.io
        const isTest = process.env.NODE_ENV !== 'production' || process.env.KASHIR_TEST_MODE === 'true';
        const baseUrl = isTest ? 'https://test-api.kashier.io' : 'https://api.kashier.io';
        this.apiUrl = `${baseUrl}/v3/payment/sessions`;
        console.log(`[Kashier] Initialized in ${isTest ? 'TEST' : 'LIVE'} mode: ${this.apiUrl}`);
    }

    async createCheckoutSession(
        user: { uid: string; email?: string; role: string; linkedParentId?: string },
        plan: Plan,
        metadata?: Record<string, any>,
        options?: { baseUrl?: string; cycle?: string }
    ): Promise<CheckoutSessionResult> {
        if (!this.mid || !this.secretKey || !this.apiKey) {
            console.error('Missing Kashier Configuration');
            throw new Error('Kashier configuration incomplete');
        }

        const orderId = `SUB-${user.uid}-${plan.id}-${Date.now()}`;

        // Construct Callback URL
        // PRIORITY: options.baseUrl > env > fallback
        let appUrl = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
        appUrl = appUrl.replace(/['"]/g, '').replace(/\/$/, '');

        let callbackUrl = `${appUrl}/billing?gateway=kashier`;

        // [LOCAL BRIDGE STRATEGY]
        // Kashier V3 requires HTTPS and often rejects localhost.
        // If we are on localhost/http, we use the production site as a "Bridge".
        if (appUrl.includes('localhost') || appUrl.startsWith('http:')) {
            const prodUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/['"]/g, '').replace(/\/$/, '');
            if (prodUrl && !prodUrl.includes('localhost')) {
                console.log(`[Kashier] Local detect. Using Bridge: ${prodUrl}`);
                callbackUrl = `${prodUrl}/billing?gateway=kashier&localOrigin=${encodeURIComponent(appUrl)}`;
            }
        }

        console.log(`[Kashier] Creating session. Final Redirect: ${callbackUrl}`);

        // Payload for POST /v3/payment/sessions
        const payload = {
            merchantId: this.mid,
            order: orderId,
            amount: plan.price.toFixed(2), // Ensure string format "100.00"
            currency: plan.currency || 'EGP',
            paymentType: "credit", // Default
            type: "one-time", // Subscription handling via recurring engine or manual? Assuming one-time for now per plan logic.
            allowedMethods: "card,wallet",
            merchantRedirect: callbackUrl,
            failureRedirect: true, // Redirect on failure too? Or handle via same URL?
            customer: {
                email: user.email || 'guest@example.com',
                reference: user.uid
            },
            metaData: {
                planId: plan.id,
                userId: user.uid,
                cycle: metadata?.cycle || options?.cycle,
                ...metadata,
            },
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': this.secretKey,
                'api-key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Kashier] Session Create Failed: ${response.status}`, errText, 'Payload:', JSON.stringify(payload));
            throw new Error(`Kashier API Error: ${errText}`);
        }

        const data = await response.json();

        if (!data.sessionUrl) {
            if (data.validationErrors) {
                throw new Error(`Kashier Validation: ${JSON.stringify(data.validationErrors)}`);
            }
            throw new Error('No sessionUrl returned from Kashier');
        }

        return {
            url: data.sessionUrl,
            sessionId: orderId,
            provider: 'KASHIER'
        };
    }

    /**
     * Verify Kashier Signature
     * Documentation: https://developers.kashier.io/payment/webhooks
     * The signature is a HMAC-SHA256 of the query string (excluding the signature itself) using the secret key.
     */
    static verifySignature(queryString: string, receivedSignature: string, secretKey: string): boolean {
        try {
            // Kashier sends a signature in the query string for redirects
            // For webhooks, they might send it as a header or inside the body.
            // If it's a redirect (client side), we verify the params.
            const params = new URLSearchParams(queryString);
            params.delete('signature');

            // Re-sort or keep order? Kashier usually expects them in the order they arrived but without the signature.
            // Actually, Kashier documentation specifies the exact string to hash.
            // For Redirects: "amount", "currency", "merchantOrderId", "orderReference", "paymentStatus", "publicKey"

            const amount = params.get('amount');
            const currency = params.get('currency');
            const merchantOrderId = params.get('merchantOrderId');
            const orderReference = params.get('orderReference');
            const paymentStatus = params.get('paymentStatus');

            // Construct the check string: amount?currency?merchantOrderId?orderReference?paymentStatus
            const checkString = `amount=${amount}&currency=${currency}&merchantOrderId=${merchantOrderId}&orderReference=${orderReference}&paymentStatus=${paymentStatus}`;

            const calculated = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

            return calculated === receivedSignature;
        } catch (e) {
            console.error('[Kashier] Signature Verification Error:', e);
            return false;
        }
    }

    async createOneTimeCheckout(
        user: { uid: string; email?: string; linkedParentId?: string },
        item: { name: string; amount: number; currency: string; quantity: number; image?: string; metadata?: Record<string, any> },
        options?: { baseUrl?: string }
    ): Promise<CheckoutSessionResult> {
        if (!this.mid || !this.secretKey || !this.apiKey) {
            throw new Error('Kashier configuration incomplete');
        }

        const orderId = `CREDIT-${user.uid}-${Date.now()}`;
        const totalAmount = item.amount * item.quantity;
        const appUrl = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
        const callbackUrl = `${appUrl.replace(/\/$/, '')}/billing?gateway=kashier`;

        const payload = {
            merchantId: this.mid,
            order: orderId,
            amount: totalAmount.toFixed(2),
            currency: item.currency || 'EGP',
            paymentType: "credit",
            type: "one-time",
            allowedMethods: "card,wallet",
            merchantRedirect: callbackUrl,
            customer: {
                email: user.email || 'guest@example.com',
                reference: user.uid
            },
            metaData: {
                type: 'credit',
                userId: user.uid,
                item: item.name,
                ...item.metadata
            },
            description: `Purchase: ${item.name} (x${item.quantity})`
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': this.secretKey,
                'api-key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Kashier] OneTime Session Failed`, errText);
            throw new Error(`Kashier API Error: ${errText}`);
        }

        const data = await response.json();
        if (!data.sessionUrl) throw new Error('No sessionUrl returned');

        return {
            url: data.sessionUrl,
            sessionId: orderId,
            provider: 'KASHIER'
        };
    }

    async handleWebhook(req: any, rawBody: Buffer): Promise<WebhookResult> {
        console.log('[Kashier] Webhook received');
        // Signature verification logic for Kashier Webhook would go here
        return { received: true };
    }

    async cancelSubscription(subscriptionId: string, providerSubId: string): Promise<void> {
        // API Implementation for cancellation if available
    }
}
