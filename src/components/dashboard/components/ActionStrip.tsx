import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../context/DashboardContext';
import { AppView, FeatureId, Language } from '../../../types';
import { TRANSLATIONS } from '../../../i18n';

interface ActionItem {
    id: FeatureId;
    label: string;
    icon: string;
    priority: number;
    highlight?: boolean;
}

interface ActionStripProps {
    onNavigate: (view: AppView) => void;
}

const ActionStrip: React.FC<ActionStripProps> = ({ onNavigate }) => {
    const { dispatch, state } = useDashboard();
    const [confirmAction, setConfirmAction] = useState<FeatureId | null>(null);

    // I18n: Read directly from storage for immediate sync
    const savedLang = localStorage.getItem('app_language') as Language || Language.ENGLISH;
    const t = TRANSLATIONS[savedLang] || TRANSLATIONS[Language.ENGLISH];

    // PREDICTIVE ENGINE: Reorder buttons based on FSM State
    const sortedActions = useMemo(() => {
        const baseActions: ActionItem[] = [
            { id: 'study_assembler', label: t.common?.menuNotes || 'Study Notes', icon: '📝', priority: 1 },
            { id: 'adaptive_quiz', label: t.common?.menuPractice || 'Practice', icon: '🎯', priority: 1 },
            { id: 'exam' as FeatureId, label: 'Exam', icon: '📜', priority: 1 },
        ];

        if (state.state === 'FRICTION') {
            // Friction -> Prioritize Notes (Repair)
            return baseActions.map(a => a.id === 'study_assembler' ? { ...a, priority: 10, highlight: true } : a).sort((a, b) => b.priority - a.priority);
        }

        if (state.state === 'FLOW') {
            // Flow -> Practice (Challenge)
            return baseActions.map(a => a.id === 'adaptive_quiz' ? { ...a, priority: 10, highlight: true } : a).sort((a, b) => b.priority - a.priority);
        }



        return baseActions;
    }, [state.state, t]);

    const handleNavClick = (featureId: FeatureId) => {
        console.log('[MISSION LOCK DEBUG] Click:', featureId, '| State:', state.state, '| Full State:', state);
        console.log('[MISSION LOCK DEBUG] Active Feature:', state.activeFeatureId, '| Trying to nav to:', featureId);

        // Special handling for Exam
        if (featureId === ('exam' as FeatureId)) {
            onNavigate(AppView.EXAM);
            return;
        }

        // MISSION LOCK PROTOCOL
        // If user is in FLOW (e.g., Active Quiz), intercept navigation
        if (state.state === 'FLOW') {
            console.log('[MISSION LOCK] >>> INTERCEPTING! Opening confirmation modal');
            setConfirmAction(featureId);
        } else {
            console.log('[MISSION LOCK] State is not FLOW, allowing navigation');
            dispatch({ type: 'OPEN_FEATURE', featureId });
        }
    };

    const confirmNavigation = () => {
        if (confirmAction) {
            dispatch({ type: 'OPEN_FEATURE', featureId: confirmAction });
            setConfirmAction(null);
        }
    };

    return (
        <>
            <div className="max-w-md mx-auto mt-4 px-4">
                <div className="flex justify-center items-center gap-4">
                    {sortedActions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => handleNavClick(action.id)}
                            className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-2xl transition-all active:scale-95 hover:scale-105 group relative min-w-[100px] ${action.highlight
                                ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 border-2 border-indigo-200 shadow-sm'
                                : 'text-slate-500 hover:text-indigo-600 border-2 border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                                }`}
                        >
                            {action.highlight && (
                                <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
                            )}
                            <span className="text-2xl filter saturate-150">{action.icon}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                                {action.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* MISSION LOCK MODAL */}
            {confirmAction && createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border-4 border-amber-400 animate-pop">
                        <div className="text-center space-y-4">
                            <div className="text-5xl mb-2">🚧</div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase italic">Mission In Progress</h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Leaving now will pause your session, but your <span className="text-indigo-600 font-bold">Neural Flow</span> streak might be broken.
                            </p>

                            <div className="grid grid-cols-2 gap-3 pt-4">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    className="py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-transform"
                                >
                                    Stay Focused
                                </button>
                                <button
                                    onClick={confirmNavigation}
                                    className="py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase tracking-widest text-xs hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
                                    Leave Anyway
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ActionStrip;
