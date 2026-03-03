import { X, Download, ExternalLink } from 'lucide-react';
import { BillingEvent } from '../../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useState } from 'react';

interface InvoiceModalProps {
    invoice: BillingEvent;
    onClose: () => void;
}

export function InvoiceModal({ invoice, onClose }: InvoiceModalProps) {
    const [isDownloading, setIsDownloading] = useState(false);

    const formattedDate = new Date(invoice.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const isPaid = invoice.status === 'paid';

    const handleDownloadPDF = async () => {
        const element = document.getElementById('invoice-content');
        if (!element) return;

        setIsDownloading(true);
        try {
            const canvas = await html2canvas(element, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`invoice_${invoice.id}.pdf`);
        } catch (error) {
            console.error("PDF generation failed", error);
            alert("Failed to generate PDF");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-2 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Invoice Details</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-3" id="invoice-content">
                    {/* Status Badge & Date */}
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="text-sm text-slate-500 mb-1">Status</div>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset ${isPaid
                                ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-yellow-50 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-900/30 dark:text-yellow-400'
                                }`}>
                                {invoice.status.toUpperCase()}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-slate-500 mb-1">Date</div>
                            <div className="font-medium text-slate-900 dark:text-white">{formattedDate}</div>
                        </div>
                    </div>

                    {/* Invoice Meta */}
                    <div className="grid grid-cols-2 gap-5 mb-3">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Billed To</div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">Eduva User</div>
                            <div className="text-sm text-slate-500">Personal Plan</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Invoice Number</div>
                            <div className="text-sm font-mono text-slate-600 dark:text-slate-300">#{invoice.id.slice(-8).toUpperCase()}</div>
                        </div>
                    </div>

                    {/* Gateway Traceability */}
                    {(invoice.provider || invoice.providerOrderId || invoice.providerTransactionId) && (
                        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700 text-[11px]">
                            <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Gateway Reference</div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <div className="text-slate-500">Method</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200">{invoice.provider || 'UNKNOWN'}</div>
                                </div>
                                {invoice.providerOrderId && (
                                    <div className="col-span-2">
                                        <div className="text-slate-500">Merchant Order ID</div>
                                        <div className="font-mono text-slate-700 dark:text-slate-200 break-all">{invoice.providerOrderId}</div>
                                    </div>
                                )}
                                {invoice.providerTransactionId && (
                                    <div className="col-span-3">
                                        <div className="text-slate-500">Gateway Transaction ID</div>
                                        <div className="font-mono text-slate-700 dark:text-slate-200 break-all">{invoice.providerTransactionId}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden mb-3">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-6 py-2 text-left font-medium">Description</th>
                                    <th className="px-6 py-2 text-right font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                <tr>
                                    <td className="px-6 py-2">
                                        <div className="font-medium text-slate-900 dark:text-white">
                                            Eduva Subscription
                                            <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                                                Plan Charge
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {new Date(invoice.timestamp).toLocaleString('default', { month: 'short' })} 1 - {new Date(invoice.timestamp + 30 * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'short' })} 1
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-right tabular-nums text-slate-900 dark:text-white font-medium">
                                        {invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                                <tr>
                                    <td className="px-6 py-2 font-bold text-slate-900 dark:text-white text-right">Total</td>
                                    <td className="px-6 py-2 font-bold text-slate-900 dark:text-white text-right tabular-nums">
                                        {invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between text-xs" data-html2canvas-ignore>
                        <div className="flex items-center text-slate-500">
                            <img src="https://cdn-icons-png.flaticon.com/512/179/179457.png" alt="Card" className="w-6 h-6 mr-2 opacity-50 grayscale" />
                            <span>Paid with card ending in •••• 1111</span>
                        </div>

                        <div className="flex gap-2">
                            {invoice.hostedInvoiceUrl && invoice.hostedInvoiceUrl !== '#' && (
                                <a
                                    href={invoice.hostedInvoiceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center px-4 py-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                >
                                    <ExternalLink size={16} className="mr-2" />
                                    Stripe Hosted
                                </a>
                            )}
                            <button
                                onClick={handleDownloadPDF}
                                disabled={isDownloading}
                                className="flex items-center px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                <Download size={16} className="mr-2" />
                                {isDownloading ? 'Generating...' : 'Download PDF'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
