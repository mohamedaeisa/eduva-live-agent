import { useState, useEffect } from 'react';
import { PricingTable } from './PricingTable';

interface PaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string;
    currentPlanId?: string;
    details?: { limit: number; current: number };
}

export function PaywallModal({ isOpen, onClose, reason, currentPlanId, details }: PaywallModalProps) {
    const [showPlans, setShowPlans] = useState(false);

    useEffect(() => {
        if (isOpen) setShowPlans(false);
    }, [isOpen]);

    if (!isOpen) return null;

    console.log('[PaywallModal] Opened with reason:', reason, 'CurrentPlanId:', currentPlanId, 'Details:', details);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden relative ${showPlans ? 'max-w-6xl w-full' : 'max-w-lg w-full'}`}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
                >
                    ✕
                </button>

                {!showPlans ? (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center text-3xl mb-4 mx-auto shadow-sm">👑</div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Upgrade Required</h2>

                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl mb-6 text-sm border border-slate-100 dark:border-slate-700">
                            {reason === 'quota_exceeded' ? (
                                <p className="text-slate-600 dark:text-slate-300">
                                    You've reached the monthly limit for <span className="font-bold">trained materials</span> on your current plan.
                                </p>
                            ) : reason === 'plan_restriction' && details ? (
                                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                    📄 This document has <span className="font-bold text-red-500">{details.current} pages</span>,
                                    but your current plan only supports up to <span className="font-bold text-indigo-500">{details.limit} pages</span> per document.
                                </p>
                            ) : (
                                <p className="text-slate-600 dark:text-slate-300">
                                    This feature is available exclusively on our Premium plans.
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setShowPlans(true)}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all transform hover:-translate-y-0.5 active:scale-95"
                            >
                                See Upgrade Plans
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold text-sm transition-colors"
                            >
                                Not Now, Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 max-h-[90vh] overflow-y-auto pt-16">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white">Select a Plan</h2>
                            <p className="text-slate-500 text-sm mt-1">Unlock higher limits and premium features</p>
                        </div>
                        <PricingTable currentPlanId={currentPlanId} />
                    </div>
                )}
            </div>
        </div>
    );
}
