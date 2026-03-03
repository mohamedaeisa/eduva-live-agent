
import React from 'react';
import { UserProfile, Language, AppView } from '../../types';
import { DashboardProvider } from './context/DashboardContext';

import FocusPortal from './components/FocusPortal';
import KnowledgeWorld from './components/KnowledgeWorld';
import ActionStrip from './components/ActionStrip';
import FeatureOverlayManager from './orchestrator/FeatureOverlayManager';
import { useAtmosphere } from './hooks/useAtmosphere';
import BackgroundEffects from './components/BackgroundEffects';
import HomeRadarContainer from './components/HomeRadarContainer';

interface AppShellProps {
    user: UserProfile;
    appLanguage: Language;
    onGenerate: (req: any) => void;
    onNavigate: (view: AppView) => void;
    onLogout: () => void;
    isProcessing: boolean;
    processingLogs: string[];
    assemblerParams: any;
    onUpdateAssemblerParams: (p: any) => void;
}

const DashboardContent: React.FC<AppShellProps> = ({
    user,
    appLanguage,
    onGenerate,
    onNavigate,
    onLogout,
    isProcessing,
    processingLogs,
    assemblerParams,
    onUpdateAssemblerParams
}) => {
    const { bgClass, isFlow } = useAtmosphere();
    const [radarExpanded, setRadarExpanded] = React.useState(false);

    return (
        <div className={`h-[calc(100vh-4rem)] transition-colors duration-1000 ${bgClass} overflow-hidden flex flex-col justify-center relative`}>
            {/* 
                NOTE: Global Navigation is now handled by Layout.tsx. 
                We just render the dashboard content here. 
            */}

            {/* Z-Layer 0: Background Effects */}
            <BackgroundEffects />

            {/* Z-Layer 1: Dashboard Body */}
            <main
                className={`transition-all duration-700 ease-in-out w-full max-w-5xl mx-auto flex flex-col items-center justify-center -mt-8 relative z-10 ${isFlow ? 'scale-95 opacity-50 blur-sm pointer-events-none' : 'scale-100 opacity-100 blur-0'
                    }`}
            >
                {/* Task 1 & 2: Click to Toggle Radar */}
                <FocusPortal onClick={() => setRadarExpanded(!radarExpanded)} />

                {/* Task 2: Inline Expansion */}
                <HomeRadarContainer
                    expanded={radarExpanded}
                    studentId={user.id}
                    appLanguage={appLanguage}
                    subjects={user.preferences.subjects}
                    onClose={() => setRadarExpanded(false)}
                />

                <ActionStrip onNavigate={onNavigate} />

                <KnowledgeWorld user={user} />
            </main>

            {/* Z-Layer 2: Active Feature Overlay */}
            <FeatureOverlayManager
                user={user}
                appLanguage={appLanguage}
                onGenerate={onGenerate}
                isProcessing={isProcessing}
                processingLogs={processingLogs}
                assemblerParams={assemblerParams}
                onUpdateAssemblerParams={onUpdateAssemblerParams}
                onNavigate={onNavigate}
            />
        </div>
    );
};

const AppShell: React.FC<AppShellProps> = (props) => {
    return (
        <DashboardProvider>
            <DashboardContent {...props} />
        </DashboardProvider>
    );
};

export default AppShell;