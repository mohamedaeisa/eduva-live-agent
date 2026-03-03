import React, { useEffect, useState, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { UserProfile, SubjectHealthState } from '../../../types';

import { getAllCompassSnapshots, normalizeSubject } from '../../../services/lisSnapshotReader';

interface KnowledgeWorldProps {
    user: UserProfile;
    timeOffset?: number; // New prop for Time Travel
}

const KnowledgeWorld: React.FC<KnowledgeWorldProps> = ({ user, timeOffset = 0 }) => {
    const { dispatch, state } = useDashboard();
    const subjects = user.preferences.subjects || ['General'];
    const [healthMap, setHealthMap] = useState<Record<string, SubjectHealthState>>({});

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                // ✅ LIS MIGRATION: Fetch from Compass Snapshots
                const snapshots = await getAllCompassSnapshots(user.id);
                const map: Record<string, SubjectHealthState> = {};

                snapshots.forEach(s => {
                    // Map LIS CompassSnapshot -> UI SubjectHealthState
                    const state: SubjectHealthState = {
                        subjectId: s.subjectId,
                        confidenceScore: s.healthScore,
                        trend: s.trendClassification === 'improving' ? 'UP' :
                            s.trendClassification === 'at_risk' ? 'DOWN' : 'STABLE',
                        overallStatus: s.healthStatus,
                        sparkline: [] // LIS doesn't have sparkline yet, implementation detail for future
                    };
                    map[s.subjectId] = state; // Keyed by normalized ID
                });
                setHealthMap(map);
            } catch (e) {
                console.warn("Knowledge World: Health sync failed", e);
            }
        };
        fetchHealth();
    }, [user.id]);

    // --- TEMPORAL ENGINE LOGIC ---
    const getInterpolatedScore = (subject: string) => {
        const health = healthMap[normalizeSubject(subject)] || healthMap[subject];
        if (!health) return 0;

        const currentScore = health.confidenceScore;

        // If Now
        if (timeOffset === 0) return currentScore;

        // If Past: Use sparkline data (mocked simulation for now as sparkline is array of recent scores)
        if (timeOffset < 0) {
            // Simulate simple decay or retrieve from sparkline if detailed enough
            // Fallback: Assume variable fluctuation
            const historyIndex = Math.min(Math.abs(timeOffset), (health.sparkline || []).length - 1);
            // If sparkline exists, use it roughly, else decay
            if (health.sparkline && health.sparkline.length > historyIndex) {
                // Sparkline is usually recent->old or old->recent. Assuming [oldest ... newest]
                // We need newest (index length-1) is NOW.
                const targetIdx = Math.max(0, health.sparkline.length - 1 - Math.abs(timeOffset));
                return health.sparkline[targetIdx] || Math.max(0, currentScore - 10);
            }
            return Math.max(0, currentScore - (Math.abs(timeOffset) * 0.5)); // Simple linear decay
        }

        // If Future: Project based on Trend
        if (timeOffset > 0) {
            let growthRate = 0;
            if (health.trend === 'UP') growthRate = 0.8; // Daily improvement
            if (health.trend === 'STABLE') growthRate = 0.1;
            if (health.trend === 'DOWN') growthRate = -0.5;

            return Math.min(100, Math.max(0, currentScore + (timeOffset * growthRate)));
        }
        return currentScore;
    };

    const getNodeVisuals = (subject: string, isActive: boolean, hasActiveSubject: boolean) => {
        const health = healthMap[normalizeSubject(subject)] || healthMap[subject]; // Try normalized first
        const score = Math.round(getInterpolatedScore(subject));
        const status = health?.overallStatus || 'UNKNOWN';

        // Base: If another node is active, dim this one (Focus Tunnel Effect)
        const opacityClass = hasActiveSubject && !isActive ? 'opacity-40 scale-90 blur-[1px]' : 'opacity-100 scale-100 blur-0';

        let baseClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500";

        // HEALTH VISUALIZATION
        // Time Travel Overrides: If future and score high -> Show Potential (Gold)
        if (timeOffset > 0 && score >= 90) {
            baseClass = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-600 shadow-emerald-500/30 animate-pulse";
        } else if (status === 'CRITICAL' && timeOffset === 0) {
            baseClass = "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-600 shadow-red-500/20 animate-pulse";
        } else if (score >= 70) {
            baseClass = "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-600 shadow-amber-500/30";
        } else if (score >= 30) {
            baseClass = "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 text-indigo-600";
        } else if (score >= 5) {
            baseClass = "bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-500";
        }

        // ACTIVATION STATE (The Tether Target)
        if (isActive) {
            return `bg-indigo-600 border-indigo-500 text-white scale-110 shadow-2xl shadow-indigo-500/50 ring-4 ring-indigo-500/20 z-10`;
        }

        return `${baseClass} ${opacityClass} hover:scale-105 hover:opacity-100 hover:blur-0`;
    };

    // Subject Identity Map
    const getSubjectBaseColor = (subject: string) => {
        const key = subject.toUpperCase();
        if (key.includes('MATH')) return 'blue';
        if (key.includes('SCIENCE')) return 'teal';
        if (key.includes('ARABIC')) return 'emerald';
        if (key.includes('ENGLISH')) return 'rose';
        if (key.includes('FRENCH')) return 'purple';
        if (key.includes('ICT')) return 'cyan';
        if (key.includes('SOCIAL')) return 'orange';
        return 'indigo';
    };

    const getSubjectTheme = (subject: string) => {
        const color = getSubjectBaseColor(subject);
        return `text-${color}-600 dark:text-${color}-400`;
    };

    return (
        <div className="max-w-4xl mx-auto px-6 transition-all duration-700 mt-2">
            <h3 className={`text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.4em] mb-3 transition-opacity duration-500 ${state.activeSubject ? 'opacity-0' : 'opacity-100'}`}>
                {timeOffset === 0 ? 'Knowledge Matrix' : timeOffset < 0 ? 'Historical State' : 'Future Projection'}
            </h3>
            <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                {subjects.map(subject => {
                    const isActive = state.activeSubject === subject;
                    const visualClass = getNodeVisuals(subject, isActive, !!state.activeSubject);
                    const health = healthMap[normalizeSubject(subject)] || healthMap[subject];
                    const displayScore = Math.round(getInterpolatedScore(subject));
                    const themeColor = getSubjectTheme(subject);

                    return (
                        <button
                            key={subject}
                            onClick={() => dispatch({ type: 'OPEN_FEATURE', featureId: 'subject_compass', props: { subject } })}
                            className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] border-2 relative overflow-hidden ${visualClass}`}
                        >
                            {health?.trend === 'UP' && !isActive && timeOffset === 0 && (
                                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                            )}

                            {/* Initials - Using Theme Color if not active */}
                            <span className={`text-2xl font-black ${isActive ? 'text-white' : themeColor}`}>
                                {subject.charAt(0)}
                            </span>

                            {/* Full Name - Uniform Size & Bold */}
                            <span className={`text-[8px] font-black uppercase tracking-wider max-w-[90%] truncate leading-none ${isActive ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-300'}`}>
                                {subject}
                            </span>

                            {health && !isActive && (
                                <span className={`text-[8px] font-bold ${timeOffset !== 0 ? 'scale-125 text-indigo-500' : 'opacity-60'} transition-transform`}>{displayScore}%</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default KnowledgeWorld;
