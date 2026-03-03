import { useState, useEffect } from 'react';
import { Plan, UserProfile } from '../../types';
import { monetizationClient } from '../../services/monetization/client';

interface UsageStats {
    quizzesUsed: number;
    aiSecondsUsed: number;
    notesUsed: number;
    examsUsed: number;
}

export function QuotaView({ user }: { user: UserProfile | null }) {
    const [usage, setUsage] = useState<UsageStats>({ quizzesUsed: 0, aiSecondsUsed: 0, notesUsed: 0, examsUsed: 0 });
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;

            // 1. Fetch Current Plan Details
            // Use User's plan.id to find the plan object
            // For now, we fetch ALL plans and find the one matching user.plan.id
            const plans = await monetizationClient.getPlans();
            const currentPlanId = user.plan?.id;
            const currentPlan = plans.find(p => p.id === currentPlanId) || plans.find(p => p.price === 0); // Default to free if mismatch
            setPlan(currentPlan || null);

            // 2. Fetch Usage Counters
            try {
                const usageStats = await monetizationClient.getUsage();
                setUsage(usageStats);
            } catch (e) {
                console.warn("Failed to fetch usage", e);
            }

            setLoading(false);
        };

        fetchData();
    }, [user]);

    if (loading) return <div className="p-8 text-center text-slate-500">Loading usage data...</div>;
    if (!plan) return <div className="p-8 text-center text-red-500">Plan information unavailable.</div>;

    // Calculations
    const aiMinutesUsed = Math.ceil((usage.aiSecondsUsed || 0) / 60);
    const aiLimit = plan.limits.ai_minutes;
    const aiPercent = aiLimit === -1 ? 0 : Math.min(100, (aiMinutesUsed / aiLimit) * 100);

    const quizzesUsed = usage.quizzesUsed || 0;
    const quizLimit = plan.limits.quizzes;
    const quizPercent = quizLimit === -1 ? 0 : Math.min(100, (quizzesUsed / quizLimit) * 100);

    // Exams
    const examsUsed = usage.examsUsed || 0;
    const examLimit = plan.limits.exams || 0; // Default to 0 if not set in old plans
    const examPercent = examLimit === -1 ? 0 : Math.min(100, (examsUsed / (examLimit || 1)) * 100);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="text-lg font-bold mb-4">Current Usage <span className="text-slate-400 font-normal text-sm ml-2">({new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})</span></h2>

                <div className="space-y-6">
                    <div className="space-y-6">
                        {/* Helper to render usage bars */}
                        {(() => {
                            const renderUsage = (label: string, icon: string, used: number, limit: number, colorClass: string) => {
                                if (limit === 0) return null; // Hide if not in plan

                                const percent = limit === -1 ? 0 : Math.min(100, (used / limit) * 100);
                                const isUnlimited = limit === -1;

                                return (
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium flex items-center">
                                                <span className="mr-2">{icon}</span> {label}
                                            </span>
                                            <span className="text-sm text-slate-500">
                                                {isUnlimited ? (
                                                    <span>{used} / Unlimited</span>
                                                ) : (
                                                    <span>{used} / {limit}</span>
                                                )}
                                            </span>
                                        </div>
                                        {!isUnlimited && (
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                                <div
                                                    className={`h-2.5 rounded-full transition-all duration-500 ${percent > 90 ? 'bg-red-500' : colorClass}`}
                                                    style={{ width: `${percent}%` }}
                                                ></div>
                                            </div>
                                        )}
                                        {isUnlimited && (
                                            <div className="text-xs text-green-600 font-medium mt-1">Unlimited Access Active</div>
                                        )}
                                    </div>
                                );
                            };

                            return (
                                <>
                                    {renderUsage("Quizzes", "📚", quizzesUsed, quizLimit, "bg-indigo-600")}
                                    {renderUsage("Exams", "🏆", examsUsed, examLimit, "bg-blue-500")}
                                    {renderUsage("Notes Generation", "📄", usage.notesUsed || 0, plan.limits.notes || 0, "bg-orange-500")}
                                    {renderUsage("AI Tutor Time", "🤖", aiMinutesUsed, aiLimit, "bg-purple-600")}
                                    {plan.features.radar && (
                                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <span className="font-medium flex items-center text-sm">
                                                <span className="mr-2">🎯</span> Cognitive Radar Guidance
                                            </span>
                                            <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded shadow-sm">Included</span>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        {/* Fallback if everything is 0 (should rarely happen for paid plans) */}
                        {quizLimit === 0 && examLimit === 0 && plan.limits.notes === 0 && aiLimit === 0 && (
                            <div className="text-center text-slate-400 py-4 italic">
                                No usage quotas configured for this plan.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800 flex items-start">
                <span className="text-xl mr-3">💡</span>
                <div>
                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">Need more quota?</h4>
                    <p className="text-sm text-indigo-700 dark:text-indigo-400 mt-1">Upgrade to a higher tier plan to unlock more quizzes and AI minutes.</p>
                </div>
            </div>
        </div>
    );
}
