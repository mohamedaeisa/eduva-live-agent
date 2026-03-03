/**
 * STUDENT GUIDANCE RADAR — LIS-POWERED
 * 
 * 🔒 CONSTITUTIONAL RULE:
 * Radar is a visual projection of LIS Compass Snapshot.
 * NO Firestore subscriptions allowed here.
 * ALL data comes from student_compass_snapshots.radarSignals
 * ⚠️ NO CALCULATIONS — visualizes pre-computed signals only
 */

import React, { useEffect, useState } from 'react';
import { StudentRadarSnapshot, RadarStrategy, RadarAction, RadarActionType } from '../../../types/radar';
import { useRadarSnapshot } from '../../../hooks/useRadarSnapshot';
import { QuotaGuard } from '../../monetization/QuotaGuard';
import { monetizationClient } from '../../../services/monetization/client';
import { useDashboard } from '../context/DashboardContext'; // Task 9: Bridge to Engine
import { trackRadarAction } from '../../../services/telemetryBrainService'; // Task 10: Closed Loop Logging
import { TRANSLATIONS } from '../../../i18n';
import { Language } from '../../../types';


interface Props {
    studentId: string;
    appLanguage: Language;
    subjects?: string[]; // Added for contract resolution
    subjectId?: string; // For LIS snapshot (required for Compass)
    onClose?: () => void;
}


