import React from 'react';
import { useDashboard } from '../context/DashboardContext';
import { TRANSLATIONS } from "../../../i18n";
import { Language } from "../../../types";

// Focus Circle State Machine
enum FocusCircleState {
    EMPTY = 'EMPTY',                    // No subject selected
    SUBJECT_IDLE = 'SUBJECT_IDLE',      // Subject selected, no recent activity
    SUBJECT_ACTIVE = 'SUBJECT_ACTIVE',  // Subject selected, recent activity exists
}

interface FocusContent {
    state: FocusCircleState;
    icon: string;
    primary: string;
    secondary: string;
}

interface FocusPortalProps {
    onClick?: () => void;
}

const FocusPortal: React.FC<FocusPortalProps> = ({ onClick }) => {
    const { state } = useDashboard();
    // ... (keep usage of local storage for lang if needed, or better, stick to existing logic)
    const savedLang = localStorage.getItem('app_language') as Language || Language.ENGLISH;
    const t = TRANSLATIONS[savedLang] || TRANSLATIONS[Language.ENGLISH];

    // Determine current Focus Circle state (pure local logic)
    const determineFocusState = (): FocusCircleState => {
        // STATE A: EMPTY - No subject selected
        if (!state.activeSubject) {
            return FocusCircleState.EMPTY;
        }

        // For SUBJECT_IDLE vs SUBJECT_ACTIVE, we'd need lastSession data
        // Since we don't have that in current state, default to SUBJECT_IDLE
        return FocusCircleState.SUBJECT_IDLE;
    };

    // Get content based on state
    const getFocusContent = (): FocusContent => {
        const focusState = determineFocusState();
        const subject = state.activeSubject || '';

        switch (focusState) {
            case FocusCircleState.EMPTY:
                return {
                    state: focusState,
                    icon: '🧠',
                    primary: 'Next Action', // Task 1: CTA
                    secondary: 'Personalized for you',
                };

            // ... (keep other cases)
            case FocusCircleState.SUBJECT_IDLE:
                return {
                    state: focusState,
                    icon: '🎯',
                    primary: `${t.focus?.readyToContinue} ${subject}?`,
                    secondary: t.focus?.chooseAction,
                };

            case FocusCircleState.SUBJECT_ACTIVE:
                return {
                    state: focusState,
                    icon: '⚡',
                    primary: `${t.focus?.continueWith} ${subject}`,
                    secondary: t.focus?.practicedRecently,
                };
        }
    };

    const content = getFocusContent();

    // Render EMPTY state with brain waves
    if (content.state === FocusCircleState.EMPTY) {
        return (
            <div className="flex flex-col items-center justify-center py-4 max-w-md mx-auto z-10 relative">
                {/* Brain wave container */}
                <div className="relative flex items-center justify-center">
                    {/* Animated brain wave ripples - 3 layers */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="brainwave-ring brainwave-ring-1"></div>
                        <div className="brainwave-ring brainwave-ring-2"></div>
                        <div className="brainwave-ring brainwave-ring-3"></div>
                    </div>

                    {/* Main circle - INTERACTIVE CTA */}
                    <button
                        onClick={onClick}
                        className="relative w-40 h-40 rounded-full bg-gradient-to-br from-white to-indigo-50 dark:from-slate-800 dark:to-slate-900 shadow-2xl flex flex-col items-center justify-center border-4 border-indigo-100 dark:border-indigo-900/30 z-10 animate-pulse-shadow cursor-pointer hover:scale-105 active:scale-95 transition-all group"
                    >
                        {/* Icon */}
                        <div className="text-4xl mb-2 animate-pulse-scale group-hover:scale-110 transition-transform">
                            {content.icon}
                        </div>

                        {/* Primary */}
                        <h2 className="text-lg font-black text-indigo-600 dark:text-indigo-400 tracking-tight text-center px-4 leading-none mb-1">
                            {content.primary}
                        </h2>

                        {/* Secondary */}
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1 text-center px-4 leading-none">
                            {content.secondary}
                        </p>
                    </button>
                </div>


                {/* CSS animations */}
                <style>{`
                    .brainwave-ring {
                        position: absolute;
                        width: 200px;
                        height: 200px;
                        border: 2px solid rgba(99, 102, 241, 0.3);
                        border-radius: 50%;
                        animation: brainWave 3s ease-out infinite;
                    }

                    .brainwave-ring-1 {
                        animation-delay: 0s;
                    }

                    .brainwave-ring-2 {
                        animation-delay: 1s;
                    }

                    .brainwave-ring-3 {
                        animation-delay: 2s;
                    }

                    @keyframes brainWave {
                        0% {
                            transform: scale(0.7);
                            opacity: 0.8;
                        }
                        50% {
                            opacity: 0.3;
                        }
                        100% {
                            transform: scale(1.4);
                            opacity: 0;
                        }
                    }

                    .animate-pulse-shadow {
                        animation: pulseShadow 2s ease-in-out infinite;
                    }

                    @keyframes pulseShadow {
                        0%, 100% {
                            box-shadow: 0 10px 40px rgba(99, 102, 241, 0.15);
                        }
                        50% {
                            box-shadow: 0 10px 60px rgba(99, 102, 241, 0.25);
                        }
                    }

                    .animate-pulse-scale {
                        animation: pulseScale 2s ease-in-out infinite;
                    }

                    @keyframes pulseScale {
                        0%, 100% {
                            transform: scale(1);
                        }
                        50% {
                            transform: scale(1.1);
                        }
                    }
                `}</style>
            </div>
        );
    }

    // Render SUBJECT_IDLE or SUBJECT_ACTIVE states (simpler, no brain waves)
    return (
        <div className="flex flex-col items-center justify-center py-4 max-w-md mx-auto z-10 relative">
            <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 shadow-2xl flex flex-col items-center justify-center border-4 border-indigo-500 z-10">
                {/* Icon */}
                <div className="text-4xl mb-2">
                    {content.icon}
                </div>

                {/* Primary */}
                <h2 className="text-sm font-black text-white tracking-tight text-center px-4 leading-tight">
                    {content.primary}
                </h2>

                {/* Secondary */}
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mt-1 text-center px-4 leading-none">
                    {content.secondary}
                </p>
            </div>
        </div>
    );
};

export default FocusPortal;
