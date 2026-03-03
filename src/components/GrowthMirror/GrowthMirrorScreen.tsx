
import React, { useEffect, useState } from 'react';
import { GrowthMirrorDelta } from '../../types';
import { getLatestGrowthMirrorDelta } from '../../services/growthMirrorService'; // DEPRECATED: Keep for fallback
import { useGrowthTimeline } from '../../hooks/useGrowthTimeline'; // ✅ LIS
import { GrowthMirrorCard } from './GrowthMirrorCard';
import { Loader } from 'lucide-react';

interface GrowthMirrorScreenProps {
    studentId: string;
}

export const GrowthMirrorScreen: React.FC<GrowthMirrorScreenProps> = ({ studentId }) => {
    // 🚩 FEATURE FLAG: Toggle LIS timeline vs old GrowthMirrorService
    const USE_LIS_TIMELINE = true; // Set to false to rollback

    const [delta, setDelta] = useState<GrowthMirrorDelta | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'WEEK' | 'MONTH' | 'TERM'>('WEEK');

    // ✅ LIS: Fetch growth timeline (when enabled)
    // Note: GrowthMirror currently shows "delta" (week-over-week comparison)
    // LIS provides timeline data. For now, we'll use old path until full timeline UI is built.
    // TODO: Build timeline charts using useGrowthTimeline data
    const { data: timelineData, loading: lisLoading, error: lisError } = useGrowthTimeline(
        studentId,
        'all' // Growth Mirror shows all subjects combined
    );

    useEffect(() => {
        // Old path: Fetch GrowthMirrorDelta
        if (!USE_LIS_TIMELINE) {
            const fetch = async () => {
                const data = await getLatestGrowthMirrorDelta(studentId);
                setDelta(data);
                setLoading(false);
            };
            fetch();
        } else {
            // LIS path: Timeline data available but delta calculation needed
            // For now, keep using old delta service until full migration
            setLoading(lisLoading);
            // TODO: Convert timelineData to delta format or build new UI
        }
    }, [studentId, USE_LIS_TIMELINE, lisLoading]);

    // Ripple Animation Component
    const RippleVisual = () => (
        <div className="relative w-full h-48 bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 rounded-3xl overflow-hidden mb-6 flex flex-col items-center justify-center border border-white/50 shadow-sm">
            {/* Animated Ripples */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
                <div className="w-64 h-64 border border-blue-200/30 rounded-full animate-ping opacity-20 absolute duration-[3s]" />
                <div className="w-48 h-48 border border-blue-300/30 rounded-full animate-ping delay-75 opacity-20 absolute duration-[3s]" />
                <div className="w-32 h-32 border border-blue-400/30 rounded-full animate-ping delay-150 opacity-20 absolute duration-[3s]" />
                <div className="w-20 h-20 bg-blue-100/50 dark:bg-blue-900/20 rounded-full blur-xl absolute" />
            </div>

            <div className="relative z-10 text-center space-y-2">
                <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Your Growth Mirror</h1>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">You vs You</p>
            </div>

            {delta && (
                <div className="relative z-10 mt-6 animate-fade-in-up">
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md px-6 py-2 rounded-full border border-blue-100 dark:border-slate-700 shadow-sm">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {/* Narrative hook from delta or fallback */}
                            You were more consistent this week
                        </p>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="w-full max-w-md mx-auto p-4 md:p-6 animate-fade-in pb-32">

            <RippleVisual />

            {/* Timeframe Tabs */}
            <div className="flex justify-center mb-8">
                <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-full inline-flex">
                    {(['WEEK', 'MONTH', 'TERM'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab
                                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-20">
                    <Loader className="animate-spin text-indigo-500 w-8 h-8" />
                </div>
            ) : delta ? (
                <GrowthMirrorCard delta={delta} />
            ) : (
                <div className="text-center text-gray-400 p-12 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
                    <p className="text-lg font-bold">No reflection available yet.</p>
                    <p className="text-sm mt-2 opacity-60">Complete a quiz or session to generate your first mirror.</p>
                </div>
            )}

            <div className="mt-12 text-center">
                <p className="text-[10px] text-slate-300 uppercase tracking-widest">This space is private. Growth is personal.</p>
            </div>
        </div>
    );
};
