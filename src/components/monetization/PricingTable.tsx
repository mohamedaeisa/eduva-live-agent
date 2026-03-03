import { useEffect, useState } from 'react';
import { monetizationClient } from '../../services/monetization/client';
import { auth, db } from '../../services/firebaseConfig';
import { AppView, type Plan, type Subscription } from '../../types';
import AlertModal from '../ui/AlertModal';

export function PricingTable({ onNavigate, onMockCheckout, currentPlanId }: {
    onNavigate?: (view: AppView) => void;
    onMockCheckout?: (planId: string) => void;
    currentPlanId?: string;
}) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [packages, setPackages] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'PLANS' | 'CREDITS'>('PLANS');
    const [loading, setLoading] = useState(true);
    const [errorAlert, setErrorAlert] = useState<{ title: string, message: string } | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPlans() {
            try {
                const [plansData, configData] = await Promise.all([
                    monetizationClient.getPlans(),
                    monetizationClient.getConfig()
                ]);

                console.log('[PricingTable] Data Loaded. CurrentPlanId:', currentPlanId);
                console.log('[PricingTable] Plans IDs:', plansData.map(p => p.id));

                // Sort: Price Ascending
                setPlans(plansData.sort((a, b) => a.price - b.price));
                setPackages(configData.packages || []);
            } catch (e) {
                console.error("Failed to load pricing data", e);
            } finally {
                setLoading(false);
            }
        }
        fetchPlans();
    }, [currentPlanId]); // Added dep to re-log if prop changes

    const handleSelectPlan = async (planId: string) => {
        if (planId === currentPlanId || processingId) return; // Prevent re-subscribing

        setProcessingId(planId);
        try {
            // SCAFFOLD: Real checkout trigger
            console.log('Selected Plan:', planId);
            const result = (await monetizationClient.startCheckout(planId, 'MONTHLY')) as any; // Cast for custom props

            if (result.error) {
                setErrorAlert({ title: 'Upgrade Failed', message: result.message || 'Unable to start checkout. Please try again.' });
                setProcessingId(null);
                return;
            }

            if (result.checkoutUrl) {
                if (result.checkoutUrl.startsWith('mock://') && onMockCheckout) {
                    // E2E Mock Flow: Navigate to Fake Checkout Page
                    onMockCheckout(planId);
                    setProcessingId(null);
                    return;
                } else if (result.checkoutUrl.startsWith('mock://')) {
                    // Fallback if no handler
                    alert('Mock URL: ' + result.checkoutUrl);
                    setProcessingId(null);
                    return;
                }

                // Real Stripe/Paymob Redirect
                localStorage.setItem('last_attempted_plan_id', planId);
                window.location.href = result.checkoutUrl;
            } else {
                setErrorAlert({ title: 'System Error', message: 'Checkout provider failed to initialize.' });
                setProcessingId(null);
            }
        } catch (error) {
            console.error(error);
            setErrorAlert({ title: 'System Error', message: 'An unexpected error occurred.' });
            setProcessingId(null);
        }
    };

    const handleBuyCredits = async (packId: string) => {
        if (processingId) return;

        setProcessingId(packId);
        try {
            const result = await monetizationClient.buyCredits(packId);

            if (result.error) {
                setErrorAlert({ title: 'Purchase Failed', message: result.message || 'Unable to buy credits. Please try again.' });
                setProcessingId(null);
                return;
            }

            if (result.checkoutUrl) {
                if (result.checkoutUrl.startsWith('mock://') && onMockCheckout) {
                    onMockCheckout(packId); // Re-use mock handler? Or need distinct one?
                    setProcessingId(null);
                    return;
                }
                window.location.href = result.checkoutUrl;
            } else {
                setErrorAlert({ title: 'System Error', message: 'Credit Provider failed to initialize.' });
                setProcessingId(null);
            }
        } catch (error) {
            console.error(error);
            setErrorAlert({ title: 'System Error', message: 'An unexpected error occurred.' });
            setProcessingId(null);
        }
    };

    if (loading) return <div className="p-4 text-center">Loading plans...</div>;

    return (
        <div className="flex flex-col items-center gap-8 p-6">
            {/* Error Modal */}
            {errorAlert && (
                <AlertModal
                    isOpen={!!errorAlert}
                    title={errorAlert.title}
                    message={errorAlert.message}
                    onClose={() => setErrorAlert(null)}
                />
            )}

            {/* Toggle */}
            <div className="bg-gray-100 p-1 rounded-full flex gap-2 mb-4 dark:bg-gray-800">
                <button
                    onClick={() => setViewMode('PLANS')}
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${viewMode === 'PLANS' ? 'bg-white shadow text-indigo-600 dark:bg-gray-700 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                    Monthly Plans
                </button>
                <button
                    onClick={() => setViewMode('CREDITS')}
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${viewMode === 'CREDITS' ? 'bg-white shadow text-indigo-600 dark:bg-gray-700 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                    Pay As You Go (Credits)
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-7xl px-4">
                {viewMode === 'PLANS' ? plans.map((plan) => {
                    // Start Case-Insensitive Matching
                    const normalize = (id?: string) => (id || '').toUpperCase();
                    const isCurrent = normalize(plan.id) === normalize(currentPlanId) ||
                        (plan.price === 0 && !currentPlanId); // Fallback to Free if no plan

                    const isProcessing = processingId === plan.id;
                    const isOtherProcessing = processingId !== null && !isProcessing;

                    return (
                        <div key={plan.id} className={`relative border rounded-xl p-6 w-full flex flex-col hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 ${isCurrent ? 'ring-2 ring-emerald-500 border-transparent scale-[1.02] shadow-lg shadow-emerald-500/10 dark:shadow-emerald-500/20' : 'border-slate-200 dark:border-slate-700'}`}>

                            {/* Current Plan Badge */}
                            {isCurrent && (
                                <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3">
                                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wider">
                                        Current Plan
                                    </span>
                                </div>
                            )}

                            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                            <div className="text-3xl font-bold mb-4">
                                {plan.price === 0 ? 'Free' : `${plan.currency} ${plan.price}`}
                                <span className="text-sm font-normal text-gray-500">/{plan.billingCycle === 'MONTHLY' ? 'mo' : 'yr'}</span>
                            </div>

                            <ul className="flex-1 mb-6 space-y-2">
                                {(plan.marketingFeatures || []).map((feature, idx) => (
                                    <li key={idx} className="flex items-center">
                                        <span className="mr-2 text-emerald-500">✔</span>
                                        {feature}
                                    </li>
                                ))}
                                {/* Fallback for legacy plans without marketing features */}
                                {(!plan.marketingFeatures || plan.marketingFeatures.length === 0) && (
                                    <>
                                        <li className="flex items-center">
                                            <span className="mr-2">📚</span>
                                            {plan.limits.quizzes === -1 ? 'Unlimited Quizzes' : `${plan.limits.quizzes} Quizzes/mo`}
                                        </li>
                                        <li className="flex items-center">
                                            <span className="mr-2">🤖</span>
                                            {plan.limits.ai_minutes === -1 ? 'Unlimited AI' : `${plan.limits.ai_minutes} Mins AI/mo`}
                                        </li>
                                        <li className="flex items-center">
                                            <span className="mr-2">📝</span>
                                            {plan.limits.exams === -1 ? 'Unlimited Exams' : `${plan.limits.exams || 0} Exams/mo`}
                                        </li>
                                        {plan.features.parentModule && (
                                            <li className="flex items-center text-green-600">
                                                <span className="mr-2">👨‍👩‍👧</span> Parent Module
                                            </li>
                                        )}
                                    </>
                                )}
                            </ul>

                            <button
                                onClick={() => handleSelectPlan(plan.id)}
                                disabled={isCurrent || processingId !== null}
                                className={`w-full py-3 rounded-lg font-bold transition-all flex justify-center items-center gap-2 ${isCurrent
                                    ? 'bg-emerald-100 text-emerald-700 cursor-default opacity-100' // Distinct Active Style
                                    : isProcessing
                                        ? 'bg-indigo-400 text-white cursor-wait'
                                        : isOtherProcessing
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                                    }`}
                            >
                                {isProcessing && (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {isProcessing ? 'Processing...' : (isCurrent ? 'Active Plan' : 'Upgrade')}
                            </button>
                        </div>
                    )
                }) : packages.map((pack) => {
                    const isProcessing = processingId === pack.id;
                    const isOtherProcessing = processingId !== null && !isProcessing;

                    return (
                        <div key={pack.id} className={`border rounded-xl p-6 w-full flex flex-col hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 border-slate-200 dark:border-slate-700`}>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-xl font-bold">{pack.name}</h3>
                                {pack.recommended && <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">Recommended</span>}
                            </div>

                            <div className="text-3xl font-bold mb-4 text-indigo-600">
                                {pack.credits} <span className="text-lg text-gray-500 font-medium">Credits</span>
                            </div>

                            <p className="text-gray-500 mb-6 min-h-[40px] text-sm">{pack.description || 'Flexible credits for quizzes, AI minutes, and more.'}</p>

                            <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                                <div className="text-2xl font-bold">
                                    {pack.currency} {pack.price}
                                </div>
                                <div className="text-gray-400 text-xs mt-1">One-time payment</div>
                            </div>

                            <button
                                onClick={() => handleBuyCredits(pack.id)}
                                disabled={processingId !== null}
                                className={`py-3 px-4 rounded-full font-semibold transition-colors w-full flex justify-center items-center gap-2 ${isProcessing
                                    ? 'bg-indigo-400 text-white cursor-wait'
                                    : isOtherProcessing
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                            >
                                {isProcessing && (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {isProcessing ? 'Processing...' : 'Buy Pack'}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
