
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TRANSLATIONS } from '../i18n';
import {
    LibraryItem, LibraryFolder, UserProfile, Language,
    LocalTrainingSource, Difficulty, DetailLevel, QuizType, ChunkState, GenerationRequest
} from '../types';
import {
    getLibraryItems, saveToLibrary, deleteFromLibrary, createFolder,
    deleteFolder, getAllUserFolders, renameFolder, moveLibraryItem, moveFolder,
    saveLocalTrainingSource, deleteLocalTrainingSource, deleteLocalAtomsByContent, getLocalTrainingSources
} from '../services/storageService';
import { extractAtomsFromDocument } from '../services/ai/atomExtractionService'; // Keep for legacy reference if needed, but we switch to Router
import { runIngestion } from '../services/ingestion/runIngestion';
import { ExtractionMode, IngestionMode } from '../types/ingestion';
import { cancelIngestion } from '../services/ingestion/ingestionControl';
import { computeDocFingerprint } from '../utils/fingerprintUtils';
import { getDB } from '../services/idbService';
import { SUBJECTS } from '../constants';
import Button from './ui/Button';
import {
    Folder, FileText, Trash2, UploadCloud, Check,
    RefreshCw, AlertTriangle, FolderPlus, Edit2, Terminal, X
} from 'lucide-react';
import { logger } from '../utils/logger';
import { ExtractionProgressModal } from './ExtractionProgressModal';
import { resumePausedIngestions, getPausedDocuments } from '../services/ingestion/retryOrchestrator';
import { useQuota } from '../hooks/useQuota';
import { monetizationClient } from '../services/monetization/client';
import { PaywallModal } from './monetization/PaywallModal';
import { getPdfPageCount } from '../services/pdfUtils';
import { db } from '../services/firebaseConfig';
import { Plan } from '../types';

// --- CONSTANTS ---
// Last updated: Fix Sparkles crash
const SUBJECT_ROOT_PREFIX = 'SUBJECT_ROOT:';

// --- TYPES ---
interface TrainingSessionViewModel {
    sourceId: string;
    libraryId?: string;
    folderId: string | null;
    fingerprint: string;
    fileName: string;
    subject: string;
    globalStatus: 'Pending' | 'Training' | 'Completed' | 'Failed';
    localStatus: 'Ready' | 'MissingBinary' | 'Processing';
    progress: number;
    chunkStats: { total: number; completed: number; failed: number };
    chunks: ChunkState[];
    trustScore?: number;
    dataAvailable: boolean;
    atomCount: number;
    updatedAt: number;
    logs?: string[];
    eta?: string; // New: Estimated Time Remaining
}

// --- SUB-COMPONENTS ---

const ChunkVisualizer = ({ chunks, onRetry }: { chunks: ChunkState[], onRetry: (c: ChunkState) => void }) => (
    <div className="flex gap-1 mt-2 flex-wrap">
        {chunks.sort((a, b) => a.batchIndex - b.batchIndex).map((chunk, i) => {
            let color = 'bg-slate-200 dark:bg-slate-700';
            if (chunk.status === 'COMPLETED') color = 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]';
            else if (chunk.status === 'PROCESSING') color = 'bg-indigo-500 animate-pulse';
            else if (chunk.status === 'FAILED') color = 'bg-red-500 cursor-pointer';

            return (
                <div
                    key={chunk.id}
                    className={`w-1.5 h-1.5 rounded-full ${color} transition-all`}
                    onClick={(e) => {
                        if (chunk.status === 'FAILED') {
                            e.stopPropagation();
                            onRetry(chunk);
                        }
                    }}
                />
            );
        })}
    </div>
);

const FileListHeader = ({ t }: { t: any }) => (
    <div className="hidden md:flex items-center gap-4 px-5 py-2 mb-2 text-[10px] font-black uppercase text-slate-400 tracking-widest select-none">
        <div className="flex-[2] pl-14">{t.library.table.filename}</div>
        <div className="w-40">{t.library.table.subject}</div>
        <div className="flex-1 min-w-[180px]">{t.library.table.status}</div>
        <div className="w-auto min-w-[100px]">{t.library.table.action}</div>
    </div>
);

interface DocumentRowProps {
    vm: TrainingSessionViewModel;
    availableSubjects: string[];
    onTrain: () => void;
    onDelete: () => void;
    onUpdateSubject: (newSubject: string) => void;
    onShowLogs: (logs: string[]) => void;
    onRetryChunk: (c: ChunkState) => void;
    t: any;
}

