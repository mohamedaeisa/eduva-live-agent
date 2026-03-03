import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_shared/db.js';
import * as admin from 'firebase-admin';
import { stripe } from '../_shared/stripe.js';
import { buffer } from 'micro';

// Disable default body parsing for signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const sig = req.headers['stripe-signature'];
    const buf = await buffer(req);
    let event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET || !sig || !stripe) {
            throw new Error('Missing webhook secret, signature, or Stripe configuration');
        }
        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency Check (Phase 1 Impl)
    const eventRef = db.collection('webhook_events').doc(event.id);

    try {
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
            console.log(`[StripeWebhook] Event ${event.id} already processed. Skipping.`);
            return res.json({ received: true });
        }
    } catch (error) {
        console.warn('[StripeWebhook] Failed to check idempotency, proceeding with caution:', error);
        // We proceed to avoid blocking critical events if DB read fails temporarily
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as any;
                await handleCheckoutCompleted(session);
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as any;
                await handlePaymentSucceeded(invoice);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as any;
                await handleSubscriptionDeleted(subscription);
                break;
            }
            default:
            // console.log(`Unhandled event type ${event.type}`);
        }

        // Mark event as processed to prevent duplicate handling
        await eventRef.set({
            processedAt: Date.now(),
            type: event.type,
            apiVersion: event.api_version
        });

        res.json({ received: true });
    } catch (err: any) {
        console.error('Webhook handler failed:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

async function handleCheckoutCompleted(session: any) {
    // Check if this is a One-Time Payment (Credits) or Subscription
    if (session.mode === 'payment' && session.metadata?.type === 'credit_purchase') {
        await handleCreditPurchase(session);
        return;
    }

    // metadata keys match what we passed in checkout.ts
    const { planId, role } = session.metadata || {};
    const payerUid = session.client_reference_id;
    const subscriptionId = session.subscription;

    if (!payerUid || !planId) {
        console.warn('Missing metadata in checkout session', session.id);
        return;
    }

    console.log(`Processing new subscription for ${payerUid} -> Plan: ${planId}`);

    // Retrieve full subscription details for dates
    if (!stripe) throw new Error('Stripe not initialized');
    const subDetails = await stripe.subscriptions.retrieve(subscriptionId);

    // Create/Update Firestore Subscription
    const subscriptionRecord = {
        id: `sub_${subscriptionId}`, // Use Stripe ID as part of our ID
        ownerUid: payerUid,
        planId: planId,
        provider: 'STRIPE',
        providerSubId: subscriptionId,
        providerCustomerId: session.customer,
        status: 'active',
        currentPeriodEnd: (subDetails as any).current_period_end * 1000,
        beneficiaries: [payerUid], // Default to owner, upgrade logic can expand this
        createdAt: Date.now()
    };

    await db.collection('subscriptions').doc(subscriptionRecord.id).set(subscriptionRecord);

    // Update User Plan Status
    await db.collection('users').doc(payerUid).update({
        planTier: planId,
        subscriptionStatus: 'ACTIVE',
        stripeCustomerId: session.customer // Store for future reference (portal)
    });

    // Record Billing Event (Invoice)
    await db.collection('billing_events').add({
        subscriptionId: subscriptionRecord.id,
        amount: session.amount_total / 100,
        currency: session.currency,
        status: 'paid',
        type: 'initial_payment',
        provider: 'STRIPE',
        providerOrderId: session.id,
        providerTransactionId: subscriptionId,
        planId: planId,
        timestamp: Date.now(),
        stripeSessionId: session.id
    });
}

async function handlePaymentSucceeded(invoice: any) {
    // This event fires for renewals
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return; // One-time payments might not have this

    // We search our DB for this subscription
    const snapshot = await db.collection('subscriptions')
        .where('providerSubId', '==', subscriptionId)
        .limit(1)
        .get();

    if (snapshot.empty) {
        console.warn('Payment for unknown subscription:', subscriptionId);
        return;
    }

    const doc = snapshot.docs[0];
    const subData = doc.data();

    // Update period end (Stripe timestamp is in seconds)
    // We fetch fresh sub data from stripe to be sure, or rely on invoice lines
    // Ideally we trust the invoice period
    const periodEnd = invoice.lines.data[0].period.end * 1000;

    await doc.ref.update({
        status: 'active',
        currentPeriodEnd: periodEnd
    });

    // Record Billing Event (History)
    await db.collection('billing_events').add({
        subscriptionId: subData.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: 'paid',
        type: 'renewal',
        provider: 'STRIPE',
        providerOrderId: invoice.id,
        providerTransactionId: subscriptionId,
        planId: subData.planId,
        timestamp: Date.now(),
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf
    });
}

async function handleSubscriptionDeleted(subscription: any) {
    const snapshot = await db.collection('subscriptions')
        .where('providerSubId', '==', subscription.id)
        .limit(1)
        .get();

    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();

        await doc.ref.update({ status: 'canceled' });

        // Downgrade User to FREE (or handle grace period)
        // For now, we mark as CANCELED. 
        // A separate cron or middleware should check if 'canceled' AND 'currentPeriodEnd' < Now before removing entitlements.
        await db.collection('users').doc(data.ownerUid).update({
            subscriptionStatus: 'CANCELED'
        });
    }
}

async function handleCreditPurchase(session: any) {
    const userId = session.metadata?.userId || session.client_reference_id;
    if (!userId) {
        console.error('Missing userId in credit purchase session', session.id);
        return;
    }

    let credits = parseInt(session.metadata?.credits || '0');

    if (credits <= 0) {
        console.warn('Could not determine credit amount from metadata. Defaulting to 10 for safety', session.metadata);
        credits = 10;
    }

    console.log(`Fulfilling Credit Purchase: ${userId} +${credits} Credits`);

    // Increment Credits
    await db.collection('users').doc(userId).update({
        credits: admin.firestore.FieldValue.increment(credits)
    });

    // Log Transaction
    await db.collection('users').doc(userId).collection('credit_transactions').add({
        amount: credits,
        type: 'purchase',
        provider: 'STRIPE',
        sessionId: session.id,
        amountPaid: session.amount_total / 100,
        currency: session.currency,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Central Billing Event
    await db.collection('billing_events').add({
        userId,
        amount: session.amount_total / 100,
        currency: session.currency,
        status: 'paid',
        type: 'credit_purchase',
        creditsPurchased: credits,
        timestamp: Date.now(),
        stripeSessionId: session.id
    });
}

