import React, { useEffect, useState } from 'react';
import { PerformanceAggregatorService } from '../../services/performance/PerformanceAggregatorService';
import { JourneySyncService } from '../../services/journey/journeySyncService';
import { PerformanceSnapshotDTO } from '../../types/performance';
import { PerformanceHero } from './performance/PerformanceHero';
import { LearningMasteryRings } from './performance/LearningMasteryRings';
import { CognitiveRadar } from './performance/CognitiveRadar';
import { RecentActivity } from './performance/RecentActivity';
import { GrowthChart } from './performance/GrowthChart';
import { Loader } from 'lucide-react';

interface PerformanceTabProps {
    studentId: string;
}

const PerformanceSkeleton = () => (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-20 opacity-50 pointer-events-none select-none grayscale">
        <div className="h-64 rounded-3xl bg-slate-100 dark:bg-slate-800 w-full animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 rounded-3xl bg-slate-100 dark:bg-slate-800 w-full animate-pulse" />
            <div className="h-72 rounded-3xl bg-slate-100 dark:bg-slate-800 w-full animate-pulse" />
        </div>
        <div className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-800 w-full animate-pulse" />
        <div className="text-center pt-8">
            <p className="text-sm font-bold text-slate-400">BUILDING YOUR PROFILE...</p>
        </div>
    </div>
);



export const PerformanceTab: React.FC<PerformanceTabProps> = ({ studentId }) => {
    const [data, setData] = useState<PerformanceSnapshotDTO | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // 0. HYDRATION: Sync latest events from Cloud (Firestore) to Local (IDB)
                // This ensures Device B gets data from Device A before calculating stats.
                await JourneySyncService.sync(studentId);

                // 1. Fetch from our new aggregated service (Local Calculation)
                const snapshot = await PerformanceAggregatorService.getSnapshot(studentId);
                setData(snapshot);
            } catch (e) {
                console.error("Failed to load performance snapshot", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [studentId]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 min-h-[500px]">
            <Loader className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Synthesizing Performance Data...</p>
        </div>
    );

    if (!data) return <div className="p-8 text-center text-red-500">Failed to load data.</div>;

    // UX POLISH: Show Skeleton if we are in "Building" state (0 score) AND have no subjects yet
    // This prevents the "Jumpy" flash 0 -> 1 node
    const isBuilding = data.learningHealth.isBuilding === true;
    const hasSubjects = data.masteryCanvas.nodes.length > 0;

    // Strict Low Data Mode logic (Semantic Flag)
    const isLowData = isBuilding;

    if (isBuilding && !hasSubjects) {
        return <PerformanceSkeleton />;
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700 pb-20">
            {/* 1. HERO SECTION (Building vs Evaluated) */}
            <PerformanceHero
                data={data.learningHealth}
                mode={isLowData ? 'building' : 'evaluated'}
            />

            {/* 2. METRICS GRID (Rings + Radar) - Unified Design */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[450px]">
                {/* Replaces MasteryCanvas AND SubjectOverview -- Now Mastery Rings */}
                <LearningMasteryRings
                    data={data.masteryCanvas}
                    overallScore={data.learningHealth.lhsScore}
                    isBuilding={isBuilding}
                />
                <CognitiveRadar
                    data={data.cognitiveSkills}
                    mode={isLowData ? 'calibration' : 'full'}
                />
            </div>

            {/* 3. ACTIVITY & GROWTH */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                    <RecentActivity data={data.recentActivity} />
                </div>
                <div className="lg:col-span-2">
                    <GrowthChart
                        data={data.growthTimeline}
                        mode={isLowData ? 'placeholder' : 'full'}
                    />
                </div>
            </div>

            {/* Footer / Copyright / Metadata if needed */}
            <div className="text-center pt-8 opacity-30">
                <p className="text-[10px] font-black uppercase tracking-[0.5em]">Eduva Performance Engine v8.0</p>
            </div>

        </div>
    );
};