const StudentGuidanceRadar: React.FC<Props> = ({ studentId, appLanguage, subjects, subjectId = 'all', onClose }) => { // Task 6: Data Binding (Read-Only)
    const { dispatch } = useDashboard(); // Task 9: Execution Engine
    const [snapshot, setSnapshot] = useState<StudentRadarSnapshot | null>(null);
    const [loadingActionId, setLoadingActionId] = useState<string | null>(null); // Task 9: Active Feedback State

    // ✅ RADAR: Fetch dedicated strategy snapshot (Real-time)
    const { snapshot: radarSnapshot, loading } = useRadarSnapshot(studentId);

    // Sync state
    useEffect(() => {
        setSnapshot(radarSnapshot);
    }, [radarSnapshot]);

    // Legacy Inference Removed: Strategy is now explicitly provided by the LIS backend.


    // Task 9: The Execution Matrix (Routing Logic)
    const handleRadarAction = (action: RadarAction) => {
        if (!action.payload) {
            console.warn('[RADAR] Action payload missing', action);
            return;
        }

        const strategyOfTheDay = snapshot?.strategyOfTheDay || RadarStrategy.MAINTAIN;

        // 1. Instant Feedback (Warp Speed)
        setLoadingActionId(action.actionId);

        console.group('🚀 [RADAR] Action Triggered');
        console.log('Action Type:', action.actionType);
        console.log('Subject:', action.subjectId);
        console.log('Strategy:', strategyOfTheDay);
        console.log('FULL PAYLOAD:', action.payload);
        console.groupEnd();

        // 2. Log Action Taken (Closed Loop - V3)
        trackRadarAction(studentId, action.actionId, strategyOfTheDay, action.subjectId);

        // 3. Dispatch with Micro-Delay for perceived weight
        setTimeout(() => {
            const type = action.actionType as string;

            const rawOrigin = action.payload.quizOrigin ??
                (strategyOfTheDay === 'RECOVERY' ? 'REPAIR' :
                    strategyOfTheDay === 'CHALLENGE' ? 'CHALLENGE' :
                        strategyOfTheDay === 'BUILD' ? 'SMART' : 'PRACTICE');

            let normalizedOrigin = rawOrigin;
            let normalizedScope = action.payload.quizScope || 'SUBJECT';
            let normalizedSubject = action.subjectId;

            if ((normalizedOrigin as string) === 'ONBOARDING') {
                normalizedOrigin = 'SMART';
            }

            if ((normalizedScope as string) === 'ALL' || normalizedSubject === 'ALL') {
                normalizedScope = 'SUBJECT';
                normalizedSubject = (subjects && subjects.length > 0) ? subjects[0] : 'General Knowledge';
                console.warn(`[RADAR] Normalized ALL scope to ${normalizedSubject} (${normalizedOrigin})`);
            }

            if (type === RadarActionType.QUIZ || type === 'PRACTICE') {
                dispatch({
                    type: 'OPEN_FEATURE',
                    featureId: 'adaptive_quiz',
                    props: {
                        initialRequest: {
                            subject: normalizedSubject,
                            metadata: {
                                origin: normalizedOrigin,
                                scope: normalizedScope,
                                atomIds: action.payload.atomIds
                            }
                        }
                    }
                });
            }
            else if (type === RadarActionType.EXAM) {
                dispatch({
                    type: 'OPEN_FEATURE',
                    featureId: 'exam',
                    props: {
                        mode: action.payload.examMode || 'STANDARD',
                        subject: action.subjectId
                    }
                });
            }
            else if (type === RadarActionType.NOTE || type === 'STUDY') {
                dispatch({
                    type: 'OPEN_FEATURE',
                    featureId: 'library',
                    props: {
                        mode: action.payload.noteMode || 'STUDY',
                        contentId: action.payload.contentId
                    }
                });
            }

            setLoadingActionId(null);
        }, 300);
    };

    if (loading) return <div className="h-48 flex items-center justify-center text-white/50 animate-pulse">Scanning learning patterns...</div>;

    // Task 7: Empty / Onboarding State
    if (!snapshot) {
        return (
            <div className="w-full bg-white/10 dark:bg-slate-900/40 backdrop-blur-md border border-white/20 rounded-[2.5rem] p-8 text-center animate-fade-in shadow-xl">
                <h3 className="text-xl font-black text-white mb-2">Let's get you started.</h3>
                <p className="text-sm text-slate-300 mb-6">Take a quick discovery step so we can guide you better.</p>
                <button className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3 px-8 rounded-full uppercase tracking-widest text-xs shadow-lg transition-all hover:scale-105 active:scale-95">
                    Start Discovery
                </button>
            </div>
        );
    }

    const { strategyOfTheDay, actions } = snapshot;
    const primaryAction = actions.find(a => a.urgency === 'HIGH') || actions[0];
    const secondaryActions = actions.filter(a => a.actionId !== primaryAction?.actionId).slice(0, 2); // Task 3: Max 2 secondary

    // Task 3: Strategy Label Styling
    const strategyColors: Record<RadarStrategy, string> = {
        [RadarStrategy.RECOVERY]: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        [RadarStrategy.BUILD]: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        [RadarStrategy.CHALLENGE]: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        [RadarStrategy.MAINTAIN]: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        [RadarStrategy.ONBOARDING]: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    };

    // Polish C: Urgency Strip Colors
    const urgencyGradients: Record<RadarStrategy, string> = {
        [RadarStrategy.RECOVERY]: 'from-rose-500 to-orange-500', // Warm/Alert
        [RadarStrategy.BUILD]: 'from-cyan-400 to-indigo-400', // Cool/Energetic (Tweaked as requested)
        [RadarStrategy.CHALLENGE]: 'from-purple-500 to-fuchsia-500', // Bold/Confident
        [RadarStrategy.MAINTAIN]: 'from-slate-400 to-slate-500',
        [RadarStrategy.ONBOARDING]: 'from-amber-400 to-orange-400'
    };

    const currentGradient = urgencyGradients[strategyOfTheDay] || urgencyGradients[RadarStrategy.BUILD];

    return (
        // Task 3: Structure & Glassmorphism (Updated for Responsiveness)
        <QuotaGuard capability="radar" variant="card">
            <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-4 md:p-8 shadow-2xl relative overflow-hidden animate-slide-up-fade">
                {/* Background Ambient Glow */}
                <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2`} />

                {/* Header */}
                <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
                            Your next best actions
                        </h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-0.5">
                            Strategy on your recent learning
                        </p>
                    </div>

                    {/* Polish B: Strategy Badge & Close Control */}
                    <div className="flex gap-3 items-center self-start mt-0.5">
                        <div className={`px-4 py-1.5 rounded-full border border-dashed ${strategyColors[strategyOfTheDay]} flex items-center gap-2 backdrop-blur-md`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                                {strategyOfTheDay} Mode
                            </span>
                        </div>

                        {/* Collapse Button */}
                        {onClose && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onClose(); }}
                                className="text-white/40 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-md"
                                aria-label="Collapse Radar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Task 4: Primary Action Card */}
                {primaryAction && (
                    <div className="bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-3xl p-6 relative overflow-hidden group hover:border-indigo-400/50 transition-all cursor-pointer">
                        <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${currentGradient}`}></div> {/* Polish C: Dynamic Strip */}

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    {/* Icon based on Type */}
                                    <span className="text-2xl filter drop-shadow-lg">
                                        {(primaryAction.actionType === RadarActionType.NOTE || primaryAction.actionType === 'STUDY' as any) ? '📖' : primaryAction.actionType === RadarActionType.EXAM ? '🏆' : '🎯'}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-rose-300/80 uppercase tracking-widest leading-none">
                                            {primaryAction.urgency} • {primaryAction.subjectId}
                                        </span>
                                        <h4 className="text-lg font-bold text-white leading-tight">
                                            {primaryAction.title}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-300 pl-10 max-w-lg leading-relaxed">
                                    {primaryAction.reason}
                                </p>
                            </div>

                            <QuotaGuard
                                capability={
                                    primaryAction.actionType === RadarActionType.QUIZ || primaryAction.actionType === 'PRACTICE' as any
                                        ? 'quizzes'
                                        : primaryAction.actionType === RadarActionType.EXAM
                                            ? 'exams'
                                            : 'notes'
                                }
                                variant="standard"
                            >
                                <button
                                    onClick={() => !loadingActionId && handleRadarAction(primaryAction)}
                                    disabled={!!loadingActionId}
                                    className={`bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 whitespace-nowrap text-xs uppercase tracking-wider flex items-center gap-2
                                    ${(strategyOfTheDay === RadarStrategy.RECOVERY || strategyOfTheDay === RadarStrategy.CHALLENGE) ? 'animate-pulse-slow' : ''} 
                                    ${loadingActionId === primaryAction.actionId ? 'opacity-80 scale-95 cursor-wait' : ''}
                                `}
                                >
                                    {loadingActionId === primaryAction.actionId ? 'Initiating...' : 'Start Now'} <span className="text-lg leading-none">→</span>
                                </button>
                            </QuotaGuard>
                        </div>
                    </div>
                )}

                {/* Task 5: Secondary Actions (Vertical Stack) */}
                {secondaryActions.length > 0 && (
                    <div className="mt-4 space-y-3">
                        {secondaryActions.map(action => (
                            <div key={action.actionId} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-colors cursor-pointer group relative overflow-hidden">
                                {/* Polish C: Dynamic Strip (added to secondary) */}
                                <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${currentGradient}`}></div>

                                <div
                                    className="flex items-center gap-3 pl-2" // Added padding for strip
                                    title={action.reason} // Deep Context Tooltip
                                >
                                    <div className={`w-2 h-2 rounded-full ${(action.actionType === RadarActionType.NOTE || action.actionType === 'STUDY' as any) ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                                    <div>
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                                            {action.subjectId}  •  {action.actionType}
                                        </span>
                                        <h5 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                                            {action.title}
                                        </h5>
                                    </div>
                                </div>
                                {/* Polish A: Passive "Continue" CTA */}
                                <QuotaGuard
                                    capability={
                                        action.actionType === RadarActionType.QUIZ || action.actionType === 'PRACTICE' as any
                                            ? 'quizzes'
                                            : action.actionType === RadarActionType.EXAM
                                                ? 'exams'
                                                : 'notes'
                                    }
                                    variant="mini"
                                >
                                    <div
                                        onClick={() => !loadingActionId && handleRadarAction(action)}
                                        className={`text-slate-400 text-[10px] font-bold uppercase tracking-wider px-3 py-1 bg-white/5 rounded-lg border border-white/5 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 group-hover:border-indigo-500/30 transition-all flex items-center gap-1 ${loadingActionId === action.actionId ? 'opacity-50 cursor-wait' : ''}`}
                                    >
                                        {loadingActionId === action.actionId ? '...' : (
                                            (action.actionType === RadarActionType.NOTE || action.actionType === 'STUDY' as any) ? 'Open' : 'Start'
                                        )} <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                                    </div>
                                </QuotaGuard>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </QuotaGuard>
    );
};

export default StudentGuidanceRadar;
