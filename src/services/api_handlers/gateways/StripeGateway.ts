import type { PaymentGateway, CheckoutSessionResult, WebhookResult } from './types.js';
import type { Plan } from '../../../types.js';
import { stripe } from '../_shared/stripe.js';

export class StripeGateway implements PaymentGateway {

    constructor() {
        // Stripe instance is already initialized in _shared/stripe
    }

    async createCheckoutSession(
        user: { uid: string; email?: string; role: string },
        plan: Plan,
        metadata?: Record<string, any>,
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        if (!stripe) throw new Error('Stripe is not configured (Missing Secret Key)');

        const originRaw = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
        const origin = originRaw.replace(/['"]/g, '').replace(/\/$/, '');
        const unitAmount = Math.round(plan.price * 100);
        const interval = metadata?.cycle === 'YEARLY' ? 'year' : 'month';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer_email: user.email,
            client_reference_id: user.uid,
            metadata: {
                planId: plan.id,
                role: user.role,
                ...metadata
            },
            line_items: [
                {
                    price_data: {
                        currency: plan.currency.toLowerCase(),
                        product_data: {
                            name: plan.name,
                            description: `Access to ${plan.name} features`,
                        },
                        unit_amount: unitAmount,
                        recurring: {
                            interval: interval,
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/billing/cancel`,
            allow_promotion_codes: true,
        });

        if (!session.url) throw new Error('Failed to create Stripe Session');

        return {
            url: session.url,
            sessionId: session.id,
            provider: 'STRIPE'
        };
    }

    async handleWebhook(req: any, rawBody: Buffer): Promise<WebhookResult> {
        // Webhook logic is currently handled in the dedicated endpoint api/monetization/webhooks/stripe.ts
        // In a clearer refactor, we would move that logic here, but the Vercel handler needs to export a function directly.
        // For now, this method satisfies the interface.
        return { received: true };
    }

    async cancelSubscription(subId: string, providerSubId: string): Promise<void> {
        if (!stripe) return; // Silent fail or throw? Silent is safer for cleanup.
        await stripe.subscriptions.cancel(providerSubId);
    }

    async createOneTimeCheckout(
        user: { uid: string; email?: string },
        item: { name: string; amount: number; currency: string; quantity: number; image?: string; metadata?: Record<string, any> },
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        if (!stripe) throw new Error('Stripe is not configured');

        const origin = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
        const unitAmount = Math.round(item.amount * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: user.email,
            client_reference_id: user.uid,
            metadata: {
                userId: user.uid,
                type: 'credit_purchase',
                ...item.metadata
            },
            line_items: [
                {
                    price_data: {
                        currency: item.currency.toLowerCase(),
                        product_data: {
                            name: item.name,
                            description: `Purchase of ${item.quantity} Credits`, // Or generic description
                            images: item.image ? [item.image] : undefined,
                        },
                        unit_amount: unitAmount, // Per Item Price (Total / Quantity ?) No, usually we pass Unit Amount. 
                        // If the item IS a "Pack of 50 credits", then quantity is 1 and Unit Amount is Price of Pack.
                        // Let's assume item.amount is the PRICE of the unit (the pack).
                    },
                    quantity: 1,
                },
            ],
            success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}&type=credit`,
            cancel_url: `${origin}/billing`,
        });

        if (!session.url) throw new Error('Failed to create Stripe Session');

        return {
            url: session.url,
            sessionId: session.id,
            provider: 'STRIPE'
        };
    }
}

