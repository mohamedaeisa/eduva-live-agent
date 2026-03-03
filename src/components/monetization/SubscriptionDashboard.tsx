import { useState, useEffect } from 'react';
import { UserProfile, AppView, BillingEvent } from '../../types';
import { PricingTable } from './PricingTable';
import { BillingHistory } from './BillingHistory';
import { QuotaView } from './QuotaView';
import AlertModal from '../ui/AlertModal';
import { monetizationClient } from '../../services/monetization/client';

type Tab = 'plans' | 'history' | 'quota';

interface SubscriptionDashboardProps {
    user: UserProfile | null;
    onNavigate: (view: AppView) => void;
    onMockCheckout: (planId: string) => void;
    initialTab?: Tab;
    onViewInvoice: (invoice: BillingEvent) => void;
    successSessionId?: string | null;
    billingError?: string | null;
    onClearSuccess?: () => void;
}

export function SubscriptionDashboard({
    user,
    onNavigate,
    onMockCheckout,
    initialTab = 'plans',
    onViewInvoice,
    successSessionId,
    billingError,
    onClearSuccess
}: SubscriptionDashboardProps) {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const searchParams = new URLSearchParams(window.location.search);

    useEffect(() => {
        console.log('[SubscriptionDashboard] MOUNTED. Active Tab:', initialTab);

        // Optimistic Prefetch (Fire & Forget)
        monetizationClient.prefetchDashboard();

        if (successSessionId) {
            setShowSuccessModal(true);
        }
        if (billingError) {
            setShowErrorModal(true);
        }
    }, [successSessionId, billingError, initialTab]); // Added deps

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-16 px-4">
            <AlertModal
                isOpen={showSuccessModal}
                title="MEMBERSHIP ACTIVATED 🎉"
                message="Your subscription has been successfully updated! Your quota has been reset and your new features are ready."
                onClose={() => {
                    setShowSuccessModal(false);
                    if (onClearSuccess) onClearSuccess();
                }}
            />
            <AlertModal
                isOpen={showErrorModal}
                title="PAYMENT FAILED ❌"
                type="error"
                message={billingError || "The transaction was declined or failed. No changes have been made to your plan."}
                onClose={() => setShowErrorModal(false)}
                onConfirm={() => {
                    const failedPlan = localStorage.getItem('last_attempted_plan_id');
                    if (failedPlan && onMockCheckout) {
                        // If we have a failed plan, we can trigger the checkout flow again immediately
                        console.log("Retrying plan:", failedPlan);
                        // We need a way to trigger real checkout, but onMockCheckout is for mocks.
                        // Ideally we pass a 'retry' handler or just close. 
                        // For now, let's close, but maybe scroll to it?
                        setShowErrorModal(false);
                    } else {
                        setShowErrorModal(false);
                    }
                }}
                confirmLabel={localStorage.getItem('last_attempted_plan_id') ? "Retry Payment" : "Close"}
            />
            <AlertModal
                isOpen={!!searchParams.get('pending') && searchParams.get('pending') === 'true'}
                title="PAYMENT PENDING ⏳"
                type="info"
                message="Your payment is currently being processed. Your plan will be updated automatically once the transaction is confirmed."
                onClose={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('pending');
                    window.history.replaceState({}, '', url.pathname);
                }}
            />
            <div className="max-w-7xl mx-auto mb-6">
                {/* Header & Back */}
                <div className="flex items-center mb-6">
                    <button onClick={() => onNavigate(AppView.LIVING_DASHBOARD)} className="mr-4 text-slate-500 hover:text-indigo-600 transition-colors">
                        ← Back
                    </button>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription & Usage</h1>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-fit mb-8 mx-auto">
                    <button
                        onClick={() => setActiveTab('plans')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'plans'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                    >
                        Plans
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                    >
                        Payment History
                    </button>
                    <button
                        onClick={() => setActiveTab('quota')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'quota'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                    >
                        Quota Consumption
                    </button>
                </div>

                {/* Content Area */}
                <div className="animate-in fade-in duration-300">
                    {activeTab === 'plans' && (
                        <PricingTable
                            currentPlanId={user?.plan?.id}
                            onNavigate={onNavigate} // Kept for safety, though redundant nav likely removed from child
                            onMockCheckout={onMockCheckout}
                        />
                    )}

                    {activeTab === 'history' && (
                        <BillingHistory onViewInvoice={onViewInvoice} />
                    )}

                    {activeTab === 'quota' && (
                        <div className="max-w-3xl">
                            <QuotaView user={user} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
