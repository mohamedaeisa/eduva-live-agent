import type { Plan } from '../../../types.js';

export interface CheckoutSessionResult {
    url: string;
    sessionId?: string; // Provider specific ID
    provider: 'STRIPE' | 'PAYMOB' | 'FAKE' | 'KASHIER';
}

export interface WebhookResult {
    received: boolean;
    action?: 'subscription_created' | 'subscription_updated' | 'subscription_canceled' | 'invoice_paid' | 'none';
}

export interface PaymentGateway {
    /**
     * Creates a checkout session for a subscription
     */
    createCheckoutSession(
        user: { uid: string; email?: string; role: string; linkedParentId?: string },
        plan: Plan,
        metadata?: Record<string, any>,
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult>;

    /**
     * Verifies and handles incoming webhooks
     * Note: Each provider has drastically different webhook structures, 
     * so this might just be a signature verification + dispatch step.
     */
    handleWebhook(req: any, rawBody: Buffer): Promise<WebhookResult>;

    /**
     * Cancels a subscription
     */
    cancelSubscription(subscriptionId: string, providerSubId: string): Promise<void>;

    /**
     * Creates a checkout session for a one-time payment (Credits)
     */
    createOneTimeCheckout(
        user: { uid: string; email?: string; linkedParentId?: string },
        item: { name: string; amount: number; currency: string; quantity: number; image?: string; metadata?: Record<string, any> },
        options?: Record<string, any>
    ): Promise<CheckoutSessionResult>;
}

