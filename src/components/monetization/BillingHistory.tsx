import { useState, useEffect } from 'react';
import { auth } from '../../services/firebaseConfig';
import { monetizationClient } from '../../services/monetization/client';
import { BillingEvent } from '../../types';

export function BillingHistory({ onViewInvoice }: { onViewInvoice?: (invoice: BillingEvent) => void }) {
    const [events, setEvents] = useState<BillingEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!auth.currentUser) return;
            try {
                const history = await monetizationClient.getBillingHistory();
                setEvents(history);
            } catch (error) {
                console.error("Failed to load billing history", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    if (loading) return <div className="p-8 text-center text-slate-500">Loading history...</div>;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold">Billing History</h2>
                <p className="text-sm text-slate-500">View your past invoices and payment receipts</p>
            </div>

            {events.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic">No payment history found.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3">Amount</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Receipt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((evt) => (
                                <tr key={evt.id} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-6 py-4 font-medium">
                                        {new Date(evt.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 capitalize">
                                        {evt.type.replace('_', ' ')}
                                        {evt.planId && <span className="block text-xs text-slate-400 mt-1">Subscription to {evt.planId}</span>}
                                    </td>
                                    <td className="px-6 py-4 font-mono">
                                        {evt.amount.toFixed(2)} {evt.currency.toUpperCase()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${evt.status === 'paid' || evt.status === 'PAID'
                                            ? 'bg-green-100 text-green-700'
                                            : evt.status === 'failed' || evt.status === 'FAILED'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {evt.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => onViewInvoice && onViewInvoice(evt)}
                                            className="text-indigo-600 hover:underline hover:text-indigo-800 font-medium transition-colors"
                                        >
                                            View Invoice
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