const DocumentRow: React.FC<DocumentRowProps> = ({
    vm,
    availableSubjects,
    onTrain,
    onDelete,
    onUpdateSubject,
    onShowLogs,
    onRetryChunk,
    t
}) => {
    const [deleteStage, setDeleteStage] = useState<0 | 1 | 2>(0);
    const isTraining = vm.globalStatus === 'Training' || vm.localStatus === 'Processing';
    // 🟢 FIX: enhanced completion check to catch "Pending 100%" states
    const isComplete = vm.globalStatus === 'Completed' || (vm.progress === 100 && vm.globalStatus !== 'Failed');
    const isFailed = vm.globalStatus === 'Failed' || vm.chunkStats.failed > 0;

    // Retry Lock: Disable if actively training
    const isRetryLocked = isTraining;

    // Logic: Retrain is active only if not completed OR if some chunks failed/unprocessed
    // 🟢 FIX: strictly disable if complete (unless failed), as requested by user
    const canRetrain = !isComplete || isFailed;

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-xl p-2 border border-slate-100 dark:border-slate-700 shadow-sm transition-all group flex flex-col md:flex-row items-center gap-3 mb-2 ${isComplete ? 'cursor-default' : 'hover:shadow-md'}`}>
            {/* ... Icon & Name ... */}
            <div className={`flex items-center gap-3 flex-[2] min-w-0 w-full md:w-auto ${isComplete ? 'pointer-events-none' : ''}`}>
                <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm shadow-sm border ${isComplete ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/30' :
                    isTraining ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/30 animate-pulse' :
                        isFailed ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/30' :
                            'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}>
                    <FileText size={16} />
                </div>
                <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-white text-xs truncate leading-tight" title={vm.fileName}>{vm.fileName}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider scale-90 origin-left">{t.library.uploaded} {new Date(vm.updatedAt).toLocaleDateString()}</p>
                </div>
            </div>

            {/* ... Subject Select ... */}
            <div className={`w-full md:w-32 shrink-0 ${isComplete ? 'pointer-events-none opacity-50' : ''}`} onClick={e => e.stopPropagation()}>
                <select
                    value={vm.subject}
                    onChange={(e) => onUpdateSubject(e.target.value)}
                    disabled={isTraining || isComplete}
                    className={`w-full py-1.5 px-2 rounded-lg border-2 font-bold text-[10px] outline-none transition-all shadow-sm appearance-none ${!isTraining && !isComplete ? 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* ... Status & Progress ... */}
            <div
                className={`flex-1 w-full md:w-auto min-w-[140px] ${isComplete ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                    if (isComplete) {
                        e.stopPropagation();
                        onTrain(); // handleTrain will open the modal
                    }
                }}
            >
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isComplete ? 'text-emerald-600' : isTraining ? 'text-indigo-600' : isFailed ? 'text-red-500' : 'text-slate-500'}`}>
                            {isComplete ? t.library.statusLabels.ready : isTraining ? t.library.statusLabels.syncing : isFailed ? t.library.statusLabels.error : t.library.statusLabels.pending}
                        </span>
                        {/* ETA Display */}
                        {vm.eta && isTraining && (
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 rounded ml-2 animate-fade-in">
                                ⏳ ETA: {vm.eta}
                            </span>
                        )}
                    </div>
                    {/* Percentage/Stats Display */}
                    <div className="flex items-center gap-2">
                        {isComplete && vm.atomCount > 0 && (
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 rounded">
                                {vm.atomCount} ATOMS
                            </span>
                        )}
                        <span className="text-[9px] font-black text-slate-400">{vm.progress}%</span>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
                    <div className={`h-full transition-all duration-700 ${isFailed ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-indigo-500 relative'}`} style={{ width: `${Math.max(5, vm.progress)}%` }}>
                        {isTraining && <div className="absolute inset-0 bg-white/30 animate-[shimmer_1.5s_infinite] -skew-x-12"></div>}
                    </div>
                </div>
                {(isTraining || vm.chunkStats.total > 0) && <ChunkVisualizer chunks={vm.chunks} onRetry={onRetryChunk} />}
            </div>

            {/* ... Actions ... */}
            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end md:justify-start min-w-[100px]">
                {deleteStage > 0 ? (
                    <div className="flex items-center gap-1 animate-fade-in bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                        <button
                            onClick={(e) => { e.stopPropagation(); setDeleteStage(0); }}
                            className="p-1 px-2 text-slate-500 hover:text-slate-700 text-[9px] font-bold"
                        >
                            {t.common?.cancel || 'CANCEL'}
                        </button>

                        {deleteStage === 1 ? (
                            // Stage 1: Warning for Trained Data
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteStage(2); }}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center gap-1"
                            >
                                <AlertTriangle size={10} /> {t.library.actions?.confirm || 'CONFIRM?'}
                            </button>
                        ) : (
                            // Stage 2: Final Delete or Cancel Training
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isTraining) {
                                        console.log(`[LIB_DEBUG] Cancellation Triggered for ${vm.fileName}`);
                                        cancelIngestion(vm.fingerprint);
                                        setDeleteStage(0);
                                    } else {
                                        console.log(`[LIB_DEBUG] Final Deletion Confirmed for ${vm.fileName}`);
                                        onDelete();
                                    }
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95"
                            >
                                {isTraining ? 'CANCEL TRAINING' : (t.library.actions?.delete || 'DELETE')}
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <Button
                            size="sm"
                            // STRICT DISABLE: If training/processing, button is effectively dead
                            disabled={!canRetrain || (isFailed && isRetryLocked) || isTraining}
                            onClick={(e) => { e.stopPropagation(); onTrain(); }}
                            className={`flex-1 md:flex-none ${isFailed ? 'bg-red-600 hover:bg-red-700 text-white' : isTraining ? 'bg-indigo-400 dark:bg-indigo-600 cursor-wait opacity-80 text-white' : !canRetrain ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} text-[9px] height-7 font-black uppercase tracking-wider px-4 py-1.5 shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed`}
                        >
                            {/* Dynamic Button Label: PENDING (100%) case should show Trained */}
                            {isTraining ? 'Generating...' : isFailed ? (isRetryLocked ? 'Retrying...' : t.library.actions.retry) : isComplete ? (t.library.statusLabels?.ready || 'TRAINED') : t.library.actions.train}
                        </Button>
                        <button
                            onClick={(e) => {
                                // 2-Stage Confirm for Trained Items or Active Training, 1-Stage for others
                                if (isTraining) {
                                    setDeleteStage(2); // Jump straight to Cancel confirmation
                                } else {
                                    setDeleteStage(isComplete ? 1 : 2);
                                }
                                console.log(`[LIB_DEBUG] User initiated delete/cancel sequence for ${vm.fileName}`);
                            }}
                            className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all active:scale-90 z-10"
                            title={isTraining ? "Cancel Training" : "Force Delete / Purge"}
                        >
                            <Trash2 size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// ... (CreateFolderModal, LogViewerModal)

// --- MAIN COMPONENT ---
// ... (imports)

// Helper to calc ETA
const calculateETA = (chunks: ChunkState[]): string | undefined => {
    const completed = chunks.filter(c => c.status === 'COMPLETED');
    const remaining = chunks.filter(c => c.status !== 'COMPLETED');

    if (completed.length === 0 || remaining.length === 0) return undefined;

    // Avg time per chunk
    const totalDuration = completed.reduce((acc, c) => acc + ((c.updatedAt || Date.now()) - (c.startedAt || 0)), 0);
    // Rough heuristic: if startedAt missing, assume 30s
    const avgTime = totalDuration > 0 ? totalDuration / completed.length : 30000;

    const timeLeftMs = avgTime * remaining.length;

    if (timeLeftMs < 60000) return `~${Math.ceil(timeLeftMs / 1000)}s`;
    return `~${Math.ceil(timeLeftMs / 60000)}m`;
};


const CreateFolderModal = ({ isOpen, onClose, onCreate, t }: { isOpen: boolean, onClose: () => void, onCreate: (name: string) => void, t: any }) => {
    const [folderName, setFolderName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isOpen) { setFolderName(''); setTimeout(() => inputRef.current?.focus(), 100); } }, [isOpen]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-100 animate-pop">
                <h3 className="text-lg font-black text-slate-800 dark:text-white mb-4">{t.library.modals.newFolderTitle}</h3>
                <input ref={inputRef} type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={t.library.modals.folderNamePlaceholder} className="w-full p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-950 outline-none focus:border-indigo-500 font-bold mb-4" onKeyDown={(e) => e.key === 'Enter' && folderName.trim() && onCreate(folderName)} />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">{t.common.cancel}</button>
                    <button onClick={() => folderName.trim() && onCreate(folderName)} className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-lg">{t.common.save}</button>
                </div>
            </div>
        </div>
    );
};

