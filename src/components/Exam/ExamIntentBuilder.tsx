import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfile, LocalTrainingSource, ExamMode, ExamBlueprint, ExamIntent } from '../../types';
import { normalizeSubjectName } from '../../utils/subjectUtils';
import { generateBlueprint } from '../../services/ai/examService';
import { getLocalTrainingSources, getLocalAtoms } from '../../services/storageService';
import Card from '../ui/Card';
import Button from '../ui/Button';
import GeneratorHeader from '../ui/GeneratorHeader';
import { ingestEvent } from '../../services/lis/telemetryIngestion';
import { TRANSLATIONS } from '../../i18n';


interface ExamIntentBuilderProps {
    onBlueprintGenerated: (blueprint: ExamBlueprint) => void;
    onCancel: () => void;
    user?: UserProfile;
}

const INTENT_OPTIONS: { id: ExamIntent; label: string; color: string }[] = [
    { id: 'CORE_KNOWLEDGE', label: 'Core', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { id: 'APPLICATION', label: 'Apply', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { id: 'EXPERIMENTAL_METHODOLOGY', label: 'Experiment', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { id: 'DATA_INTERPRETATION', label: 'Data', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
];

const ExamIntentBuilder: React.FC<ExamIntentBuilderProps> = ({ onBlueprintGenerated, onCancel, user }) => {
    // Quota logic moved to QuotaGuard inside render

    // Data State
    const [selectedSubject, setSelectedSubject] = useState<string>(user?.preferences?.defaultSubject || '');
    const [scopeType, setScopeType] = useState<'FULL_SUBJECT' | 'SPECIFIC_FILE'>('FULL_SUBJECT');
    const [availableFiles, setAvailableFiles] = useState<LocalTrainingSource[]>([]);
    const [estimatedAtomCount, setEstimatedAtomCount] = useState<number | null>(null);

    // Multi-Select State
    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

    // Config State
    const [selectedIntents, setSelectedIntents] = useState<ExamIntent[]>(['CORE_KNOWLEDGE']);
    const [duration, setDuration] = useState(60);
    const [mode, setMode] = useState<ExamMode>('STANDARD');
    const [isGenerating, setIsGenerating] = useState(false);

    // Load files when subject changes
    useEffect(() => {
        if (selectedSubject && user?.id) {
            const fetchFiles = async () => {
                const all = await getLocalTrainingSources(user.id);
                // Robust Filtering (Mirrors AdaptiveQuizModuleV2)
                const normalizedSelected = normalizeSubjectName(selectedSubject);
                const filtered = all.filter(f => {
                    const normSourceSub = normalizeSubjectName(f.subject);
                    return normSourceSub === normalizedSelected && f.status === 'Completed';
                });

                // Sort by recency
                filtered.sort((a, b) => b.updatedAt - a.updatedAt);
                setAvailableFiles(filtered);
            };
            fetchFiles();
        } else {
            setAvailableFiles([]);
        }
    }, [selectedSubject, user?.id]);

    // Check Atom Availability
    useEffect(() => {
        if (!selectedSubject || !user?.id) {
            setEstimatedAtomCount(null);
            return;
        }

        const checkAvailability = async () => {
            // We can re-use getLocalAtoms logic but just get count
            // This is a rough check. For SPECIFIC_FILE we'd need more complex filtering but let's stick to subject level for now
            // as specific file implementation inside getLocalAtoms is tricky to decouple without re-fetching all.
            // Actually getLocalAtoms takes an optional sourceId which is fileId.

            try {
                if (scopeType === 'SPECIFIC_FILE' && selectedFileIds.length === 1) {
                    const atoms = await getLocalAtoms(user.id, selectedFileIds[0]);
                    setEstimatedAtomCount(atoms.length);
                } else if (scopeType === 'FULL_SUBJECT') {
                    // Fetch all for subject
                    // This is "heavy" but acceptable for "Intents" page load which happens once
                    const all = await getLocalAtoms(user.id);
                    const subjectAtoms = all.filter(a => a.core.metadata?.subject?.toLowerCase() === selectedSubject.toLowerCase());
                    setEstimatedAtomCount(subjectAtoms.length);
                } else {
                    // Multiple files or General -> Assume valid for now or sum up (too complex for lightweight check)
                    setEstimatedAtomCount(null);
                }
            } catch (e) {
                console.warn("Failed to estimate atoms", e);
                setEstimatedAtomCount(null);
            }
        };

        const timer = setTimeout(checkAvailability, 500); // Debounce
        return () => clearTimeout(timer);
    }, [selectedSubject, scopeType, selectedFileIds, user?.id]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Join multiple IDs with comma for MATERIAL type
            const sourceId = scopeType === 'FULL_SUBJECT' ? selectedSubject : selectedFileIds.join(',');
            const sourceType = scopeType === 'FULL_SUBJECT' ? 'SUBJECT' : 'MATERIAL';

            // Construct title based on selection
            let title = selectedSubject;
            if (scopeType === 'SPECIFIC_FILE') {
                if (selectedFileIds.length === 1) {
                    title = availableFiles.find(f => f.id === selectedFileIds[0])?.fileName || 'Material';
                } else {
                    title = `${selectedFileIds.length} Materials from ${selectedSubject} `;
                }
            }

            const blueprint = await generateBlueprint(
                { type: sourceType, id: sourceId, title },
                selectedIntents,
                { durationMinutes: duration, mode }
            );

            // ✅ TELEMETRY: Blueprint Created (Non-Charging)
            ingestEvent({
                id: crypto.randomUUID(),
                idempotencyKey: `exam_bp_${blueprint.id}`,
                studentId: user!.id, // Fix: Use id and operator check
                eventType: 'exam.blueprint_created',
                schemaVersion: '2.1.1',
                timestamp: new Date().toISOString(),
                timeContext: { durationSec: 0, mode: 'practice', attemptType: 'first' },
                payload: { blueprintId: blueprint.id, subject: selectedSubject }
            });

            onBlueprintGenerated(blueprint);
        } catch (e) {
            console.error("Blueprint Generation Failed", e);
            setIsGenerating(false);
        }
    };

    const toggleFileSelection = (id: string) => {
        if (selectedFileIds.includes(id)) {
            setSelectedFileIds(prev => prev.filter(fid => fid !== id));
        } else {
            setSelectedFileIds(prev => [...prev, id]);
        }
    };

    const toggleIntent = (intent: ExamIntent) => {
        if (selectedIntents.includes(intent)) {
            setSelectedIntents(prev => prev.filter(i => i !== intent));
        } else {
            setSelectedIntents(prev => [...prev, intent]);
        }
    };

    const sys = user?.preferences?.defaultCurriculum || 'Standard';
    const grade = user?.preferences?.defaultYear || '10';
    const subjects = user?.preferences?.subjects || [];

    // ... inside the component
    return (
        <div className="w-full max-w-3xl mx-auto animate-fade-in flex flex-col min-h-[calc(100vh-4rem)]">
            <GeneratorHeader
                title="Exam Generator"
                onBack={onCancel}
                onExit={onCancel}
            />

            <div className="px-4 flex flex-col gap-6">
                {/* Header (Compact) */}


                {/* Main Stack */}
                <div className="grid gap-5">

                    {/* STEP 1: Subject (Full Width) */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">1</div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Select Subject</label>
                        </div>
                        <div className="relative">
                            <select
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none font-bold text-lg text-slate-800 dark:text-slate-200 appearance-none bg-white dark:bg-slate-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
                            >
                                <option value="" disabled>Choose a subject...</option>
                                {subjects.map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))}
                                <option value="General">Custom Subject</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                        </div>
                    </div>

                    {/* STEP 2: Scope (Full Width, 2 Cards) */}
                    {selectedSubject && (
                        <div className="space-y-1 animate-fade-in">
                            <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">2</div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Output Scope</label>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setScopeType('FULL_SUBJECT')}
                                    className={`flex-1 p-3.5 sm:p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${scopeType === 'FULL_SUBJECT' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 shadow-sm' : 'border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-slate-50 dark:hover:bg-slate-800'} `}
                                >
                                    <span className="text-xl sm:text-2xl">📚</span>
                                    <div className="text-left leading-tight">
                                        <div className="font-black text-xs sm:text-sm uppercase tracking-wide">Full Curriculum</div>
                                        <div className="text-[9px] sm:text-[10px] opacity-70 font-semibold uppercase tracking-tighter">Comprehensive Coverage</div>
                                    </div>
                                    {scopeType === 'FULL_SUBJECT' && <div className="ml-auto text-indigo-600 text-lg">✓</div>}
                                </button>
                                <button
                                    onClick={() => setScopeType('SPECIFIC_FILE')}
                                    className={`flex-1 p-3.5 sm:p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${scopeType === 'SPECIFIC_FILE' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 shadow-sm' : 'border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-slate-50 dark:hover:bg-slate-800'} `}
                                >
                                    <span className="text-xl sm:text-2xl">📄</span>
                                    <div className="text-left leading-tight">
                                        <div className="font-black text-xs sm:text-sm uppercase tracking-wide">Specific Material</div>
                                        <div className="text-[9px] sm:text-[10px] opacity-70 font-semibold uppercase tracking-tighter">Focused Drill</div>
                                    </div>
                                    {scopeType === 'SPECIFIC_FILE' && <div className="ml-auto text-indigo-600 text-lg">✓</div>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: File Selector (Conditional Multi-Select) */}
                    {selectedSubject && scopeType === 'SPECIFIC_FILE' && (
                        <div className="animate-fade-in text-left">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">3</div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Select Material</label>
                            </div>

                            {availableFiles.length === 0 ? (
                                <div className="p-4 text-center bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                                    <p className="text-slate-500 font-bold text-xs">No trained files found for {selectedSubject}.</p>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 max-h-[160px] overflow-y-auto p-2 custom-scrollbar">
                                    {availableFiles.map(file => {
                                        const isSelected = selectedFileIds.includes(file.id);
                                        return (
                                            <div
                                                key={file.id}
                                                onClick={() => toggleFileSelection(file.id)}
                                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'} `}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'} `}>
                                                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-bold break-words leading-tight ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'} `}>{file.fileName}</div>
                                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Updated: {new Date(file.updatedAt).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CONFIGURATION ROW */}
                    <div className="pt-4 border-t border-slate-100 mt-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-3 tracking-wider">Exam Mode</label>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {[
                                {
                                    id: 'STANDARD',
                                    label: 'Standard',
                                    desc: 'Balanced based on study materials.',
                                    color: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                                    icon: '🟢'
                                },
                                {
                                    id: 'PRACTICE',
                                    label: 'Practice',
                                    desc: 'Focus on weak areas & gaps.',
                                    color: 'bg-blue-50 text-blue-700 ring-blue-200',
                                    icon: '🔵'
                                },
                                {
                                    id: 'CHALLENGE',
                                    label: 'Challenge',
                                    desc: 'High difficulty mastery check.',
                                    color: 'bg-red-50 text-red-700 ring-red-200',
                                    icon: '🔴'
                                },
                                {
                                    id: 'ADAPTIVE',
                                    label: 'Adaptive',
                                    desc: 'Smart AI-guided progression.',
                                    color: 'bg-purple-50 text-purple-700 ring-purple-200',
                                    icon: '🟣'
                                }
                            ].map((opt) => {
                                const isSelected = mode === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => setMode(opt.id as ExamMode)}
                                        className={`
                                                    relative p-3 rounded-xl border-2 text-left transition-all
                                                    ${isSelected
                                                ? `border-transparent ring-2 ${opt.color} shadow-sm bg-opacity-20 dark:bg-opacity-10`
                                                : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                            }
`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-lg mt-[-2px]">{opt.icon}</span>
                                            <div>
                                                <div className={`text-xs font-black uppercase tracking-wide ${isSelected ? 'opacity-100' : 'text-slate-700 dark:text-slate-300'} `}>
                                                    {opt.label}
                                                </div>
                                                <div className={`text-[10px] font-medium leading-tight mt-0.5 ${isSelected ? 'opacity-80' : 'text-slate-400 dark:text-slate-500'} `}>
                                                    {opt.desc}
                                                </div>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 text-current text-xs font-bold">✓</div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {/* Intent */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Strategy</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {INTENT_OPTIONS.map(opt => {
                                        const isActive = selectedIntents.includes(opt.id);
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => toggleIntent(opt.id)}
                                                className={`py-2.5 px-1 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${isActive ? opt.color + ' bg-opacity-20 dark:bg-opacity-10' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 opacity-60'} `}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Duration */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Duration</label>
                                <div className="flex gap-1.5">
                                    {[15, 30, 45, 60].map(mins => (
                                        <button
                                            key={mins}
                                            onClick={() => setDuration(mins)}
                                            className={`
                                                flex-1 py-2.5 rounded-xl text-[10px] font-black border transition-all
                                                ${duration === mins
                                                    ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200 shadow-md transform scale-[1.02]'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                                }
                                            `}
                                        >
                                            {mins}m
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-col sm:flex-row gap-3 mt-8 pb-10 sm:pb-0">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="flex-1 py-4 text-slate-400 hover:text-slate-600 font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl order-2 sm:order-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerate}
                        isLoading={isGenerating}
                        disabled={isGenerating || estimatedAtomCount === 0}
                        className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-indigo-500/30 active:scale-95 transition-all rounded-2xl order-1 sm:order-2"
                    >
                        {isGenerating ? 'Synthesizing...' : 'Generate Exam'}
                    </Button>
                </div>
                {/* Quota Exceeded Modal removal moved to QuotaGuard */}

                {/* Availability Warning */}
                {estimatedAtomCount !== null && estimatedAtomCount === 0 && (
                    <div className="absolute bottom-20 left-6 right-6 bg-blue-50 border border-blue-200 text-blue-600 p-3 rounded-lg text-xs font-bold text-center animate-fade-in">
                        ☁️ No local notes found. Will attempt to download from Cloud during generation.
                    </div>
                )}
                {estimatedAtomCount !== null && estimatedAtomCount > 0 && estimatedAtomCount < 10 && (
                    <div className="text-center text-[10px] text-amber-500 font-bold mt-[-10px]">
                        ⚠️ Low content ({estimatedAtomCount} atoms). Exam may differ from blueprint.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExamIntentBuilder;
