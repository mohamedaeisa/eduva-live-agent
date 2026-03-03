import type { PaymentGateway, CheckoutSessionResult, WebhookResult } from './types.js';
import type { Plan } from '../../../types.js';

export class PaymobGateway implements PaymentGateway {
    private apiKey: string;
    private integrationId: string;
    private iframeId: string;

    constructor() {
        this.apiKey = process.env.PAYMOB_API_KEY || '';
        this.integrationId = process.env.PAYMOB_INTEGRATION_ID || '';
        this.iframeId = process.env.PAYMOB_IFRAME_ID || '';
    }

    async createCheckoutSession(
        user: { uid: string; email?: string; role: string; linkedParentId?: string },
        plan: Plan,
        metadata?: Record<string, any>,
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        if (!this.apiKey || !this.integrationId || !this.iframeId) {
            console.error('Missing Paymob Configuration');
            throw new Error('Paymob configuration incomplete');
        }

        try {
            console.log(`[Paymob] Creating Subscription Checkout for Plan: ${plan.id}`);

            // 1. Authentication
            const token = await this.authenticate();

            // 2. Register Order
            // Use Plan Name and Price
            const amountCents = Math.round(plan.price * 100);
            const currency = plan.currency || 'EGP';

            // Construct Item for Order
            const orderItem = {
                name: plan.name, // Important: We will use this in Webhook to find the plan ID if needed, or pass metadata
                amount: plan.price,
                currency: currency,
                description: `Subscription: ${plan.name} (${plan.billingCycle})`,
                quantity: 1
            };

            // Pass 'SUB' prefix and include planId for robust fulfillment
            const merchantOrderInfo = `${user.uid}-${plan.id}`;
            const orderId = await this.registerOrder(token, amountCents, currency, merchantOrderInfo, orderItem, 'SUB');

            // 3. Request Payment Key
            // We embed subscription metadata here for the webhook to handle provisioning
            const billingDataEmail = user.email || 'no-email-provided@example.com';

            const paymentToken = await this.requestPaymentKey(
                token,
                orderId,
                amountCents,
                currency,
                billingDataEmail,
                1,
                // Pass metadata to payment key registration? 
                // Paymob limits metadata structure. We rely on merchant_order_id + DB lookups or embedded info.
                // We'll embed planId in the "building" field or similar if desperate, but sticking to ID prefix is cleaner.
                // We DO need to know WHICH plan to activate in the webhook.
                // The webhook gets the Order Object. The Order Object has Items. Item Name = Plan Name.
                // We can query Plans by Name. Or better, pass Plan ID in the "merchant_order_id"?
                // Let's change prefix to `SUB-${plan.id}`? 
                // Characters might be limited.
                // Let's stick to prefix 'SUB' and rely on Item Name matching Plan Name, OR update logic to include keys.
            );

            // ... (return)

            return {
                url: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentToken}`,
                sessionId: orderId.toString(),
                provider: 'PAYMOB'
            };

        } catch (error) {
            console.error('Paymob Subscription Checkout Error:', error);
            throw error;
        }
    }

    async createOneTimeCheckout(
        user: { uid: string; email?: string; linkedParentId?: string },
        item: { name: string; amount: number; currency: string; quantity: number; image?: string; metadata?: Record<string, any> },
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        if (!this.apiKey || !this.integrationId || !this.iframeId) {
            console.error('Missing Paymob Configuration');
            throw new Error('Paymob configuration incomplete');
        }

        try {
            // 1. Authentication
            const token = await this.authenticate();

            // 2. Register Order
            const amountCents = Math.round(item.amount * 100);
            const orderId = await this.registerOrder(token, amountCents, item.currency, user.uid, item, 'CREDIT');

            // 3. Request Payment Key
            const paymentToken = await this.requestPaymentKey(token, orderId, amountCents, item.currency, user.email || 'no-email@example.com', item.quantity);

            // 4. Return Iframe URL
            return {
                url: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentToken}`,
                sessionId: orderId.toString(),
                provider: 'PAYMOB'
            };
        } catch (error) {
            console.error('Paymob Checkout Error:', error);
            throw error;
        }
    }

    private async authenticate(): Promise<string> {
        const res = await fetch('https://accept.paymob.com/api/auth/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: this.apiKey })
        });
        const data = await res.json();
        return data.token;
    }

    private async registerOrder(token: string, amountCents: number, currency: string, merchantOrderId: string, item: any, prefix: string): Promise<number> {
        // We use a random suffix for merchant_order_id because Paymob rejects duplicates
        // Format: TYPE-UID-TIMESTAMP-PLANinfo?
        // Let's use: PREFIX-UID-TIMESTAMP to keep it parseable.
        // UID could be long. 
        const uniqueId = `${prefix}-${merchantOrderId}-${Date.now()}`;

        const res = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: token,
                delivery_needed: 'false',
                amount_cents: amountCents.toString(),
                currency: currency,
                merchant_order_id: uniqueId,
                items: [
                    {
                        name: item.name,
                        amount_cents: amountCents.toString(),
                        description: item.name,
                        quantity: 1 // We treat the pack as 1 item
                    }
                ]
            })
        });
        const data = await res.json();
        return data.id;
    }

    private async requestPaymentKey(token: string, orderId: number, amountCents: number, currency: string, email: string, quantity: number): Promise<string> {
        const res = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: token,
                amount_cents: amountCents.toString(),
                expiration: 3600,
                order_id: orderId,
                billing_data: {
                    first_name: "Student",
                    last_name: "User",
                    email: email,
                    phone_number: "01000000000", // Required dummy if not collected
                    apartment: "NA",
                    floor: "NA",
                    street: "NA",
                    building: "NA",
                    shipping_method: "NA",
                    postal_code: "NA",
                    city: "NA",
                    country: "NA",
                    state: "NA"
                },
                currency: currency,
                integration_id: this.integrationId,
                lock_order_when_paid: "false",
                // Attempt to override Dashboard setting (if supported)
                // Use default Vercel dev port 3000 (dev) or Env Var (prod)
                redirection_url: `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/['"]/g, '').replace(/\/$/, '')}/billing`
            })
        });
        const data = await res.json();
        return data.token;
    }

    async handleWebhook(req: any, rawBody: Buffer): Promise<WebhookResult> {
        // Implement HMAC verification using QUERY params usually for Paymob
        console.log('[Paymob] Webhook received');
        // Logic will be in api/monetization/webhooks/paymob.ts
        return { received: true };
    }

    async cancelSubscription(subId: string, providerSubId: string): Promise<void> {
        console.log('[Paymob] Cancel not fully automated via API yet');
    }
}

