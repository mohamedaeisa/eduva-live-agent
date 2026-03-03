import { PaymentGateway } from './types.js';
import { FakeGateway } from './FakeGateway.js';
import { StripeGateway } from './StripeGateway.js';
import { PaymobGateway } from './PaymobGateway.js';
import { KashierGateway } from './KashierGateway.js';

export function getGateway(user?: { countryCode?: string }): PaymentGateway {
    // 0. Explicit Override via Environment Variable
    // Values: 'PAYMOB', 'STRIPE', 'FAKE'
    const providerOverride = process.env.PAYMENT_PROVIDER?.toUpperCase();
    if (providerOverride === 'PAYMOB') return new PaymobGateway();
    if (providerOverride === 'KASHIER') return new KashierGateway();
    if (providerOverride === 'STRIPE') return new StripeGateway();
    if (providerOverride === 'FAKE') return new FakeGateway();

    // 1. Force Fake Gateway in safe dev mode if keys are missing
    if (process.env.NODE_ENV === 'development' && !process.env.STRIPE_SECRET_KEY && !process.env.PAYMOB_API_KEY) {
        console.warn('[GatewayFactory] Using FakeGateway (Missing Keys)');
        return new FakeGateway();
    }

    // 2. Select strategy based on User Location or Config
    // Default to Paymob for Egypt
    if (user?.countryCode === 'EG' || process.env.NEXT_PUBLIC_DEFAULT_REGION === 'EG') {
        // If Paymob keys exist, use it. Else fall back to Stripe or Fake.
        if (process.env.PAYMOB_API_KEY) {
            return new PaymobGateway();
        }
    }

    // 3. Default International = Stripe
    // If we have Stripe keys, use Stripe
    if (process.env.STRIPE_SECRET_KEY) {
        return new StripeGateway();
    }

    // 4. Ultimate Fallback
    return new FakeGateway();
}

