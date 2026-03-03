import { useState, useEffect } from 'react';
import { db, auth } from '../../services/firebaseConfig';
import { AppView, type Plan } from '../../types';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface MockCheckoutProps {
    planId: string | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export function MockCheckout({ planId, onSuccess, onCancel }: MockCheckoutProps) {
    const [loading, setLoading] = useState(false);
    const [plan, setPlan] = useState<Plan | null>(null);
    const [cardName, setCardName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvc, setCvc] = useState('');

    useEffect(() => {
        const fetchPlan = async () => {
            if (!planId) return;
            const ref = doc(db, 'plans', planId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                setPlan({ id: snap.id, ...snap.data() } as Plan);
            }
        };
        fetchPlan();
    }, [planId]);

    const handlePay = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API latency
        await new Promise(r => setTimeout(r, 1500));

        // 🛑 MOCK GATEWAY SIMULATION
        // Simulate Card Rejection unless specific "Test Cards" are used
        const validTestCards = ['11111', '22222'];
        const cleanCardNumber = cardNumber.replace(/\s/g, '');

        if (!validTestCards.includes(cleanCardNumber)) {
            // FAILED PAYMENT SIMULATION
            const now = Date.now();
            const failureId = `evt_fail_${now}`;
            const failureEvent = {
                id: failureId,
                // We need a subscription ID to link it for history, creating a placeholder or using 'sys_failed_attempts'
                // However, BillingHistory queries based on subscription ownership.
                // To show up, we need a "failed attempt" subscription OR link to the user's current/potential subscription.
                // Let's create a transient "attempt" subscription record for tracking, or just link to user if we change query.
                // Current query: events where subscriptionId IN (subs where ownerUid == user).
                // So we MUST create a dummy subscription record representing this failed attempt, or attach to existing.
                // Let's create a "failed_attempt_sub" for this.
                subscriptionId: `sub_attempt_${now}`,
                amount: plan?.price ? plan.price * 100 : 0,
                currency: plan?.currency || 'EGP',
                status: 'failed',
                type: 'invoice.payment_failed',
                timestamp: now,
                hostedInvoiceUrl: '#',
                invoicePdf: '#'
            };

            // We also need to create the dummy subscription so the history query finds it
            // This is a bit of a hack around the relational model, but works for "history" without active sub.
            const attemptSub = {
                ownerUid: auth.currentUser?.uid,
                status: 'incomplete_expired', // Stripe-like status for failed setup
                planId: planId,
                createdAt: now,
                provider: 'FAKE_GATEWAY'
            };

            await import('firebase/firestore').then(({ setDoc, doc }) => {
                const batch = import('firebase/firestore').then(mod => {
                    // We do them individually to be safe/simple
                    setDoc(doc(db, 'subscriptions', `sub_attempt_${now}`), attemptSub);
                    setDoc(doc(db, 'billing_events', failureId), failureEvent);
                });
            });

            alert(`❌ Payment Declined (Recorded in History)\n\nGateway Reason: [Do_Not_Honor]`);
            setLoading(false);
            return;
        }

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated");

            // 1. Attempt Backend Mock Confirmation
            let backendSuccess = false;
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/monetization/webhooks/mock_confirm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        planId,
                        userId: user.uid,
                        provider: 'FAKE_GATEWAY'
                    })
                });

                if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
                    backendSuccess = true;
                }
            } catch (e) {
                console.warn("Backend mock confirm failed, falling back to client side", e);
            }

            // 2. Client-Side Fallback (If Backend Failed or Unavailable)
            if (!backendSuccess) {
                console.warn('[MockCheckout] Backend API unavailable. Performing client-side fulfillment.');

                const now = Date.now();
                const mockSubscriptionId = `sub_mock_${now}`;

                // Direct Firestore Update
                const subscriptionData = {
                    ownerUid: user.uid,
                    planId: planId,
                    status: 'active',
                    currentPeriodStart: now,
                    currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000, // 30 Days
                    cancelAtPeriodEnd: false,
                    provider: 'FAKE_GATEWAY',
                    createdAt: now,
                    updatedAt: now
                };

                // Create Mock Billing Event (Invoice)
                const eventId = `evt_mock_${now}`;
                const mockEvent = {
                    id: eventId,
                    subscriptionId: mockSubscriptionId,
                    amount: plan?.price ? plan.price * 100 : 0, // In cents
                    currency: plan?.currency || 'EGP',
                    status: 'paid',
                    type: 'invoice.payment_succeeded',
                    timestamp: now,
                    hostedInvoiceUrl: '#',
                    invoicePdf: '#'
                };

                // Parallelize writes for speed but await ALL of them
                await Promise.all([
                    // Update User Profile
                    updateDoc(doc(db, 'users', user.uid), {
                        plan: {
                            id: planId,
                            status: 'active',
                            startDate: now,
                            expiryDate: subscriptionData.currentPeriodEnd,
                        }
                    }).catch(e => console.warn("User update minor error", e)),

                    // Create Subscription Record
                    setDoc(doc(db, 'subscriptions', mockSubscriptionId), subscriptionData),

                    // Create Billing Event
                    setDoc(doc(db, 'billing_events', eventId), mockEvent),

                    // RESET USAGE COUNTERS (User Request: "Reset consumption total")
                    setDoc(doc(db, 'usage_counters', `student_${user.uid}_${new Date().toISOString().slice(0, 7)}`), {
                        studentUid: user.uid,
                        month: new Date().toISOString().slice(0, 7),
                        quizzesUsed: 0,
                        notesUsed: 0,
                        examsUsed: 0,
                        aiSecondsUsed: 0,
                        lastReset: now
                    }, { merge: true })
                ]);

                onSuccess(); // Proceed only after writes are done
                return;
            }

            onSuccess();
        } catch (error) {
            console.error('[MockCheckout] Error:', error);
            alert('Payment Simulation Error. Check console.');
            setLoading(false);
        }
    };

    if (!planId) return <div>Invalid Session</div>;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-slate-700">
                {/* Header pretending to be a gateway */}
                <div className="bg-indigo-600 p-6 text-white text-center">
                    <div className="font-mono text-sm opacity-80 mb-1">SECURE CHECKOUT</div>
                    <div className="font-bold text-2xl tracking-tight">FakeGateway™</div>
                </div>

                <div className="p-8">
                    {/* Order Summary */}
                    <div className="mb-8 p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700 flex justify-between items-center">
                        <div>
                            <div className="text-sm text-gray-500 dark:text-slate-400">Subscribing to</div>
                            <div className="font-bold text-lg text-gray-900 dark:text-white">{plan?.name || 'Loading...'}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-gray-500 dark:text-slate-400">Total</div>
                            <div className="font-bold text-lg text-indigo-600 dark:text-indigo-400">
                                {plan ? `${plan.currency} ${plan.price}` : '...'}
                            </div>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handlePay} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Cardholder Name</label>
                            <input
                                type="text"
                                required
                                className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="John Doe"
                                value={cardName}
                                onChange={e => setCardName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Card Number</label>
                            <input
                                type="text"
                                required
                                className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                placeholder="0000 0000 0000 0000"
                                value={cardNumber}
                                onChange={e => setCardNumber(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Expiry</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                    placeholder="MM/YY"
                                    value={expiry}
                                    onChange={e => setExpiry(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">CVC</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                    placeholder="123"
                                    value={cvc}
                                    onChange={e => setCvc(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 py-3 px-4 rounded-xl font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-3 px-4 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Processing...' : 'Pay Now'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-xs text-gray-400">
                            🔒 This is a secure 256-bit encrypted simulation.
                            <br />Authorized Test Cards: <b>11111</b> or <b>22222</b>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