const ErrorBoundary = class extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: any) { console.error("Boundary Caught:", error); }
    render() { return this.state.hasError ? this.props.fallback : this.props.children; }
};

// --- HACKING LOG OVERLAY (Floating Window) ---
const HackingLogOverlay = ({ logs, onClose, t, fileName }: { logs: string[], onClose: () => void, t: any, fileName?: string }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // --- Intelligence Simulation State ---
    const [stats, setStats] = useState({ pages: 0, chunks: 0, atoms: 0, relations: 0 });
    const [narrativeIndex, setNarrativeIndex] = useState(0);
    const [progressLayers, setProgressLayers] = useState({ parsing: 0, mapping: 0, linking: 0 });

    const NARRATIVE_LINES = [
        "Initializing neural handshake...",
        "Decrypting core concepts...",
        "Tracing hidden relationships...",
        "Validating semantic integrity...",
        "Linking theory to prior knowledge...",
        "Optimizing retention pathways...",
        "Synthesizing exam-grade notes..."
    ];

    // Narrative Ticker
    useEffect(() => {
        const interval = setInterval(() => {
            setNarrativeIndex(prev => (prev + 1) % NARRATIVE_LINES.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    // Simulation Engine
    useEffect(() => {
        const simInterval = setInterval(() => {
            setStats(prev => ({
                pages: prev.pages + (Math.random() > 0.8 ? 1 : 0),
                chunks: prev.chunks + (Math.random() > 0.7 ? 1 : 0),
                atoms: prev.atoms + (Math.random() > 0.5 ? Math.floor(Math.random() * 3) : 0),
                relations: prev.relations + (Math.random() > 0.6 ? 1 : 0)
            }));

            setProgressLayers(prev => ({
                parsing: Math.min(100, prev.parsing + (Math.random() * 2)),
                mapping: Math.min(100, Math.max(0, prev.parsing - 20) + (Math.random() * 1.5)),
                linking: Math.min(100, Math.max(0, prev.mapping - 30) + (Math.random() * 1))
            }));
        }, 800);
        return () => clearInterval(simInterval);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current && !isMinimized) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, isMinimized]);

    if (isMinimized) {
        return (
            <div className="fixed bottom-4 right-4 z-[400] bg-black border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)] rounded-lg p-3 cursor-pointer hover:scale-105 transition-all animate-slide-up flex items-center gap-3" onClick={() => setIsMinimized(false)}>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-green-500 uppercase tracking-widest font-mono">SYSTEM_ACCESS</span>
                    <span className="text-[9px] font-bold text-green-700 truncate max-w-[120px]">{fileName || 'Terminal'}</span>
                </div>
                <div className="text-green-500 text-xs">▲</div>
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-[400] w-[600px] h-[550px] bg-black/95 backdrop-blur-md border border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.1)] rounded-xl flex flex-col overflow-hidden animate-slide-up ring-1 ring-green-900/50 font-mono">
            {/* Header */}
            <div className="h-10 bg-green-950/20 border-b border-green-900/50 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing shrink-0">
                <div className="flex items-center gap-3">
                    <Terminal size={14} className="text-green-500" />
                    <span className="text-xs font-black uppercase text-green-500 tracking-[0.2em]">ROOT@{fileName?.replace(/\.[^/.]+$/, "").toUpperCase() || 'HOST'}</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsMinimized(true)} className="w-6 h-6 flex items-center justify-center text-green-600 hover:text-green-400 hover:bg-green-900/30 rounded">_</button>
                    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-green-600 hover:text-red-400 hover:bg-red-900/30 rounded">✕</button>
                </div>
            </div>

            {/* Narrative & Stats Area */}
            <div className="p-5 border-b border-green-900/30 bg-black/40 shrink-0">
                {/* Visual Narrative */}
                <div className="h-8 flex items-center mb-4">
                    <span className="text-green-400 font-bold text-sm tracking-wide mr-2">{'>'}</span>
                    <span className="text-green-100 font-bold text-lg typing-cursor">{NARRATIVE_LINES[narrativeIndex]}</span>
                </div>

                {/* Multi-Layer Progress */}
                <div className="space-y-3 mb-4">
                    {[
                        { label: "EXTRACTION", val: progressLayers.parsing, color: "bg-green-600" },
                        { label: "MAPPING", val: progressLayers.mapping, color: "bg-emerald-500" },
                        { label: "LINKING", val: progressLayers.linking, color: "bg-teal-400" }
                    ].map((layer, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-green-700 w-16 text-right">{layer.label}</span>
                            <div className="flex-1 h-1.5 bg-green-950/50 rounded-full overflow-hidden">
                                <div className={`h-full ${layer.color} shadow-[0_0_10px_currentColor] transition-all duration-300`} style={{ width: `${layer.val}%` }}></div>
                            </div>
                            <span className="text-[10px] font-mono text-green-600 w-8">{Math.round(layer.val)}%</span>
                        </div>
                    ))}
                </div>

                {/* Live Stats Grid */}
                <div className="grid grid-cols-4 gap-2 mt-2">
                    {[
                        { label: "PAGES", val: stats.pages },
                        { label: "CHUNKS", val: stats.chunks },
                        { label: "FACTS", val: stats.atoms },
                        { label: "LINKS", val: stats.relations }
                    ].map((stat, i) => (
                        <div key={i} className="bg-green-950/10 border border-green-900/30 p-2 rounded flex flex-col items-center">
                            <span className="text-lg font-black text-green-400">{stat.val}</span>
                            <span className="text-[9px] font-bold text-green-800 uppercase tracking-wider">{stat.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Terminal Body */}
            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto font-mono text-[11px] space-y-1.5 custom-scrollbar-dark bg-black">
                {logs.length === 0 && (
                    <div className="text-green-800 italic animate-pulse">Initializing clean room environment...</div>
                )}
                {logs.map((log, i) => (
                    <div key={i} className="break-words text-green-500/80 border-l-2 border-green-800/20 pl-3 leading-relaxed hover:bg-green-900/5 transition-colors font-medium">
                        <span className="text-green-800 mr-2 select-none opacity-50">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                        {log}
                    </div>
                ))}
            </div>

            {/* Footer Insight Signals */}
            <div className="h-8 bg-green-950/30 border-t border-green-900/30 flex items-center px-4 justify-between shrink-0">
                <div className="flex gap-4">
                    <span className="text-[9px] font-bold text-green-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        SIGNAL: LEARNING STYLE DETECTED
                    </span>
                    <span className="text-[9px] font-bold text-green-800 flex items-center gap-1">
                        Forecast: Rising Difficulty
                    </span>
                </div>
                <span className="text-[9px] font-bold text-green-800 uppercase tracking-widest opacity-60">EDUVA v8.0 CORE</span>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
interface LibraryDashboardProps {
    user: UserProfile;
    appLanguage: Language;
    onBack: () => void;
    onUseItem?: (item: LibraryItem) => void;
    initialSubject?: string;
    onShowExtractionProgress: (fingerprint: string) => void;
}

export default function LibraryDashboard(props: LibraryDashboardProps) {
    const { user, appLanguage, onBack, onUseItem, initialSubject } = props;
    const [sources, setSources] = useState<LocalTrainingSource[]>([]);
    const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [viewModels, setViewModels] = useState<TrainingSessionViewModel[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string>(initialSubject || user.preferences.defaultSubject || user.preferences.subjects[0] || 'Mathematics');
    const [filterMode, setFilterMode] = useState<'SUBJECT' | 'ALL_TRAINED' | 'ALL_PENDING'>('SUBJECT');

    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderPath, setFolderPath] = useState<{ id: string, name: string }[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [viewingLogs, setViewingLogs] = useState<{ id: string, logs: string[], fileName: string } | null>(null);
    const [isPaywallOpen, setIsPaywallOpen] = useState(false);
    const [paywallReason, setPaywallReason] = useState<'quota_exceeded' | 'plan_restriction' | 'expired'>('quota_exceeded');
    const [paywallDetails, setPaywallDetails] = useState<{ limit: number; current: number } | undefined>(undefined);
    const [userPlanLimits, setUserPlanLimits] = useState<Plan['limits'] | null>(null);

    const { check: checkQuota } = useQuota('trainedmaterial');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const autoRetryLockRef = useRef<Set<string>>(new Set()); // 🔒 Mutex for Auto-Retry
    const subjects = useMemo(() => user.preferences.subjects || SUBJECTS, [user.preferences.subjects]);
    const t: any = TRANSLATIONS[appLanguage];

    useEffect(() => {
        if (initialSubject) {
            setSelectedSubject(initialSubject);
            setFilterMode('SUBJECT');
            setFolderPath([]);
            setCurrentFolderId(null);
        }
    }, [initialSubject]);

    useEffect(() => {
        loadData();
        const interval = setInterval(() => loadData(true), 5000);

        // Fetch plan limits for page count checks
        const fetchPlanLimits = async () => {
            try {
                const planId = user.plan?.id || 'FREE';
                const planDoc = await db?.collection('plans').doc(planId).get();
                if (planDoc?.exists) {
                    setUserPlanLimits((planDoc.data() as Plan).limits);
                } else {
                    // Fallback defaults
                    setUserPlanLimits({ quizzes: 3, exams: 1, ai_minutes: 5, notes: 2, linked_accounts: 0, trainedmaterial: 2, pageLimit: 15 });
                }
            } catch (e) {
                console.warn("[LIB_MONETIZATION] Failed to fetch plan limits:", e);
            }
        };
        fetchPlanLimits();

        return () => clearInterval(interval);
    }, [user.id, user.plan?.id]);

    const loadData = async (silent = false) => {
        try {
            const [sData, lData, fData] = await Promise.all([getLocalTrainingSources(user.id), getLibraryItems(user.id), getAllUserFolders(user.id)]);
            setSources(sData);
            setLibraryItems(lData);
            setFolders(fData);

            const idb = await getDB();
            const models = await Promise.all(sData.map(async (source) => {
                try {
                    const libItem = lData.find(li => li.contentId === source.fileHash);
                    const rawChunks = await idb.getAllFromIndex('chunks', 'by_doc', source.fileHash);

                    // Chunk Stall Detection (Individual)
                    // Reduced Timeout to 45s for more responsive "Stuck" handling
                    const chunks = rawChunks.map(c => {
                        if (c.status === 'PROCESSING' && (Date.now() - (c.updatedAt || 0) > 45000)) {
                            return { ...c, status: 'FAILED' as const, error: 'Stalled (Timeout)' };
                        }
                        return c;
                    });

                    const completed = chunks.filter(c => c.status === 'COMPLETED').length;
                    const failed = chunks.filter(c => c.status === 'FAILED').length;

                    // Source Stall Detection (Global)
                    // Reduced Timeout to 45s for more responsive "Stuck" handling
                    const isStalled = source.status === 'Training' && (Date.now() - (source.updatedAt || 0) > 45000);
                    const effectiveStatus = isStalled ? 'Failed' : source.status;

                    // --- PERSISTENT AUTO-RETRY LOGIC (ONE-SHOT) ---
                    // Auto-retry if: 
                    // 1. Status is Failed/Stalled
                    // 2. Chunks exist (it was not a new empty file)
                    // 3. We haven't auto-retried yet
                    const isCandidateForRetry = (effectiveStatus === 'Failed') && chunks.length > 0;
                    const hasTriedAutoRetry = source.retryMeta?.autoRetryAttempted;
                    const isLockedClientSide = autoRetryLockRef.current.has(source.fileHash || source.id);

                    if (isCandidateForRetry && !hasTriedAutoRetry && !isLockedClientSide) {
                        console.log(`[AUTO_RETRY] Triggering one-shot retry for ${source.fileName}`);

                        // 🔒 ACQUIRE LOCK (Client-Side)
                        autoRetryLockRef.current.add(source.fileHash || source.id);

                        // 1. Mark as attempted in DB immediately to prevent loops
                        const updatedSource: LocalTrainingSource = {
                            ...source,
                            status: 'Training',
                            updatedAt: Date.now(), // 🟢 Explicitly update timestamp to prevent immediate stall detection
                            retryMeta: { autoRetryAttempted: true, lastFailureAt: Date.now(), lastFailureReason: 'API' }
                        };

                        // We use fire-and-forget for the async operations to not block the UI render loop
                        // But we return an Optimistic VM so the user sees "Retrying..." immediately
                        saveLocalTrainingSource(updatedSource).then(() => {
                            extractAtomsFromDocument({
                                year: user.preferences.defaultYear,
                                curriculum: user.preferences.defaultCurriculum,
                                subject: source.subject,
                                topic: source.fileName,
                                mode: 'atom_extraction',
                                language: appLanguage,
                                difficulty: Difficulty.MEDIUM,
                                detailLevel: DetailLevel.DETAILED,
                                quizType: QuizType.MIX,
                                questionCount: 0,
                                studyMaterialFile: source.data,
                                studyMaterialUrl: source.fileHash,
                                fileName: source.fileName
                            }, user).catch(async (e) => {
                                console.error("[AUTO_RETRY_ERR]", e);
                                // 🔴 Recovery: If startup fails, mark as FAILED immediately so user isn't stuck waiting for timeout
                                await saveLocalTrainingSource({ ...updatedSource, status: 'Failed', error: 'Auto-Retry Startup Failed' });
                                loadData(); // Force UI update
                            });
                        });

                        return {
                            sourceId: source.id, libraryId: libItem?.id, folderId: libItem?.folderId || null,
                            fingerprint: source.fileHash, fileName: source.fileName, subject: source.subject,
                            globalStatus: 'Training', localStatus: 'Processing',
                            progress: chunks.length > 0 ? Math.round((completed / chunks.length) * 100) : source.progress,
                            chunkStats: { total: chunks.length, completed, failed: failed },
                            chunks, dataAvailable: !!source.data, atomCount: chunks.reduce((acc, c) => acc + (c.atomCount || 0), 0),
                            updatedAt: Date.now(), logs: source.logs || [],
                            eta: calculateETA(chunks),
                        } as TrainingSessionViewModel;
                    }

                    const progressPercent = chunks.length > 0 ? Math.round((completed / chunks.length) * 100) : source.progress;
                    const eta = effectiveStatus === 'Training' ? calculateETA(chunks) : undefined;
                    const isFailed = failed > 0 || isStalled;

                    return {
                        sourceId: source.id, libraryId: libItem?.id, folderId: libItem?.folderId || null,
                        fingerprint: source.fileHash, fileName: source.fileName, subject: source.subject,
                        // 🟢 FIX: localStatus should only be 'Processing' if we are genuinely training and NOT stalled.
                        // Previously this was inverted (isFailed ? 'Processing'...), causing the UI to lock up on failure.
                        localStatus: source.data ? (effectiveStatus === 'Training' ? 'Processing' : 'Ready') : 'MissingBinary',
                        progress: progressPercent,
                        chunkStats: { total: chunks.length, completed, failed: failed + (isStalled ? 1 : 0) },
                        chunks, dataAvailable: !!source.data, atomCount: chunks.reduce((acc, c) => acc + (c.atomCount || 0), 0),
                        updatedAt: source.updatedAt || Date.now(), logs: source.logs || [],
                        eta
                    } as TrainingSessionViewModel;
                } catch (e: any) {
                    console.error(`[LIB_DATA_ERR] Failed mapping source ${source.fileName}:`, e.message);
                    return null;
                }
            }));

            const finalModels = models.filter(m => m !== null).sort((a, b) => b!.updatedAt - a!.updatedAt) as TrainingSessionViewModel[];
            console.log(`[LIB_DATA] Load Summary: Sources=${sData.length}, LibItems=${lData.length}, Folders=${fData.length}, ViewModels=${finalModels.length}`);
            setViewModels(finalModels);
        } catch (e) { console.error("[LIB_LOAD_ERR]", e); }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files; if (!files?.length) return;
        setIsUploading(true);
        console.log(`[LIB_UPLOAD] Initiating upload for ${files.length} file(s). Target Folder: ${currentFolderId || 'ROOT'}`);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`[LIB_UPLOAD] Processing file ${i + 1}/${files.length}: ${file.name} (${Math.round(file.size / 1024)} KB)`);
                const fingerprint = await computeDocFingerprint(file);
                console.log(`[LIB_UPLOAD] Fingerprint for ${file.name}: ${fingerprint.substring(0, 10)}...`);

                const reader = new FileReader();
                const base64 = await new Promise<string>(r => {
                    reader.onload = () => r(reader.result as string);
                    reader.readAsDataURL(file);
                });

                const existingSource = sources.find(s => s.fileHash === fingerprint);
                if (!existingSource) {
                    console.log(`[LIB_UPLOAD] Creating new TrainingSource for ${file.name}`);
                    await saveLocalTrainingSource({
                        id: `src_${Date.now()}_${i}`,
                        studentId: user.id,
                        fileHash: fingerprint,
                        fileName: file.name,
                        status: 'Pending',
                        progress: 0,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        data: base64,
                        subject: selectedSubject,
                        educationSystem: user.preferences.defaultCurriculum,
                        grade: user.preferences.defaultYear
                    });
                } else {
                    console.log(`[LIB_UPLOAD] Reusing existing TrainingSource for fingerprint ${fingerprint.substring(0, 8)}`);
                    // FIX: If the source's subject doesn't match current view, update it
                    if (existingSource.subject !== selectedSubject) {
                        console.log(`[LIB_UPLOAD] Updating subject: "${existingSource.subject}" -> "${selectedSubject}"`);
                        await saveLocalTrainingSource({ ...existingSource, subject: selectedSubject, updatedAt: Date.now() });
                    }
                }

                const existingLibItem = libraryItems.find(li => li.contentId === fingerprint);
                if (!existingLibItem) {
                    console.log(`[LIB_UPLOAD] Adding ${file.name} to Library registry. Folder: ${currentFolderId || 'NONE'}`);
                    await saveToLibrary({
                        id: `lib_${Date.now()}_${i}`,
                        name: file.name,
                        contentId: fingerprint,
                        userId: user.id,
                        type: 'file',
                        timestamp: Date.now(),
                        folderId: currentFolderId
                    });
                } else {
                    console.log(`[LIB_UPLOAD] Document already in Library (ID: ${existingLibItem.id}). Moving to current folder.`);
                    if (existingLibItem.folderId !== currentFolderId) {
                        await saveToLibrary({ ...existingLibItem, folderId: currentFolderId });
                    }
                }
            }
            console.log(`[LIB_UPLOAD] Batch upload complete.`);
            loadData();
        } catch (err: any) {
            console.error(`[LIB_UPLOAD] Critical Failure:`, err);
        } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const confirmFolderCreation = async (name: string) => {
        setIsCreateFolderOpen(false);
        const parent = currentFolderId || `${SUBJECT_ROOT_PREFIX}${selectedSubject}`;
        await createFolder({ id: `fld_${Date.now()}`, name, parentId: parent, userId: user.id, timestamp: Date.now() });
        loadData();
    };

    // State for Ingestion Mode (Per-session or Global)
    const [smartModeEnabled, setSmartModeEnabled] = useState<boolean>(false);

    const handleTrain = async (vm: TrainingSessionViewModel) => {
        // Logic: If already training or complete, just open modal
        const isTraining = vm.globalStatus === 'Training' || vm.localStatus === 'Processing';
        const isComplete = vm.globalStatus === 'Completed' || (vm.progress === 100 && vm.globalStatus !== 'Failed');

        if (isTraining || isComplete) {
            props.onShowExtractionProgress(vm.fingerprint);
            console.log(`[UI_TRACE] Modal opened for ${isTraining ? 'active' : 'completed'} session: ${vm.fileName}`);
            return;
        }

        // v1.3: Show progress modal via global handler
        props.onShowExtractionProgress(vm.fingerprint);

        const source = sources.find(s => s.fileHash === vm.fingerprint);
        if (!source) return;

        // Determine Mode based on Toggle
        const extractionMode = smartModeEnabled ? ExtractionMode.CURRICULUM : ExtractionMode.PAGE;

        // Status is already set to 'Training' before this function is called
        // Do NOT update it here - hydration will set it to 'Completed' if applicable
        loadData();
        console.log(`[UI_TRACE] Starting Ingestion in mode: ${extractionMode} for ${source.fileName}`);

        try {
            await runIngestion({
                documentId: source.fileHash,
                subject: vm.subject,
                language: appLanguage,
                extractionMode: extractionMode,
                studentProfileId: user.id,
                mode: source.status === 'Pending' ? IngestionMode.FRESH : IngestionMode.RESUME,
                dryRun: false
            });

            // v1.3: Verify 100% completion before incrementing quota
            // We check the ledger to be absolutely sure this document is DONE.
            const idb = await getDB();
            const ledger = await idb.get('ingestion_ledgers', source.fileHash);

            if (ledger?.status === 'COMPLETED') {
                console.log(`[UI_TRACE] Ingestion Request Completed Successfully (100%).`);
                console.log(`[LIB_MONETIZATION] Training successful. Incrementing trainedMaterialUsed by 1...`);
                await monetizationClient.incrementUsage('trainedMaterialUsed', 1);
                console.log(`[LIB_MONETIZATION] Usage incremented. Refreshing local quota...`);
                checkQuota(true); // Refresh quota client-side
            } else {
                console.warn(`[UI_TRACE] Ingestion returned, but ledger status is: ${ledger?.status}. Skipping quota increment.`);
            }
        } catch (e: any) {
            console.error("[INGESTION] Failed:", e);
            console.log(`[UI_TRACE] Ingestion Failed: ${e.message || "Unknown error"}`);
            // Note: Quota NOT incremented here because we crashed/threw.
        } finally {
            loadData();
            // Modal stays open to show final state
        }
    };

    const handleRetryChunk = async (chunk: ChunkState, vm: TrainingSessionViewModel) => {
        const idb = await getDB(); await idb.put('chunks', { ...chunk, status: 'PENDING' as const, error: undefined }); handleTrain(vm);
    };

    const handleDelete = async (vm: TrainingSessionViewModel) => {
        try {
            console.log(`[LIB_DEBUG] Executing direct purge for: ${vm.fileName}`);

            // 0. Safety: Stop any active ingestion for this document
            cancelIngestion(vm.fingerprint);

            // Optimistic UI hide
            setViewModels(prev => prev.filter(v => v.sourceId !== vm.sourceId));

            // 1. Database Purge (Cloud and Local Metadata)
            await Promise.allSettled([
                deleteLocalTrainingSource(vm.sourceId),
                deleteLocalAtomsByContent(vm.fingerprint),
                vm.libraryId ? deleteFromLibrary(vm.libraryId) : Promise.resolve()
            ]);

            // 2. Chunks Purge (Local IndexedDB)
            const idb = await getDB();
            const chunks = await idb.getAllFromIndex('chunks', 'by_doc', vm.fingerprint);
            const tx = idb.transaction('chunks', 'readwrite');
            for (const c of chunks) await tx.store.delete(c.id);
            await tx.done;

            console.log(`[LIB_DEBUG] Purge sequence complete for ${vm.fileName}`);
            loadData();
        } catch (e: any) {
            console.error("[LIB_DEBUG] Deletion Fault:", e);
            loadData();
        }
    };

    const handleUpdateSubject = async (sourceId: string, newSubject: string) => {
        const source = sources.find(s => s.id === sourceId);
        if (source) { await saveLocalTrainingSource({ ...source, subject: newSubject, updatedAt: Date.now() }); loadData(); }
    };

    const visibleFolders = folders.filter(f => {
        if (filterMode !== 'SUBJECT') return false;
        return currentFolderId ? f.parentId === currentFolderId : f.parentId === `${SUBJECT_ROOT_PREFIX}${selectedSubject}`;
    });

    const visibleFiles = viewModels.filter(vm => {
        // A file is effectively "Trained" if it is marked Completed OR if it reached 100% progress without error.
        const isEffectivelyComplete = vm.globalStatus === 'Completed' || (vm.progress === 100 && vm.globalStatus !== 'Failed');

        if (filterMode === 'ALL_TRAINED') return isEffectivelyComplete;
        if (filterMode === 'ALL_PENDING') return !isEffectivelyComplete;

        // Folder logic: 
        // If currentFolderId exists, match strictly.
        // If it's NULL (root), show files with NO folderId AND matching subject.
        const matchesFolder = currentFolderId ? vm.folderId === currentFolderId : (!vm.folderId && vm.subject === selectedSubject);

        // Debug Log (Optional but helpful for the reported issue)
        if (!matchesFolder && vm.folderId && filterMode === 'SUBJECT' && !currentFolderId) {
            // This item is in A folder, but we are at the SUBJECT root. Correct behavior is to hide it.
        }

        return matchesFolder;
    });

    // Detect files orphaned by subject rename: subjects not in user's profile
    const orphanedBySubject = useMemo(() => {
        const knownSubjects = new Set(subjects);
        const orphanMap = new Map<string, typeof viewModels>();
        for (const vm of viewModels) {
            if (!knownSubjects.has(vm.subject)) {
                if (!orphanMap.has(vm.subject)) orphanMap.set(vm.subject, []);
                orphanMap.get(vm.subject)!.push(vm);
            }
        }
        return orphanMap;
    }, [viewModels, subjects]);

    const handleMigrateOrphans = async (oldSubject: string) => {
        const items = orphanedBySubject.get(oldSubject) || [];
        for (const vm of items) {
            await handleUpdateSubject(vm.sourceId, selectedSubject);
        }
        loadData();
    };

    const getViewTitle = () => {
        if (filterMode === 'ALL_TRAINED') return 'All Trained Documents';
        if (filterMode === 'ALL_PENDING') return 'Pending / Untrained';
        return selectedSubject;
    };

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] mt-2 bg-slate-50 dark:bg-slate-950 overflow-hidden rounded-2xl border border-slate-200 shadow-sm relative">
            <CreateFolderModal isOpen={isCreateFolderOpen} onClose={() => setIsCreateFolderOpen(false)} onCreate={confirmFolderCreation} t={t} />
            {viewingLogs && (
                <ErrorBoundary fallback={null}>
                    <HackingLogOverlay logs={viewingLogs.logs} onClose={() => setViewingLogs(null)} t={t} fileName={viewingLogs.fileName} />
                </ErrorBoundary>
            )}
            {/* Compact Header */}
            <div className="h-12 bg-white dark:bg-slate-900 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-20">
                <div className="flex items-center gap-3"><Button variant="outline" onClick={onBack} className="w-7 h-7 rounded-full p-0 flex items-center justify-center">{appLanguage === Language.ARABIC ? '→' : '←'}</Button><h1 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">⚡ {t.library.controlPlane}</h1></div>
                <div className="flex items-center gap-2">
                    {/* Smart Mode Toggle */}
                    {/*
                    <button
                        onClick={() => setSmartModeEnabled(!smartModeEnabled)}
                        className={`h-7 px-3 rounded text-[10px] font-bold uppercase transition-colors border ${smartModeEnabled ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                    >
                        {smartModeEnabled ? '🧠 Smart Mode' : '📄 Page Mode'}
                    </button>
                    */}
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>

                    <Button onClick={() => setIsCreateFolderOpen(true)} className="text-[10px] px-3 h-7 bg-amber-400 text-slate-900 font-bold">{t.library.newFolder}</Button><Button onClick={() => fileInputRef.current?.click()} isLoading={isUploading} className="bg-indigo-600 text-white text-[10px] font-black uppercase px-4 h-7">{t.library.upload}</Button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" multiple accept=".pdf" />
            </div>
            <div className="flex flex-1 overflow-hidden">
                <div className="w-32 sm:w-48 md:w-56 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto custom-scrollbar p-2">

                    {/* Compact Sidebar Items */}
                    <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1 px-2 mt-1">{t.library.globalView}</h3>
                    <div className="mb-3 space-y-0.5">
                        <button onClick={() => { setFilterMode('ALL_TRAINED'); setFolderPath([]); setCurrentFolderId(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${filterMode === 'ALL_TRAINED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'}`}>
                            <span>🏆</span> {t.library.allDocs}
                        </button>
                        <button onClick={() => { setFilterMode('ALL_PENDING'); setFolderPath([]); setCurrentFolderId(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${filterMode === 'ALL_PENDING' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'}`}>
                            <span>⏳</span> {t.library.pending}
                        </button>
                    </div>

                    <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1 px-2">{t.library.profileMatrix}</h3>
                    <div className="border border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl p-1 space-y-0.5">
                        {subjects.map(sub => (
                            <button key={sub} onClick={() => { setFilterMode('SUBJECT'); setSelectedSubject(sub); setFolderPath([]); setCurrentFolderId(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${filterMode === 'SUBJECT' && selectedSubject === sub ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'}`}>
                                {sub}
                            </button>
                        ))}
                    </div>

                </div>
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="h-9 flex items-center px-4 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                        <button onClick={() => { setFolderPath([]); setCurrentFolderId(null); }} className={`text-[10px] font-bold flex items-center gap-1 ${folderPath.length === 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}><Folder size={12} /> {getViewTitle()}</button>
                        {folderPath.map((f, i) => <React.Fragment key={f.id}><span className="mx-1 text-slate-300 dark:text-slate-600">/</span><button onClick={() => { setFolderPath(folderPath.slice(0, i + 1)); setCurrentFolderId(f.id); }} className={`text-[10px] font-bold ${i === folderPath.length - 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{f.name}</button></React.Fragment>)}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 md:p-4 custom-scrollbar relative">
                        {/* Orphan Recovery Banner */}
                        {filterMode === 'SUBJECT' && !currentFolderId && Array.from(orphanedBySubject.entries()).map(([oldSubject, files]) => (
                            <div key={oldSubject} className="mb-3 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-3">
                                <span className="text-lg shrink-0">⚠️</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">Orphaned Files Found</p>
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                                        <strong>{files.length} file{files.length !== 1 ? 's' : ''}</strong> from old subject <strong>"{oldSubject}"</strong> are hidden.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleMigrateOrphans(oldSubject)}
                                    className="shrink-0 text-[10px] font-black uppercase px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
                                >
                                    Move All → {selectedSubject}
                                </button>
                            </div>
                        ))}
                        {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-50 scale-75"><Folder className="w-16 h-16 text-amber-300 mb-6" /><h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">{t.library.noDocs}</h3></div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {visibleFolders.map(folder => (
                                    <div key={folder.id} onClick={() => { setCurrentFolderId(folder.id); setFolderPath([...folderPath, { id: folder.id, name: folder.name }]); }} className="bg-white dark:bg-slate-800 p-2.5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all cursor-pointer flex items-center gap-3">
                                        <div className="w-8 h-8 bg-amber-50 text-amber-500 rounded-lg flex items-center justify-center"><Folder fill="currentColor" size={16} /></div>
                                        <div className="min-w-0 flex-grow"><h3 className="font-bold text-slate-800 dark:text-white text-xs truncate">{folder.name}</h3><p className="text-[9px] text-slate-400 uppercase font-black">{t.library.folder}</p></div>
                                        <div className="ml-auto flex gap-1"><button onClick={(e) => {
                                            e.stopPropagation();
                                            const n = window.prompt("Rename:", folder.name);
                                            if (n && n !== folder.name) {
                                                console.log(`[LIB_DEBUG] User renaming folder ${folder.id} to "${n}"`);
                                                renameFolder(folder.id, n).then(() => {
                                                    // Also update breadcrumb name if we renamed a folder in our current path
                                                    setFolderPath(prev => prev.map(p => p.id === folder.id ? { ...p, name: n } : p));
                                                    loadData();
                                                });
                                            }
                                        }} className="p-1.5 text-slate-300 hover:text-indigo-500"><Edit2 size={12} /></button><button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete folder "${folder.name}"?`)) { console.log(`[LIB_DEBUG] User deleting folder ${folder.id}`); deleteFolder(folder.id).then(() => loadData()); } }} className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 size={12} /></button></div>
                                    </div>
                                ))}
                                {visibleFiles.length > 0 && <FileListHeader t={t} />}
                                {visibleFiles.map(vm => (
                                    <DocumentRow
                                        key={vm.sourceId}
                                        vm={vm}
                                        availableSubjects={subjects}
                                        onTrain={() => handleTrain(vm)}
                                        onDelete={() => handleDelete(vm)}
                                        onUpdateSubject={(n) => handleUpdateSubject(vm.sourceId, n)}
                                        onShowLogs={(logs) => setViewingLogs({ id: vm.sourceId, logs, fileName: vm.fileName })}
                                        onRetryChunk={(c) => handleRetryChunk(c, vm)}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Log Viewer Overlay */}
            {viewingLogs && (
                <HackingLogOverlay
                    logs={viewingLogs.logs}
                    fileName={viewingLogs.fileName}
                    onClose={() => setViewingLogs(null)}
                    t={t}
                />
            )}

            {/* Paywall Modal */}
            <PaywallModal
                isOpen={isPaywallOpen}
                onClose={() => setIsPaywallOpen(false)}
                reason={paywallReason}
                currentPlanId={user.plan?.id}
                details={paywallDetails}
            />
        </div>
    );
}
