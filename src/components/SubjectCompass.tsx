
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    UserProfile, Language, SubjectCompassData,
    CompassAction, FileCoverage, AtomCoverage, GenerationRequest, QuizType, Difficulty, DetailLevel
} from '../types';
import { buildSubjectCompassData } from '../services/compassService'; // DEPRECATED: Keep for fallback
import { useCompassSnapshot } from '../hooks/useCompassSnapshot'; // ✅ LIS
import Card from './ui/Card';
import Button from './ui/Button';
import { logger } from '../utils/logger';
import { useDashboard } from './dashboard/context/DashboardContext';
import { ingestEvent } from '../services/lis/telemetryIngestion'; // ✅ LIS
import { TRANSLATIONS } from '../i18n';
import NodeTree from './compass/NodeTree';


interface SubjectCompassProps {
    user: UserProfile;
    appLanguage: Language;
    subject: string;
    onBack: () => void;
    onSubmit: (req: GenerationRequest) => void;
}

const MasteryBadge = ({ level }: { level: AtomCoverage['masteryLevel'] }) => {
    const colors = {
        STRONG: 'bg-emerald-500',
        PARTIAL: 'bg-amber-500',
        WEAK: 'bg-rose-500',
        UNKNOWN: 'bg-slate-200 dark:bg-slate-700'
    };
    return <div className={`w-2 h-2 rounded-full ${colors[level]} shadow-sm shrink-0`}></div>;
};

const StatCard = ({ icon, label, value, colorClass, isLoading, subtext }: { icon: string, label: string, value: string, colorClass: string, isLoading?: boolean, subtext?: string }) => (
    <Card className="p-3 md:p-4 flex items-center gap-3 md:gap-4 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl ${isLoading ? 'bg-slate-100 animate-pulse' : colorClass}`}>
            {isLoading ? '' : icon}
        </div>
        <div className="flex-grow">
            <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
            {isLoading ? (
                <div className="h-4 w-12 bg-slate-100 animate-pulse rounded"></div>
            ) : (
                <p className="text-sm md:text-lg font-black text-slate-800 dark:text-white leading-none">{value}</p>
            )}
            {subtext && <p className="text-[8px] font-bold text-slate-400 mt-1">{subtext}</p>}
        </div>
    </Card>
);

const FileSkeleton = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-4 flex-grow">
            <div className="w-5 h-5 bg-slate-100 rounded"></div>
            <div className="w-1/4 h-4 bg-slate-100 rounded"></div>
            <div className="flex-grow h-1.5 bg-slate-100 rounded-full mx-4"></div>
            <div className="w-10 h-3 bg-slate-100 rounded"></div>
        </div>
    </div>
);

