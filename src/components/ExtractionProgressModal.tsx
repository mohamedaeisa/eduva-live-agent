import React, { useState, useEffect } from 'react';
import { getDB } from '../services/idbService';
import { ChunkState, Plan } from '../types';
import { IngestionLedger } from '../types/ingestion';
import { PricingTable } from './monetization/PricingTable';

interface ExtractionProgressModalProps {
    docFingerprint: string;
    onClose: () => void;
    visible: boolean;
    currentPlanId?: string;
    onUpgrade?: () => void;
}

export const ExtractionProgressModal: React.FC<ExtractionProgressModalProps> = ({
    docFingerprint,
    onClose,
    visible,
    currentPlanId,
    onUpgrade
}) => {
    const [chunks, setChunks] = useState<ChunkState[]>([]);
    const [ledger, setLedger] = useState<IngestionLedger | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [showPlans, setShowPlans] = useState(false);

    useEffect(() => {
        if (!visible) {
            setShowPlans(false);
            return;
        }

        const poll = async () => {
            try {
                const idb = await getDB();
                const [allChunks, currentLedger] = await Promise.all([
                    idb.getAllFromIndex('chunks', 'by_doc', docFingerprint),
                    idb.get('ingestion_ledgers', docFingerprint)
                ]);

                // Sort by batch index
                const sorted = allChunks.sort((a, b) => a.batchIndex - b.batchIndex);
                setChunks(sorted);
                setLedger(currentLedger);
                setLoading(false);
            } catch (err) {
                console.error('[PROGRESS_MODAL] Failed to fetch data:', err);
            }
        };

        poll();
        const interval = setInterval(poll, 1000); // Poll every second for smooth updates
        return () => clearInterval(interval);
    }, [docFingerprint, visible]);

    if (!visible) return null;

    // --- MINIMIZED WIDGET ---
    if (isMinimized) {
        const completedCount = chunks.filter(c => c.status === 'COMPLETED').length;
        const totalCount = chunks.length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const isDone = ledger?.status === 'COMPLETED';

        return (
            <div
                onClick={() => setIsMinimized(false)}
                style={minimizedWidgetStyle}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: isDone ? '#4caf50' : '#2196f3',
                        animation: isDone ? 'none' : 'pulse 2s infinite'
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {isDone ? 'Extraction Ready' : 'Extracting...'}
                        </div>
                        <div style={{ height: '3px', background: '#333', borderRadius: '1.5px', marginTop: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, background: isDone ? '#4caf50' : '#2196f3', transition: 'width 0.3s ease' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 'black', color: isDone ? '#4caf50' : '#aaa' }}>
                        {progress}%
                    </div>
                </div>
                <style>{`
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

    // --- RENDER HELPERS ---
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMPLETED': return '✓';
            case 'RESUMING':
            case 'PROCESSING': return '⏳';
            case 'PAUSED_QUOTA': return '⏸';
            case 'FAILED':
            case 'FAILED_TRANSIENT':
            case 'FAILED_LOGIC': return '⚠';
            default: return '○';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'COMPLETED': return '#4caf50';
            case 'RESUMING':
            case 'PROCESSING': return '#2196f3';
            case 'PAUSED_QUOTA': return '#ff9800';
            case 'FAILED':
            case 'FAILED_TRANSIENT':
            case 'FAILED_LOGIC': return '#f44336';
            default: return '#9e9e9e';
        }
    };

    const renderContent = () => {
        // --- DATA PRIORITY ---
        // If we have chunks and atoms, but technically have a limit error (e.g. from a re-train attempt),
        // we should prioritize showing the data we already have.
        const totalAtoms = chunks.reduce((acc, c) => acc + (c.atomCount || 0), 0);
        const overallProgress = chunks.length > 0 ? Math.round((chunks.filter(c => c.status === 'COMPLETED').length / chunks.length) * 100) : 0;

        const isActuallyDone = ledger?.status === 'COMPLETED' || (overallProgress === 100 && chunks.length > 0);

        // If it's a limit error, but we have NO DATA yet, then show the paywall.
        // If we HAVE DATA, show the data (as requested: "show me back the chunks details").
        if (ledger?.status === 'FAILED_LIMIT' && chunks.length === 0) {
            const isPageLimit = ledger.pausedReason?.startsWith('PAGE_LIMIT_EXCEEDED');
            const parts = ledger.pausedReason?.split(':');
            const current = parts ? parseInt(parts[1]) : 0;
            const limit = parts ? parseInt(parts[2]) : 0;

            return (
                <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👑</div>
                    <h2 style={{ margin: '0 0 12px 0', color: '#ff9800', fontWeight: '900' }}>Limit Reached</h2>

                    <div style={{
                        background: 'rgba(255,152,0,0.1)',
                        border: '1px solid rgba(255,152,0,0.2)',
                        padding: '16px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        fontSize: '14px',
                        color: '#eee',
                        lineHeight: '1.6'
                    }}>
                        {isPageLimit ? (
                            <>
                                📄 Document has <span style={{ color: '#f44336', fontWeight: 'bold' }}>{current} pages</span>,
                                but your current plan supports up to <span style={{ color: '#2196f3', fontWeight: 'bold' }}>{limit} pages</span> per document.
                            </>
                        ) : ledger.pausedReason?.startsWith('QUOTA_EXCEEDED') ? (
                            <>
                                📊 You have used <span style={{ color: '#f44336', fontWeight: 'bold' }}>{current}</span> of your <span style={{ color: '#2196f3', fontWeight: 'bold' }}>{limit}</span> allowed documents for this month.
                            </>
                        ) : (
                            ledger.pausedReason || "You've reached your usage limit for this period."
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button
                            onClick={onUpgrade}
                            style={{ ...actionButtonStyle, margin: 0, width: '100%', background: '#3f51b5' }}
                        >
                            See Upgrade Plans
                        </button>
                        <button
                            onClick={onClose}
                            style={{ ...footerBackgroundButtonStyle, width: '100%', padding: '10px', fontSize: '14px' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            );
        }

        // --- ERROR STATE ---
        if (ledger?.status === 'FAILED_TERMINAL') {
            return (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
                    <h2 style={{ margin: '0 0 12px 0', color: '#f44336' }}>Process Interrupted</h2>
                    <p style={{ color: '#ccc', margin: '0 0 24px 0' }}>
                        {ledger.pausedReason || "An unexpected error occurred during ingestion."}
                    </p>
                    <button onClick={onClose} style={{ ...actionButtonStyle, background: '#333', width: '100%' }}>Close</button>
                </div>
            );
        }

        // --- PROGRESS / DATA VIEW ---
        // v1.3 Refined Step Transitions
        const step1Status = (ledger?.status && ledger.status !== 'CREATED') ? 'COMPLETED' : 'PROCESSING';
        const step2Status = chunks.length > 0 ? 'COMPLETED' :
            (['RESUMING', 'PDF_EXTRACTED'].includes(ledger?.status || '') ? 'PROCESSING' : 'PENDING');
        const step3Status = chunks.length > 0 ? (overallProgress === 100 ? 'COMPLETED' : 'PROCESSING') : 'PENDING';

        return (
            <>
                {/* Global Step Indicator / Success Banner */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#252525' }}>
                    {isActuallyDone ? (
                        <div style={{ marginBottom: '12px', textAlign: 'center', animation: 'slideUp 0.4s ease-out' }}>
                            <div style={{ fontSize: '24px', marginBottom: '4px' }}>🏆</div>
                            <h3 style={{ margin: 0, color: '#4caf50', fontSize: '16px', fontWeight: '900' }}>Training Complete</h3>
                            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{totalAtoms} items</span> in <span style={{ color: '#2196f3', fontWeight: 'bold' }}>{chunks.length} chunks</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '4px' }}>
                            <ProgressStep
                                label="Plan"
                                status={step1Status}
                                icon="🛡️"
                            />
                            <div style={{ height: '1px', flex: 1, background: '#333', marginTop: '12px' }} />
                            <ProgressStep
                                label="Analyze"
                                status={step2Status}
                                icon="📂"
                            />
                            <div style={{ height: '1px', flex: 1, background: '#333', marginTop: '12px' }} />
                            <ProgressStep
                                label="Extraction"
                                status={step3Status}
                                icon="🧠"
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        <span>Progress</span>
                        <span>{overallProgress}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${overallProgress}%`,
                            background: '#4caf50',
                            boxShadow: '0 0 8px rgba(76, 175, 80, 0.4)',
                            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                        }} />
                    </div>
                </div>

                {/* Content Area */}
                <div className="eduva-extraction-content" style={{ padding: '0', overflowY: 'auto', flex: 1, maxHeight: '400px' }}>
                    {loading ? (
                        <div style={{ padding: '60px 40px', textAlign: 'center', color: '#666' }}>
                            <div className="spinner" style={{ marginBottom: '16px' }}>⏳</div>
                            <div style={{ fontSize: '14px' }}>Connecting to ingestion engine...</div>
                        </div>
                    ) : chunks.length === 0 ? (
                        <div style={{ padding: '60px 40px', textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '20px', animation: 'spin-slow 4s linear infinite' }}>📂</div>
                            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Analyze Material Details</div>
                            <div style={{ fontSize: '13px', color: '#aaa', maxWidth: '300px', margin: '0 auto', lineHeight: '1.5' }}>
                                Extracting text and performing structural analysis to prepare for AI processing.
                            </div>
                            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2196f3', animation: 'pulse 1s infinite' }} />
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2196f3', animation: 'pulse 1s infinite 0.2s' }} />
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2196f3', animation: 'pulse 1s infinite 0.4s' }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '8px 0' }}>
                            {chunks.map((chunk) => (
                                <div key={chunk.id} style={{
                                    padding: '16px 24px',
                                    borderBottom: '1px solid #2a2a2a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    background: chunk.status === 'PROCESSING' ? 'rgba(33, 150, 243, 0.08)' : 'transparent',
                                    transition: 'background 0.3s'
                                }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: chunk.status === 'COMPLETED' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                        border: `1.5px solid ${getStatusColor(chunk.status)}`,
                                        color: getStatusColor(chunk.status), fontSize: '12px', flexShrink: 0
                                    }}>
                                        {getStatusIcon(chunk.status)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600 }}>Chunk {chunk.batchIndex + 1}</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: getStatusColor(chunk.status) }}>
                                                {chunk.status === 'COMPLETED' ? `${chunk.atomCount} items` : (chunk.status === 'PROCESSING' ? 'Extracting...' : 'Pending')}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#888' }}>Pages {chunk.pageStart} - {chunk.pageEnd}</div>
                                        {chunk.status === 'PROCESSING' && (
                                            <div style={{ marginTop: '10px', height: '3px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: '100%', background: '#2196f3', animation: 'indeterminate 1.5s infinite linear' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#252525' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {overallProgress < 100 && <div className="spinner-small" />}
                        <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 500 }}>
                            {loading ? 'Connecting...' : overallProgress === 100 ? 'Finalizing...' : chunks.length === 0 ? 'Analyzing...' : 'Extracting...'}
                        </span>
                    </div>
                    <button onClick={() => setIsMinimized(true)} style={footerBackgroundButtonStyle}>Background</button>
                </div>
            </>
        );
    };

    return (
        <>
            <div style={overlayStyle} onClick={() => setIsMinimized(true)} />
            <div style={containerStyle} className="eduva-extraction-modal">
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '24px' }}>⚡</div>
                        <div>
                            <h3 style={titleStyle}>Extraction</h3>
                            {ledger?.status !== 'COMPLETED' && ledger?.status !== 'FAILED_TERMINAL' && chunks.length > 0 && (
                                <div style={{ fontSize: '10px', color: '#66abff', marginTop: '1px', fontWeight: 600 }}>
                                    {chunks.filter(c => c.status === 'COMPLETED').length}/{chunks.length} chunks
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => setIsMinimized(true)} style={minimizeButtonStyle} title="Minimize">_</button>
                        <button onClick={onClose} style={closeButtonStyle} title="Close">×</button>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {renderContent()}
                </div>
                <style>{`
                    @keyframes indeterminate {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(200%); }
                    }
                    @keyframes spin-slow {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    @keyframes pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.5); opacity: 0.5; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    .spinner-small {
                        width: 12px;
                        height: 12px;
                        border: 2px solid rgba(33, 150, 243, 0.2);
                        border-top-color: #2196f3;
                        border-radius: 50%;
                        animation: spin-slow 1s linear infinite;
                    }
                    @media (max-width: 600px) {
                        .eduva-extraction-modal {
                            width: 95% !important;
                            max-height: 90vh !important;
                        }
                        .eduva-extraction-content {
                            max-height: 50vh !important;
                        }
                    }
                `}</style>
            </div>
        </>
    );
};

// --- HELPER COMPONENT ---
const ProgressStep: React.FC<{ label: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED', icon: string }> = ({ label, status, icon }) => {
    const color = status === 'COMPLETED' ? '#4caf50' : (status === 'PROCESSING' ? '#2196f3' : '#444');
    const opacity = status === 'PENDING' ? 0.3 : 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, opacity, transition: 'opacity 0.3s', minWidth: 0 }}>
            <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: status === 'COMPLETED' ? 'rgba(76, 175, 80, 0.1)' : (status === 'PROCESSING' ? 'rgba(33, 150, 243, 0.1)' : '#1a1a1a'),
                border: `1.5px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
                marginBottom: '4px', position: 'relative'
            }}>
                {status === 'COMPLETED' ? '✓' : icon}
                {status === 'PROCESSING' && (
                    <div style={{
                        position: 'absolute', top: '-3px', left: '-3px', right: '-3px', bottom: '-3px',
                        border: '1.5px solid #2196f3', borderRadius: '50%', borderTopColor: 'transparent',
                        animation: 'spin-slow 1s linear infinite'
                    }} />
                )}
            </div>
            <div style={{ fontSize: '8px', fontWeight: 800, textAlign: 'center', color: color, textTransform: 'uppercase', lineHeight: '1.1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                {label}
            </div>
        </div>
    );
};

// --- STYLES ---
const containerStyle: React.CSSProperties = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    zIndex: 10000, backgroundColor: '#1e1e1e', border: '2px solid #3f51b5', borderRadius: '12px',
    padding: '0', maxWidth: '600px', width: '90%', maxHeight: '85vh',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
};

const headerStyle: React.CSSProperties = {
    padding: '12px 16px', borderBottom: '1px solid #333',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: '16px', fontWeight: 900, letterSpacing: '-0.5px' };

const closeButtonStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
    fontSize: '24px', padding: '0', width: '32px', height: '32px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px'
};

const minimizeButtonStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
    fontSize: '18px', padding: '0', width: '32px', height: '32px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px',
    fontWeight: 'bold', marginBottom: '4px'
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
    backdropFilter: 'blur(2px)'
};

const minimizedWidgetStyle: React.CSSProperties = {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: 11000,
    width: '200px', padding: '12px', background: '#1e1e1e',
    border: '1.5px solid #2196f3', borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out'
};

const actionButtonStyle: React.CSSProperties = {
    padding: '10px 24px', background: '#4caf50', color: '#fff', border: 'none',
    borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.2s', marginTop: '16px'
};

const footerBackgroundButtonStyle: React.CSSProperties = {
    padding: '8px 16px', borderRadius: '6px', border: '1px solid #444',
    background: '#333', color: '#fff', cursor: 'pointer', fontSize: '12px'
};
