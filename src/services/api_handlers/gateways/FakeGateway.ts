import type { PaymentGateway, CheckoutSessionResult, WebhookResult } from './types.js';
import type { Plan } from '../../../types.js';

export class FakeGateway implements PaymentGateway {
    async createCheckoutSession(
        user: { uid: string; email?: string },
        plan: Plan,
        metadata?: Record<string, any>,
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        console.log(`[FakeGateway] Creating session for ${user.email} on plan ${plan.name}`);
        const originRaw = options?.baseUrl || 'http://localhost:5173';
        const origin = originRaw.replace(/['"]/g, '').replace(/\/$/, '');

        // This URL matches the one our PricingTable logic expects for "Mock" success
        // But since we want the SERVER to handle it usually, we might redirect to a success page
        // For now, we return the mock protocol which the backend checkout handler will pass to frontend

        return {
            url: `mock://checkout_success?planId=${plan.id}&userId=${user.uid}`,
            provider: 'FAKE'
        };
    }

    async handleWebhook(req: any, rawBody: Buffer): Promise<WebhookResult> {
        return { received: true, action: 'none' };
    }

    async cancelSubscription(subId: string, providerSubId: string): Promise<void> {
        console.log(`[FakeGateway] Canceling subscription ${subId} (${providerSubId})`);
    }

    async createOneTimeCheckout(
        user: { uid: string; email?: string },
        item: { name: string; amount: number; currency: string; quantity: number; image?: string; metadata?: Record<string, any> },
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult> {
        const originRaw = options?.baseUrl || 'http://localhost:5173';
        const origin = originRaw.replace(/['"]/g, '').replace(/\/$/, '');
        return {
            url: `${origin}/billing/success?session_id=fake_sess_${Date.now()}&type=credit`,
            sessionId: `fake_sess_${Date.now()}`,
            provider: 'FAKE'
        };
    }
}

