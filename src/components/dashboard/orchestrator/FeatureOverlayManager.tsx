import React from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../context/DashboardContext';
import { FEATURE_REGISTRY } from './featureRegistry';
import { UserProfile, Language } from '../../../types';
import { useStudentTelemetry } from '../hooks/useStudentTelemetry';
import { logger } from '../../../utils/logger';

interface FeatureOverlayManagerProps {
    user: UserProfile;
    appLanguage: Language;
    onGenerate: (req: any) => void;
    isProcessing: boolean;
    processingLogs: string[];
    assemblerParams: any;
    onUpdateAssemblerParams: (p: any) => void;
    onNavigate: (view: any) => void;
}

// Simple Error Boundary to catch Feature Crashes
class FeatureErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logger.error('ORCHESTRATOR', "Feature Crashed inside Overlay", { error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center space-y-4">
                    <div className="text-6xl">🤕</div>
                    <h2 className="text-xl font-bold text-slate-800">Something went wrong.</h2>
                    <p className="text-slate-500 max-w-md mx-auto">{this.state.error?.message}</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg"
                    >
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const FeatureOverlayManager: React.FC<FeatureOverlayManagerProps> = ({
    user,
    appLanguage,
    onGenerate,
    isProcessing,
    processingLogs,
    assemblerParams,
    onUpdateAssemblerParams,
    onNavigate
}) => {
    const { state, dispatch } = useDashboard();
    const { activeFeatureId, activeFeatureProps } = state;
    const { logSignal } = useStudentTelemetry();

    React.useEffect(() => {
        if (activeFeatureId) {
            console.group('🔌 [WIRING CHECK] Feature Overlay Mounting');
            console.log('Feature ID:', activeFeatureId);
            console.log('Props Passed:', activeFeatureProps);
            console.log('Capabilities:', { hasNavigate: !!onNavigate });
            console.groupEnd();
            logger.orchestrator(`[WIRING] Feature Mounted: ${activeFeatureId}`, { props: activeFeatureProps });
        }
    }, [activeFeatureId]);

    if (state.state !== 'FLOW' || !activeFeatureId) return null;

    const FeatureComponent = FEATURE_REGISTRY[activeFeatureId];

    if (!FeatureComponent) {
        logger.error('ORCHESTRATOR', `Feature ${activeFeatureId} not found in registry.`);
        return null;
    }

    // --- NERVOUS SYSTEM INTERCEPTION ---
    const handleFeatureComplete = (results?: any) => {
        let signal: any = 'task_complete_smooth';
        if (results && results.score && results.total) {
            const percentage = results.score / results.total;
            if (percentage > 0.8) signal = 'task_complete_smooth';
            else if (percentage < 0.5) signal = 'task_complete_struggle';
        }

        logger.telemetry(`Captured Signal: [${signal}] -> Forwarding to Brain.`, { results });
        logSignal(signal);
        dispatch({ type: 'CLOSE_FEATURE' });
    };

    const handleFeatureBack = () => {
        logger.telemetry('Captured Signal: [task_abort] -> Forwarding to Brain.');
        logSignal('task_abort');
        dispatch({ type: 'CLOSE_FEATURE' });
    };

    // PORTAL IMPLEMENTATION: Escape AppShell Clipping
    // FIX: Use top-16 to respect Global Header (h-16)
    // FIX: Use bottom-20 to leave space for ActionStrip (h-20)
    // FIX: Use z-[90] to sit BELOW ActionStrip (z-[100]) so nav buttons remain clickable
    return createPortal(
        <div className="fixed inset-0 top-16 bottom-0 z-[90] bg-white dark:bg-slate-950 animate-slide-up overflow-y-auto">
            <FeatureErrorBoundary>
                <FeatureComponent
                    user={user}
                    appLanguage={appLanguage}
                    {...activeFeatureProps}
                    // Dynamic Prop Injection for Generation Pipeline
                    isProcessing={isProcessing}
                    debugLogs={processingLogs}
                    params={assemblerParams}
                    onUpdateParams={onUpdateAssemblerParams}
                    onBack={handleFeatureBack}
                    onComplete={handleFeatureComplete}
                    setView={(view: any) => {
                        logger.orchestrator(`[OVERLAY] Navigating`, { to: view });
                        dispatch({ type: 'CLOSE_FEATURE' });
                        if (onNavigate && typeof onNavigate === 'function') {
                            onNavigate(view);
                        } else {
                            console.error("CRITICAL: onNavigate is missing in FeatureOverlayManager", { onNavigate });
                            alert("Navigation Error: application router disconnected.");
                        }
                    }}
                    // Compatibility for Assembler
                    onSubmit={(req: any) => {
                        logger.orchestrator("Assembler Output Generated.", { req });
                        // Close feature window and trigger generation pipeline in main App
                        dispatch({ type: 'CLOSE_FEATURE' });
                        onGenerate(req);
                    }}
                />
            </FeatureErrorBoundary>
        </div>,
        document.body
    );
};

export default FeatureOverlayManager;