const SubjectCompass: React.FC<SubjectCompassProps> = ({ user, appLanguage, subject, onBack, onSubmit }) => {
    // 🚩 FEATURE FLAG: Toggle LIS snapshot vs old buildSubjectCompassData
    const USE_LIS_SNAPSHOTS = true; // Set to false to rollback

    const { state: dashboardState, dispatch } = useDashboard();
    const t: any = TRANSLATIONS[appLanguage];
    const isArabic = appLanguage === Language.ARABIC;
    const [data, setData] = useState<SubjectCompassData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
    const [noWeaknessFound, setNoWeaknessFound] = useState(false);
    const [showNoMaterialsAlert, setShowNoMaterialsAlert] = useState(false);

    const isMounted = useRef(true);
    const syncCounter = useRef(0);

    // ✅ LIS: Fetch precomputed snapshot
    const {
        data: lisSnapshot,
        loading: lisLoading,
        error: lisError
    } = useCompassSnapshot(user.id, subject);

    useEffect(() => {
        isMounted.current = true;
        logger.orchestrator(`[UI_LIFECYCLE] SubjectCompass Mounted for ${subject}`);

        const load = async () => {
            const currentSync = ++syncCounter.current;
            setLoading(true);
            setIsSyncing(true);
            setError(null);

            try {
                logger.orchestrator(`[COMPASS_SYNC] Starting Task [${currentSync}] | Subject: ${subject}`);
                const compassData = await buildSubjectCompassData(subject, user.id, dashboardState.state);

                if (isMounted.current && currentSync === syncCounter.current) {
                    console.log(`[COMPASS_DEBUG] 🔄 Sync Complete. Total Materials: ${compassData.materials.length}`);
                    compassData.materials.forEach((m, idx) => {
                        console.log(`[COMPASS_DEBUG] 📂 Material [${idx}]: ${m.materialName} (${m.materialId}) | Atoms: ${m.atoms.length} | Status: ${m.status}`);
                    });

                    // 🛡️ DEFENSIVE: Deduplicate Atoms per File (Client-Side Protection)
                    // This protects the UI from showing duplicate concepts even if DB has them.
                    if (compassData.materials) {
                        compassData.materials.forEach(f => {
                            const seen = new Set<string>();
                            const originalCount = f.atoms.length;
                            f.atoms = f.atoms.filter(a => {
                                // Normalize key: title + subject (grade is usually consistent per file)
                                const key = `${a.conceptTag?.trim().toLowerCase()}|${subject?.trim().toLowerCase()}`;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            if (f.atoms.length < originalCount) {
                                logger.orchestrator(`[COMPASS_DEFENSE] Cleaned ${originalCount - f.atoms.length} duplicates in ${f.materialName}`);
                            }
                        });
                    }

                    setData(compassData);

                    // Show alert if no materials detected
                    if (compassData.materials.length === 0) {
                        console.warn(`[COMPASS_DEBUG] ⚠️ No materials found for subject: ${subject}`);
                        setShowNoMaterialsAlert(true);
                    }

                    setIsSyncing(false);
                    setLoading(false);
                }
            } catch (e: any) {
                if (isMounted.current && currentSync === syncCounter.current) {
                    console.error(`[COMPASS_DEBUG] ❌ Pipeline Fault:`, e);
                    logger.error('STATE', `[COMPASS_PIPELINE_FAULT] Task [${currentSync}] failed.`, e);
                    setError(e.message || "Failed to aggregate subject data.");
                    setIsSyncing(false);
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            logger.orchestrator(`[UI_LIFECYCLE] SubjectCompass Unmounted.`);
            isMounted.current = false;
        };
    }, [subject, user.id, dashboardState.state]);

    // ✅ LIS MERGE: Overlay static material structure (from data) with dynamic learning status (from lisSnapshot)
    const displayFiles = useMemo(() => {
        if (!data) return [];
        console.log(`[COMPASS_DEBUG] 🧬 Merging Data: Using LIS Snapshot? ${USE_LIS_SNAPSHOTS}`);

        if (!USE_LIS_SNAPSHOTS || !lisSnapshot || !lisSnapshot.materials) {
            console.log(`[COMPASS_DEBUG] ⏩ Skipping Merge (Using Raw Data). Reason: LIS=${USE_LIS_SNAPSHOTS}, HasSnap=${!!lisSnapshot}`);
            return data.materials;
        }

        // ✅ UI RESILIENCE FIX: DETECT PARTIAL SNAPSHOT
        // If snapshot exists but has NO signals (meaning Strategies found nothing actionable or process is partial),
        // we should prefer the LIVE computed stats from 'data' to ensure the UI doesn't show "0%" erroneously.
        // This decouples "Strategy Signals" from "Learning Stats".
        const liveAtomsCount = data.materials.flatMap(m => m.atoms).length;
        const isPartialSnapshot = (!lisSnapshot.radarSignals || lisSnapshot.radarSignals.length === 0) && liveAtomsCount > 0;

        if (isPartialSnapshot) {
            console.log('[COMPASS_UI] Partial snapshot detected – using live signals for stats (Optimistic UI)');
            // Return original file (live computed by compassService)
            // This ensures we show the real-time coverage/mastery even if Strategy Engine is quiet.
            return data.materials;
        }

        console.log(`[COMPASS_DEBUG] 🧩 Starting Merge of ${data.materials.length} local files with ${lisSnapshot.materials.length} LIS records.`);

        return data.materials.map(file => {
            // 1. Try to find authoritative snapshot record for this file
            const lisFile = lisSnapshot.materials.find(f => {
                const lisId = f.materialId?.trim();
                const localId = file.materialId?.trim();
                return lisId === localId || lisId.startsWith(localId) || localId.startsWith(lisId);
            });

            // 2. Fallback check by name
            const resolvedLisFile = lisFile || lisSnapshot.materials.find(f => f.materialName === file.materialName);

            // 3. DECISION: Use Snapshot OR Live Signals?
            // If checking snapshot failed, we stick to 'file' which already has live signals from compassService
            if (!resolvedLisFile) {
                console.log(`[COMPASS_DEBUG] ⚪ ${file.materialName}: No Snapshot Record -> Using Live Signals (Fallback)`);
                // Return original file (already hydrated with signals by compassService)
                return file;
            }

            console.log(`[COMPASS_DEBUG] ✅ Matched: ${file.materialName} -> Overlaying Snapshot Data`);

            // 4. Merge Logic (Only if snapshot exists)
            const mergedAtoms = file.atoms.map(atom => {
                const lisAtom = resolvedLisFile.atoms.find(a => a.atomId === atom.atomId);
                // If atom exists in snapshot, prefer its stable metrics
                if (lisAtom) {
                    return { ...atom, masteryLevel: lisAtom.masteryLevel, masteryScore: lisAtom.mastery };
                }
                // If atom is missing from snapshot but exists locally, keep local state (don't force UNKNOWN)
                return atom;
            });

            // 5. Derive Stats Dynamic from Merged Atoms (Single Source of Truth)
            const totalAtoms = mergedAtoms.length;
            const atomsWithSignals = mergedAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
            const masteredAtoms = mergedAtoms.filter(a => a.masteryLevel === 'STRONG');

            // Recalculate Coverage (Touched / Total)
            const mergedCoveragePercent = totalAtoms > 0
                ? Math.round((atomsWithSignals.length / totalAtoms) * 100)
                : 0;

            // Recalculate Mastery (Avg Score of Touched)
            const scoreSum = atomsWithSignals.reduce((acc, a) => acc + (a.masteryScore || 0), 0);
            const mergedMasteryPercent = atomsWithSignals.length > 0
                ? Math.round(scoreSum / atomsWithSignals.length)
                : 0;

            console.log(`[COMPASS_DEBUG] 📊 ${file.materialName} Stats Re-calc: Cov=${mergedCoveragePercent}% (was ${resolvedLisFile.coveragePercent}%), Atoms=${atomsWithSignals.length}/${totalAtoms}`);

            return {
                ...file,
                atoms: mergedAtoms,
                coveragePercent: mergedCoveragePercent, // Always use live calculated coverage
                masteryPercent: mergedMasteryPercent,
            };
        });
    }, [data, lisSnapshot, USE_LIS_SNAPSHOTS]);

    // --- DERIVED METRICS (BREADTH VS DEPTH) ---
    // ✅ SINGLE SOURCE OF TRUTH: Calculated from `displayFiles` (which handles the Fallback logic)
    const { contentCoverage, learningProgress, unknownAtomIds, hasAnyAttempts } = useMemo(() => {
        if (!displayFiles || displayFiles.length === 0) {
            return { contentCoverage: 0, learningProgress: 0, unknownAtomIds: [], hasAnyAttempts: false };
        }

        const allAtoms = displayFiles.flatMap(f => f.atoms);
        const total = allAtoms.length;
        const touched = allAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
        const unknowns = allAtoms.filter(a => a.masteryLevel === 'UNKNOWN').map(a => a.atomId);

        // Coverage: Touched / Total
        const coverage = total > 0 ? Math.round((touched.length / total) * 100) : 0;

        // Progress: Avg score of touched
        const scoreSum = touched.reduce((acc, a) => acc + (a.masteryScore || 0), 0);
        const progress = touched.length > 0 ? Math.round(scoreSum / touched.length) : 0;

        return {
            contentCoverage: coverage,
            learningProgress: progress,
            unknownAtomIds: unknowns,
            hasAnyAttempts: touched.length > 0
        };
    }, [displayFiles]);

    const healthScore = USE_LIS_SNAPSHOTS ? (lisSnapshot?.healthScore ?? 0) : 0;
    const trendLabel = USE_LIS_SNAPSHOTS ? (lisSnapshot?.trendLabel ?? 'Steady') : 'Steady';

    // Check if materials exist for this subject
    const hasMaterials = data && data.materials && data.materials.length > 0;

    // Compatibility aliases for JSX
    const syllabusCoverage = contentCoverage;
    const masteryHealth = learningProgress;
    const oldUnknownIds = [];


    const handleLaunch = (action: CompassAction) => {
        const sourceData = displayFiles.length > 0 ? { ...data!, materials: displayFiles } : data;
        if (!sourceData) return;

        let targetAtomIds = action.atomIds || [];
        let targetTopic = action.label;

        // Default scope is SUBJECT unless specified
        const scope = action.scope || 'SUBJECT';
        const scopeId = action.scopeId || subject;

        // --- SPECIAL ACTION: EXPAND COVERAGE (Subject/File Scope) ---
        if (action.type === 'NEW' as any) { // Custom type for UI
            // For NEW mode (EXPLORATION phase): Use all available atoms
            // This is first-time learning, so we want to practice from available content

            if (scope === 'FILE' && action.atomIds && action.atomIds.length > 0) {
                // File-level: Use atoms passed from file button
                targetAtomIds = action.atomIds;
                targetTopic = action.label || `Start: ${scopeId}`;
                logger.orchestrator(`[COMPASS_NEW_FILE] Using ${targetAtomIds.length} atoms from file.`);
            } else {
                // Subject-level: Try to find unknown atoms first
                targetAtomIds = unknownAtomIds.slice(0, 10); // Batch of 10 new items

                // 🔥 CRITICAL FIX: If no UNKNOWN atoms (shouldn't happen in EXPLORATION phase),
                // derive from all available atoms
                if (targetAtomIds.length === 0) {
                    logger.orchestrator(`[COMPASS_EXPAND] No local unknown atoms, deriving from all atoms...`);

                    // Get all atoms from all materials
                    const allAtoms = data.materials.flatMap(f => f.atoms).map(a => a.atomId);
                    targetAtomIds = allAtoms.slice(0, 10);
                    logger.orchestrator(`[COMPASS_EXPAND] Derived ${targetAtomIds.length} atoms from all files.`);
                }

                targetTopic = `New Concepts: ${subject}`;
            }

            logger.orchestrator(`[COMPASS_EXPAND] Targeting ${targetAtomIds.length} new atoms.`);
        }

        // --- REPAIR LOGIC ---
        if (action.type === 'REPAIR') {
            if (targetAtomIds.length === 0) {
                // Priority 1: Cloud-verified weak items (includes < 80%)
                targetAtomIds = data.allWeakAtomIds || [];

                // Priority 2: Scan local structure for WEAK
                if (targetAtomIds.length === 0) {
                    targetAtomIds = data.materials.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'WEAK').map(a => a.atomId);
                }

                // Priority 3: Fallback to PARTIAL (Needs Focus)
                if (targetAtomIds.length === 0) {
                    targetAtomIds = data.materials.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'PARTIAL').map(a => a.atomId);
                }

                logger.orchestrator(`[COMPASS_FIX] Auto-detected ${targetAtomIds.length} problematic atoms for repair.`);
            }

            if (targetAtomIds.length === 0) {
                setNoWeaknessFound(true);
                return;
            }

            const representativeAtom = data.materials.flatMap(f => f.atoms).find(a => a.atomId === targetAtomIds[0]);
            const anchorTag = representativeAtom ? representativeAtom.conceptTag : "Targeted Concepts";
            targetTopic = `Repair: ${anchorTag} ${targetAtomIds.length > 1 ? '& others' : ''}`;
        }

        if (action.type === 'REVIEW') {
            if (targetAtomIds.length === 0) {
                const weakIds = data.allWeakAtomIds || [];
                if (weakIds.length > 0) {
                    targetAtomIds = weakIds;
                    targetTopic = `Review Weak Spots: ${subject}`;
                } else {
                    const partialIds = data.materials.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'PARTIAL').map(a => a.atomId);
                    if (partialIds.length > 0) {
                        targetAtomIds = partialIds;
                        targetTopic = `Review: Strengthen ${subject}`;
                    }
                }
            }
        }

        console.log(`[COMPASS_DEBUG] 🚀 LAUNCHING ACTION: ${action.type}`, {
            label: targetTopic,
            scope,
            scopeId,
            targetAtomCount: targetAtomIds.length,
            atomIds: targetAtomIds
        });

        logger.orchestrator(`[COMPASS_LAUNCH] Triggering ${action.type} Mission`, {
            label: targetTopic,
            atoms: targetAtomIds.length,
            scope: scope
        });

        // ✅ LIS: Ingest compass action event
        ingestEvent({
            eventType: 'compass_action_triggered',
            studentId: user.id,
            subjectId: subject,
            timestamp: new Date().toISOString(),
            metadata: {
                action: action.type,
                scope,
                scopeId,
                atomCount: targetAtomIds.length,
                label: targetTopic
            }
        } as any);


        // Use sourceData instead
        const primaryFile = sourceData.materials.find(f => f.atoms.some(a => targetAtomIds.includes(a.atomId))) || sourceData.materials[0];
        const isReview = action.type === 'REVIEW';
        const validFilesForReview = isReview ? sourceData.materials.map(f => f.materialId) : undefined;

        const req: GenerationRequest = {
            year: user.preferences.defaultYear,
            curriculum: user.preferences.defaultCurriculum,
            subject: subject,
            topic: isReview ? `Review: ${subject}` : targetTopic,
            mode: isReview ? 'notes' : 'adaptive-quiz', // ✅ App.tsx routing - DO NOT CHANGE
            language: appLanguage,
            difficulty: action.type === 'CHALLENGE' ? Difficulty.HARD : Difficulty.MEDIUM,
            detailLevel: DetailLevel.DETAILED,
            // ✅ POLICY: NEW mode = MCQ only (Strict)
            // ✅ AGGLOMERATION: REVIEW/REPAIR = Mix allowed
            quizType: action.type === 'NEW' ? QuizType.MCQ : QuizType.MIX,
            questionCount: 10,
            contentId: scope === 'FILE' ? scopeId : primaryFile?.materialId,
            selectedDocumentIds: validFilesForReview,
            struggleAtoms: targetAtomIds,
            // ✅ POLICY: Strict format only for NEW mode
            strictFormat: action.type === 'NEW',
            metadata: {
                scope,
                scopeId,
                origin: action.type // ✅ CRITICAL: NEW/REPAIR/SMART - quiz engine reads this!
            }
        };

        onSubmit(req);
    };

    const weakStats = useMemo(() => {
        if (!data) return { label: 'Weak Areas', value: '0 Issues' };

        // Use LIS Snapshot count if available
        if (USE_LIS_SNAPSHOTS && lisSnapshot) {
            const count = lisSnapshot.weakAtomsCount;
            return {
                label: 'Weak Areas',
                value: `${count} Issue${count !== 1 ? 's' : ''}`
            };
        }

        const clusters = data.health.weakClustersCount;
        const looseItems = data.materials.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'WEAK' || a.masteryLevel === 'PARTIAL').length;

        if (clusters > 0) return { label: 'Weak Areas', value: `${clusters} Cluster${clusters !== 1 ? 's' : ''}` };
        if (looseItems > 0) return { label: 'Weak Concepts', value: `${looseItems} Item${looseItems !== 1 ? 's' : ''}` };
        return { label: 'Weak Areas', value: '0 Issues' };
    }, [data, USE_LIS_SNAPSHOTS, lisSnapshot]);

    // Calculate weak atom count for dynamic REPAIR button label
    const weakAtomCount = useMemo(() => {
        if (!data) return 0;
        return (data.allWeakAtomIds?.length || 0) ||
            data.materials.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'WEAK' || a.masteryLevel === 'PARTIAL').length;
    }, [data]);

    // 🎯 PHASE DETECTION (continued): Determine action mode based on phase
    const hasWeakAtoms = weakAtomCount > 0;
    const compassPhase = !hasAnyAttempts ? 'EXPLORATION' : hasWeakAtoms ? 'REMEDIATION' : 'REINFORCEMENT';
    const primaryActionLabel = compassPhase === 'EXPLORATION'
        ? "Let's start practicing"
        : compassPhase === 'REMEDIATION'
            ? "Fix weak atoms"
            : "Continue practicing";
    const primaryActionMode = compassPhase === 'EXPLORATION' ? 'NEW' : compassPhase === 'REMEDIATION' ? 'REPAIR' : 'REVIEW';

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 p-8">
                <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">⚠️</div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">{t.student.compass.errors.syncInterrupted}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-center max-w-sm mb-8">{error}</p>
                <Button onClick={onBack} variant="outline" className="rounded-2xl px-12 py-4">{t.student.compass.errors.returnToHub}</Button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:p-6 animate-fade-in pb-16">
            <div className="mb-3">
                <button onClick={onBack} className="group relative overflow-hidden px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs uppercase tracking-widest transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105">
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative flex items-center gap-2">
                        <span className="group-hover:-translate-x-1 transition-transform">{isArabic ? '→' : '←'}</span>
                        {t.student.compass.header.returnToMatrix}
                    </span>
                </button>
            </div>

            {
                noWeaknessFound && (
                    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
                        <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-t-[12px] border-emerald-500 rounded-[2.5rem] shadow-2xl p-0 overflow-hidden">
                            <div className="p-8 text-center">
                                <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl shadow-sm border-4 border-emerald-100 dark:border-emerald-800 animate-bounce">
                                    🎉
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                                    {t.student.compass.alerts.masteryVerifiedTitle}
                                </h3>
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800 mt-4">
                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                        {t.student.compass.alerts.masteryVerifiedMsg}
                                        <br /><span className="text-xs opacity-70">{t.student.compass.alerts.masteryVerifiedTip}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
                                <Button onClick={() => setNoWeaknessFound(false)} className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest shadow-lg shadow-emerald-500/30 border-none">
                                    Dismiss
                                </Button>
                            </div>
                        </Card>
                    </div >
                )
            }

            {
                showNoMaterialsAlert && (
                    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
                        <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-t-[12px] border-indigo-500 rounded-[2.5rem] shadow-2xl p-0 overflow-hidden">
                            <div className="p-8 text-center">
                                <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl shadow-sm border-4 border-indigo-100 dark:border-indigo-800">
                                    📚
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">{t.student.compass.alerts.noMaterialsFoundTitle}</h3>
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 mt-4">
                                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                        Train EDUVA with your <span className="font-black">{subject}</span> materials to unlock adaptive practice sessions.
                                        <br /><br />
                                        <span className="text-xs opacity-70">Go to Library to upload and train your first document.</span>
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                                <Button
                                    onClick={() => {
                                        setShowNoMaterialsAlert(false);
                                        dispatch({ type: 'OPEN_FEATURE', featureId: 'library', props: { initialSubject: subject } });
                                    }}
                                    className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 border-none"
                                >
                                    {t.student.compass.alerts.btnGoToLibrary}
                                </Button>
                                <Button
                                    onClick={() => setShowNoMaterialsAlert(false)}
                                    variant="outline"
                                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest"
                                >
                                    {t.student.compass.alerts.btnMaybeLater}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )
            }

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT COLUMN: Main Intelligence */}
                <div className="lg:col-span-8 space-y-8">

                    {/* Banner Header with Animated Wave Background */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-[#d4d9f7] to-[#e8ebff] dark:from-[#1e293b] dark:to-[#0f172a] rounded-[2.5rem] p-3 md:p-4 shadow-xl border border-white/50 dark:border-slate-800">
                        {/* Animated Wave Background */}
                        <div className="absolute inset-0">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/10 to-purple-400/10 animate-pulse" style={{ animationDuration: '4s' }}></div>
                            <div className="absolute top-0 left-0 w-full h-full">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] rounded-full border-2 border-indigo-300/30 animate-ping" style={{ animationDuration: '3s' }}></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] rounded-full border-2 border-purple-300/20 animate-ping" style={{ animationDuration: '4s', animationDelay: '0.5s' }}></div>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 p-8 opacity-20 text-[10rem] select-none pointer-events-none ltr:block rtl:hidden">
                            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-900 dark:text-indigo-100"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                        </div>
                        <div className="relative z-10">
                            <h1 className="text-2xl md:text-3xl font-black text-indigo-950 dark:text-white tracking-tighter uppercase mb-1">{data?.subjectName || subject}</h1>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-indigo-600 dark:text-indigo-400 font-black text-sm uppercase tracking-widest">
                                    {t.student.compass.header.neuralBridge} {isSyncing ? t.library.statusLabels.syncing : t.library.statusLabels.ready}
                                </p>
                                <p className="text-indigo-950/60 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                    {loading ? (
                                        <span className="animate-pulse">{t.student.compass.header.loadingMetadata}</span>
                                    ) : (
                                        `${data?.meta.grade || t.student.compass.header.currentLevel} • ${t.student.compass.header.activeSince} ${data?.meta.activeSince || 'Now'}`
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            icon="🗺️"
                            label="Content Coverage"
                            value={loading ? '-' : `${USE_LIS_SNAPSHOTS ? contentCoverage : syllabusCoverage}%`}
                            colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                            subtext="subject material explored"
                            isLoading={loading}
                        />
                        <StatCard
                            icon="🧠"
                            label="Learning Progress"
                            value={loading ? '-' : `${USE_LIS_SNAPSHOTS ? learningProgress : masteryHealth}%`}
                            colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
                            subtext="How well concepts are mastered"
                            isLoading={loading}
                        />
                        <StatCard
                            icon="⚠️"
                            label={weakStats.label}
                            value={weakStats.value}
                            colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30"
                            isLoading={loading}
                        />
                        <StatCard
                            icon="⏱️"
                            label="Time Spent"
                            value={loading ? '-' : (USE_LIS_SNAPSHOTS ? (lisSnapshot?.totalStudyTime || '0m') : (data ? `${Math.floor(data.meta.totalTimeSpentMinutes / 60)}h ${data.meta.totalTimeSpentMinutes % 60}m` : '0h 0m'))}
                            colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30"
                            isLoading={loading}
                        />
                    </div>

                    {/* Add CSS for brain thinking animation */}
                    <style>{`
                        @keyframes thinking {
                            0%, 100% { transform: scale(1) rotate(0deg); }
                            25% { transform: scale(1.1) rotate(-5deg); }
                            50% { transform: scale(1.15) rotate(5deg); }
                            75% { transform: scale(1.1) rotate(-3deg); }
                        }
                    `}</style>

                    {/* Material Section */}
                    <section className="space-y-6">
                        <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-[0.2em] px-1">{t.student.compass.material.knowledgeCoverage}</h3>
                        <div className="space-y-4">
                            {loading ? (
                                <>
                                    <FileSkeleton />
                                    <FileSkeleton />
                                    <FileSkeleton />
                                </>
                            ) : displayFiles.length > 0 ? displayFiles.map(file => {
                                const isExpanded = expandedFileId === file.materialId;
                                const rawStatus = file.status || 'Completed';
                                const isProcessing = rawStatus !== 'Completed';

                                // Enhanced Status Label Logic (Coverage vs Mastery)
                                let statusLabel = rawStatus;
                                if (!isProcessing) {
                                    // Calculate true mastery (atoms with STRONG level)
                                    const masteredCount = file.atoms.filter(a => a.masteryLevel === 'STRONG').length;
                                    const totalAtoms = file.atoms.length;
                                    const masteryPercent = totalAtoms > 0 ? (masteredCount / totalAtoms) * 100 : 0;

                                    // Badge logic: MASTERED only if ≥70% truly mastered
                                    if (masteryPercent >= 70) statusLabel = t.student.compass.material.mastered;
                                    else if (file.coveragePercent >= 90) statusLabel = 'COVERED';
                                    else if (file.coveragePercent >= 70) statusLabel = t.student.compass.material.stable;
                                    else if (file.coveragePercent === 0) statusLabel = t.student.compass.material.notStarted;
                                    else statusLabel = t.student.compass.material.needsFocus;
                                }

                                const statusColor = isProcessing
                                    ? 'text-amber-600 bg-amber-50 border-amber-200'
                                    : (file.coveragePercent >= 90 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : file.coveragePercent >= 70 ? 'text-blue-600 bg-blue-50 border-blue-200' : file.coveragePercent === 0 ? 'text-slate-400 bg-slate-50 border-slate-200' : 'text-rose-600 bg-rose-50 border-rose-200');

                                return (
                                    <div key={file.materialId} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                        <button
                                            onClick={() => {
                                                if (isProcessing) return;
                                                const next = isExpanded ? null : file.materialId;
                                                logger.orchestrator(`[UI_INTERACTION] Expanded File: ${file.materialName} [${next ? 'OPEN' : 'CLOSE'}]`);
                                                setExpandedFileId(next);
                                            }}
                                            className={`w-full flex items-center justify-between p-5 lg:p-6 text-left group ${isProcessing ? 'cursor-default opacity-80' : ''}`}
                                        >
                                            <div className="flex items-center gap-4 lg:gap-6 flex-grow min-w-0">
                                                <span className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90 text-indigo-500' : ''} ${isProcessing ? 'invisible' : ''}`}>
                                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                                                </span>
                                                <h4 className="font-bold text-slate-800 dark:text-white truncate text-xs uppercase tracking-wider w-1/2">{file.materialName}</h4>

                                                <div className="flex-grow flex items-center gap-4 ml-4">
                                                    {!isProcessing && (
                                                        <div className="flex-grow h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner hidden sm:block">
                                                            <div
                                                                className={`h-full transition-all duration-1000 ${file.coveragePercent >= 70 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}
                                                                style={{ width: `${file.coveragePercent}%` }}
                                                            ></div>
                                                        </div>
                                                    )}
                                                    {!isProcessing && <span className="text-xs font-black text-slate-400 w-10 text-right hidden sm:block">{file.coveragePercent}%</span>}
                                                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${statusColor} whitespace-nowrap`}>
                                                        {statusLabel}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>

                                        {isExpanded && !isProcessing && (
                                            <div className="px-16 pb-8 pt-2 border-t border-slate-50 dark:border-slate-800 animate-slide-up bg-slate-50/30 dark:bg-slate-950/20">
                                                {/* 🔒 NEW: Show Curriculum Map Nodes if available */}
                                                {file.curriculumMap ? (
                                                    <NodeTree
                                                        nodes={file.curriculumMap.nodes}
                                                        rootNodes={file.curriculumMap.rootNodes}
                                                    />
                                                ) : (
                                                    <>
                                                        <div className="flex justify-between items-center mb-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                            <span>LEARNING STATUS BY CONCEPT</span>
                                                            <span>{t.student.compass.material.masteryDepth}</span>
                                                        </div>
                                                        <div className="space-y-5 mb-10">
                                                            {file.atoms.length === 0 ? (
                                                                <p className="text-center text-xs text-slate-400 italic py-4">No atoms extracted yet.</p>
                                                            ) : (
                                                                file.atoms.map(atom => {
                                                                    const isNotStarted = atom.masteryLevel === 'UNKNOWN';
                                                                    return (
                                                                        <div key={atom.atomId} className="flex items-center justify-between group/atom">
                                                                            <div className="flex items-center gap-4">
                                                                                <MasteryBadge level={atom.masteryLevel} />
                                                                                <span className={`text-sm font-bold uppercase tracking-tight ${isNotStarted ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{atom.conceptTag}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-3">
                                                                                {isNotStarted ? (
                                                                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{t.student.compass.material.notStarted}</span>
                                                                                ) : (
                                                                                    <>
                                                                                        <div className="w-24 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                                            <div className="h-full bg-indigo-500/50" style={{ width: `${atom.masteryScore}%` }}></div>
                                                                                        </div>
                                                                                        <span className="text-[11px] font-black text-slate-500 w-8 text-right">{atom.masteryScore}%</span>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                                {/* File-Scoped Actions: Repair & Expand */}
                                                {(() => {
                                                    // 1. Repair Candidates (Strict: Started & Weak)
                                                    const repairCandidates = file.atoms
                                                        .filter(a => a.masteryLevel !== 'UNKNOWN' && a.masteryScore < 80)
                                                        .sort((a, b) => a.masteryScore - b.masteryScore)
                                                        .slice(0, 5)
                                                        .map(a => a.atomId);

                                                    // 2. Expand Candidates (Two-Phase)
                                                    let expandCandidates: string[] = [];
                                                    const unstarted = file.atoms.filter(a => a.masteryLevel === 'UNKNOWN');

                                                    if (unstarted.length > 0) {
                                                        // Phase 1: Pure Discovery
                                                        expandCandidates = unstarted.slice(0, 5).map(a => a.atomId);
                                                    } else {
                                                        // Phase 2: Reinforcement Fallback (Weakest of all)
                                                        expandCandidates = file.atoms
                                                            .sort((a, b) => a.masteryScore - b.masteryScore)
                                                            .slice(0, 5)
                                                            .map(a => a.atomId);
                                                    }

                                                    return (
                                                        <div className="flex gap-3 mt-4">
                                                            {/* REPAIR BUTTON (Conditional) */}
                                                            {repairCandidates.length > 0 && (
                                                                <button
                                                                    onClick={() => handleLaunch({
                                                                        label: `Repair: ${file.materialName}`,
                                                                        type: 'REPAIR',
                                                                        scope: 'FILE',
                                                                        scopeId: file.materialId,
                                                                        origin: 'REPAIR', // STRICT SIGNAL
                                                                        atomIds: repairCandidates
                                                                    } as any)}
                                                                    className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-indigo-500 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 group/repair"
                                                                >
                                                                    <span className="text-xl group-hover/repair:rotate-12 transition-transform">🔧</span>
                                                                    <div className="flex flex-col items-start leading-none gap-1">
                                                                        <span>{t.student.compass.material.repairWeakAtoms}</span>
                                                                        <span className="text-[8px] opacity-60 font-bold">{repairCandidates.length} Concepts</span>
                                                                    </div>
                                                                </button>
                                                            )}

                                                            {/* EXPAND BUTTON (Always Available) */}
                                                            <button
                                                                onClick={() => handleLaunch({
                                                                    label: `Expand: ${file.materialName}`,
                                                                    type: 'NEW', // Maps to 'practice' mode in quiz
                                                                    scope: 'FILE',
                                                                    scopeId: file.materialId,
                                                                    origin: 'EXPAND', // STRICT SIGNAL
                                                                    atomIds: expandCandidates
                                                                } as any)}
                                                                className="flex-1 py-4 rounded-2xl bg-teal-500 text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-teal-400 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 group/expand"
                                                            >
                                                                <span className="text-xl group-hover/expand:scale-110 transition-transform">🌱</span>
                                                                <div className="flex flex-col items-start leading-none gap-1">
                                                                    <span>{unstarted.length > 0 ? "Expand Knowledge" : "Reinforce All"}</span>
                                                                    <span className="text-[8px] opacity-80 font-bold">
                                                                        {unstarted.length > 0 ? `${unstarted.length} New Concepts` : "Deepen Mastery"}
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : !loading && (
                                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-3xl opacity-50">
                                    <p className="text-xs font-bold uppercase text-slate-400 tracking-widest italic">No materials detected.</p>
                                    <p className="text-[10px] text-indigo-400 font-bold mt-2 uppercase">Go to Library to add and train materials for this subject.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* RIGHT COLUMN: Insights & Quick Actions */}
                <div className="lg:col-span-4 space-y-8 lg:sticky lg:top-8">
                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-[0.2em] px-1">{t.student.compass.insight.panelTitle}</h3>
                        <Card className="p-4 border-none bg-gradient-to-b from-indigo-50 to-white dark:from-slate-900 dark:to-slate-800 shadow-xl text-center relative overflow-hidden">
                            {/* Brain Signal Waves */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-indigo-300/40 animate-ping" style={{ animationDuration: '2s' }}></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-purple-300/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.5s' }}></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-indigo-400/20 animate-ping" style={{ animationDuration: '1s', animationDelay: '0.3s' }}></div>
                            </div>

                            {/* Animated Brain Icon */}
                            <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center mx-auto mb-3 border-2 border-indigo-100 dark:border-slate-700 relative z-10">
                                <span className="text-2xl inline-block" style={{ animation: 'thinking 2s ease-in-out infinite' }}>🧭</span>
                            </div>
                            <h4 className="text-base font-black text-slate-900 dark:text-white mb-2 relative z-10">{t.student.compass.insight.eduvaInsight}</h4>
                            {loading ? (
                                <div className="space-y-2 relative z-10">
                                    <div className="h-2 w-full bg-slate-100 animate-pulse rounded mx-auto"></div>
                                    <div className="h-2 w-4/5 bg-slate-100 animate-pulse rounded mx-auto"></div>
                                </div>
                            ) : (
                                <div className="space-y-2 mb-4 relative z-10">
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {syllabusCoverage < 50 && masteryHealth > 80
                                            ? "Your depth is excellent, but coverage is low. Start new topics to expand breadth."
                                            : data?.health.weakClustersCount > 0
                                                ? "Some gaps found. Prioritize fixing weak clusters to stabilize progress."
                                                : "Solid progress. Keep maintaining your momentum."
                                        }
                                    </p>
                                </div>
                            )}
                            <Button
                                onClick={() => data && handleLaunch(data.recommendedAction)}
                                disabled={loading || !data || !hasMaterials}
                                className="w-full py-3 rounded-2xl bg-[#6c79ca] hover:bg-[#5b68b5] border-none shadow-indigo-500/20 relative z-10"
                            >
                                <span className="text-sm mr-2">🔧</span> {loading ? t.student.compass.insight.analyzing : (data?.recommendedAction.label || t.student.compass.insight.actionRequired)}
                            </Button>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-[0.2em] px-1">{t.student.compass.missions.selectionTitle}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                {
                                    // Dynamic label: "Improve 8 Weak Skills" when weak atoms detected
                                    label: weakAtomCount > 0
                                        ? (isArabic
                                            ? `تحسين ${weakAtomCount} مهار${weakAtomCount === 1 ? 'ة' : 'ات'} ضعيفة`
                                            : `Improve ${weakAtomCount} Weak Skill${weakAtomCount === 1 ? '' : 's'}`)
                                        : t.student.compass.missions.types.repair.label,
                                    sub: t.student.compass.missions.types.repair.sub,
                                    description: t.student.compass.missions.types.repair.description,
                                    type: 'REPAIR',
                                    icon: '🔧',
                                    time: weakAtomCount <= 3 ? '3-5 min' : weakAtomCount <= 6 ? '5-8 min' : '8-12 min',
                                    star: true
                                },
                                {
                                    // Dynamic label: "Explore 5 New Concepts" when atoms available
                                    label: unknownAtomIds.length > 0
                                        ? (isArabic
                                            ? `استكشف ${unknownAtomIds.slice(0, 10).length} مفاهيم جديدة`
                                            : `Explore ${unknownAtomIds.slice(0, 10).length} New Concepts`)
                                        : t.student.compass.missions.types.expand.label,
                                    sub: t.student.compass.missions.types.expand.sub,
                                    description: t.student.compass.missions.types.expand.description,
                                    type: 'NEW',
                                    icon: '🌱',
                                    time: '5-10 min',
                                    highlight: unknownAtomIds.length > 0
                                },
                                { label: t.student.compass.missions.types.review.label, sub: t.student.compass.missions.types.review.sub, type: 'REVIEW', icon: '📘', time: '10-15 min' },
                                { label: t.student.compass.missions.types.challenge.label, sub: t.student.compass.missions.types.challenge.sub, type: 'CHALLENGE', icon: '🚀', time: '15-20 min' }
                            ].map((act, i) => (
                                <button
                                    key={i}
                                    disabled={
                                        loading ||
                                        !data ||
                                        !hasMaterials ||
                                        (act.type === 'NEW' && unknownAtomIds.length === 0) ||
                                        (act.type === 'REPAIR' && weakAtomCount === 0)
                                    }
                                    onClick={() => handleLaunch({ label: act.label, type: act.type, scope: 'SUBJECT', scopeId: subject } as any)}
                                    className={`p-4 rounded-2xl border shadow-sm text-left transition-all group disabled:opacity-50 relative overflow-hidden ${act.highlight
                                        ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800'
                                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:shadow-md'
                                        }`}
                                >
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[6px] font-black uppercase tracking-wider text-slate-400 border border-slate-200 dark:border-slate-700">
                                        🌍 Whole Subject
                                    </div>
                                    <div className="flex justify-between items-start mb-4 mt-2">
                                        <span className="text-xl">{act.icon}</span>
                                        {act.star && <span className="text-indigo-400 text-sm">★</span>}
                                    </div>
                                    <p className="text-[10px] font-black uppercase text-slate-800 dark:text-white mb-0.5 group-hover:text-indigo-600">{act.label}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mb-1">{act.sub}</p>
                                    {/* Render description microcopy if available */}
                                    {act.description && (
                                        <p className="text-[7px] font-medium text-slate-400 italic mb-1 leading-relaxed">{act.description}</p>
                                    )}
                                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{act.time}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div >

            </div >
        </div >
    );
};

export default SubjectCompass;
