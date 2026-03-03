// Simulation of the server-side aggregation logic (Local-First Implementation)
import { EventNormalizer, NormalizedPerformanceEvent } from './EventNormalizer';
import {
    PerformanceSnapshotDTO,
    LearningHealthDTO,
    MasteryCanvasDTO,
    CognitiveSkillsDTO,
    SubjectOverviewDTO,
    RecentActivityDTO,
    GrowthTimelineDTO
} from '../../types/performance';
import { JourneySDK } from '../journey/journeySdk';

// LOW DATA SNAPSHOT (Building Insights)
const BUILDING_SNAPSHOT: PerformanceSnapshotDTO = {
    learningHealth: {
        lhsScore: 0, // 0 = Hidden/Neutral State in UI
        status: 'stabilizing',
        insightText: 'Building your learning profile. More insights coming soon.',
        xp: { level: 1, currentXP: 100, nextLevelXP: 1000, weeklyXPDelta: 50 },
        isBuilding: true // Explicit flag for UI
    },
    masteryCanvas: { nodes: [], edges: [] },
    cognitiveSkills: {
        studentScore: 50,
        classAverage: 0,
        metrics: [
            { name: 'knowledge_retention', value: 50, delta7d: 0 },
            { name: 'consistency', value: 50, delta7d: 0 },
            { name: 'focus_time', value: 50, delta7d: 0 },
            { name: 'problem_solving', value: 50, delta7d: 0 },
            { name: 'quiz_speed', value: 50, delta7d: 0 }
        ],
        insight: 'Analyzing your cognitive profile...'
    },
    subjectOverview: [],
    recentActivity: [],
    growthTimeline: { points: [{ date: 'Start', masteryScore: 50, expectedScore: 50 }, { date: 'Now', masteryScore: 50, expectedScore: 52 }] }
};

export class PerformanceAggregatorService {

    static async getSnapshot(studentId: string): Promise<PerformanceSnapshotDTO> {
        // [DEV ONLY] Reduce Double-Run Noise
        if (process.env.NODE_ENV === 'development') {
            // @ts-ignore
            if (window.__PERF_RUNNING__) {
                console.log("🛑 [PERFORMANCE] Skipped duplicate run (DevMode Guard)");
                // @ts-ignore
                return window.__LAST_SNAPSHOT__ || BUILDING_SNAPSHOT;
            }
            // @ts-ignore
            window.__PERF_RUNNING__ = true;
            setTimeout(() => {
                // @ts-ignore
                window.__PERF_RUNNING__ = false;
            }, 500);
        }

        console.group("🚀 [PERFORMANCE AGGREGATOR] Generating Snapshot");
        console.log(`[SOURCE] Fetching raw events from JourneySDK (IndexedDB: journey_events_local) for student: ${studentId}`);

        // 1. Fetch & Normalize
        const rawEvents = await JourneySDK.getAllEvents(studentId);
        console.log(`[SOURCE] Raw Events Count: ${rawEvents.length}`);

        const events = EventNormalizer.normalize(rawEvents);
        console.log(`[NORMALIZER] Processed ${rawEvents.length} raw events into ${events.length} normalized metrics.`);
        if (events.length > 0) {
            console.table(events.slice(0, 5).map(e => ({ id: e.id.substring(0, 8), subject: e.subjectId, score: e.scorePercent, type: e.type, time: new Date(e.timestamp).toLocaleDateString() })));
        }

        // --- EMPTY STATE GUARD ---
        if (events.length === 0) {
            console.log("[GUARD] No events found. Returning Empty Snapshot.");
            console.groupEnd();
            const empty = { ...BUILDING_SNAPSHOT, learningHealth: { ...BUILDING_SNAPSHOT.learningHealth, insightText: 'Start your first lesson to see insights.' } };
            return Object.freeze(empty);
        }

        // --- LOW DATA SAFEGUARD ---
        const MIN_EVENTS_THRESHOLD = 10;
        if (events.length < MIN_EVENTS_THRESHOLD) {
            console.log(`[GUARD] Low data (${events.length}/${MIN_EVENTS_THRESHOLD}). Returning Building Snapshot with Partial Data.`);

            console.groupCollapsed("[LOW DATA] Calculating Partial Stats");
            const partialStats = this.calculateSubjectStats(events);
            const partialCanvas = this.buildMasteryCanvas(partialStats);
            const partialActivity = this.extractRecentActivity(events);
            const partialOverview = this.buildSubjectOverview(partialStats);
            console.groupEnd();

            const building = {
                ...BUILDING_SNAPSHOT,
                masteryCanvas: partialCanvas,
                recentActivity: partialActivity,
                subjectOverview: partialOverview,
                learningHealth: { ...BUILDING_SNAPSHOT.learningHealth, isBuilding: true }
            };

            if (process.env.NODE_ENV === 'development') {
                // @ts-ignore
                window.__LAST_SNAPSHOT__ = building;
            }

            console.groupEnd();
            return Object.freeze(building);
        }

        // 2. Base Statistics
        console.groupCollapsed("[STATS] Calculating Base Subject Stats");
        const subjectStats = this.calculateSubjectStats(events);
        console.groupEnd();

        // 3. Deterministic Aggregation
        const cognitiveSkills = this.calculateCognitiveSkills(events);

        // We reuse cognitive metrics for LHS components to ensure "Zero Duplicated Logic"
        const lhs = this.calculateLearningHealth(events, subjectStats, cognitiveSkills);

        const masteryCanvas = this.buildMasteryCanvas(subjectStats);
        const subjectOverview = this.buildSubjectOverview(subjectStats);
        const recentActivity = this.extractRecentActivity(events);
        const growthTimeline = this.buildGrowthTimeline(events);

        // Debug Output
        console.log("[LHS] Final Score:", lhs.lhsScore, "Status:", lhs.status);
        console.log("[CANVAS] Nodes Generated:", masteryCanvas.nodes.length);
        console.groupEnd();

        const snapshot = {
            learningHealth: lhs,
            masteryCanvas: masteryCanvas,
            cognitiveSkills: cognitiveSkills,
            subjectOverview: subjectOverview,
            recentActivity: recentActivity,
            growthTimeline: growthTimeline
        };

        if (process.env.NODE_ENV === 'development') {
            // @ts-ignore
            window.__LAST_SNAPSHOT__ = snapshot;
        }

        return Object.freeze(snapshot);
    }

    private static calculateSubjectStats(events: NormalizedPerformanceEvent[]): Record<string, { total: number, count: number, lastAttempt: number, scores: number[] }> {
        const stats: Record<string, { total: number, count: number, lastAttempt: number, scores: number[] }> = {};
        console.log(`[SUBJECT STATS] Processing ${events.length} events...`);

        events.forEach(e => {
            const subject = e.subjectId.toLowerCase(); // Normalize key
            if (!subject) return;

            if (!stats[subject]) stats[subject] = { total: 0, count: 0, lastAttempt: 0, scores: [] };

            // Always update retention/recency check
            stats[subject].lastAttempt = Math.max(stats[subject].lastAttempt, e.timestamp);

            // Only update mastery scores for graded events
            if (e.scorePercent !== null) {
                stats[subject].total += e.scorePercent;
                stats[subject].count++;
                stats[subject].scores.push(e.scorePercent);
            }
        });

        // Log results
        Object.entries(stats).forEach(([subj, data]) => {
            console.log(`   - ${subj}: ${data.count} graded events (Total Activity Last: ${new Date(data.lastAttempt).toLocaleDateString()})`);
        });

        return stats;
    }

    private static calculateLearningHealth(
        events: NormalizedPerformanceEvent[],
        subjectStats: Record<string, any>,
        cognitive: CognitiveSkillsDTO
    ): LearningHealthDTO {

        console.groupCollapsed("[LOGIC] Learning Health Calculation");
        // --- 1. Mastery Score (0.35) ---
        // --- 1. Mastery Score (0.35) ---
        let totalMastery = 0;
        let subjectsCount = 0;
        Object.values(subjectStats).forEach((s: any) => {
            if (s.count > 0) {
                totalMastery += (s.total / s.count);
                subjectsCount++;
            }
        });
        const masteryScore = subjectsCount > 0 ? totalMastery / subjectsCount : 0;
        console.log(`1. Mastery (Weight 0.35): ${Math.round(masteryScore)} (Avg of ${subjectsCount} graded subjects)`);

        // --- 2. Retention Score (0.25) ---
        const retentionScore = cognitive.metrics.find(m => m.name === 'knowledge_retention')?.value || 0;
        console.log(`2. Retention (Weight 0.25): ${Math.round(retentionScore)} (from Cognitive Skills)`);

        // --- 3. Consistency Score (0.20) ---
        const consistencyScore = cognitive.metrics.find(m => m.name === 'consistency')?.value || 0;
        console.log(`3. Consistency (Weight 0.20): ${Math.round(consistencyScore)} (from Cognitive Skills)`);

        // --- 4. Growth Velocity (0.20) ---
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        const gradedEvents = events.filter(e => e.scorePercent !== null);
        const last7d = gradedEvents.filter(e => (now - e.timestamp) < 7 * oneDay); // 0-7 days ago
        const prev7d = gradedEvents.filter(e => {
            const diff = now - e.timestamp;
            return diff >= 7 * oneDay && diff < 14 * oneDay;
        }); // 7-14 days ago

        let currentAvg = 0;
        let prevAvg = 0;
        let delta = 0;

        if (last7d.length >= 1 && prev7d.length >= 1) {
            currentAvg = last7d.reduce((a, b) => a + (b.scorePercent || 0), 0) / last7d.length;
            prevAvg = prev7d.reduce((a, b) => a + (b.scorePercent || 0), 0) / prev7d.length;
            delta = currentAvg - prevAvg;
            console.log(`   - Growth Calculation: Last 7d (${last7d.length} events, avg ${currentAvg.toFixed(1)}) vs Prev 7d (${prev7d.length} events, avg ${prevAvg.toFixed(1)})`);
        } else {
            console.log(`   - Growth Calculation: Insufficient data (Last7d: ${last7d.length}, Prev7d: ${prev7d.length}). Defaulting to Neutral.`);
        }

        const growthVelocity = Math.max(0, Math.min(100, 50 + (delta * 2.5)));
        console.log(`4. Growth (Weight 0.20): ${Math.round(growthVelocity)} (Delta: ${delta.toFixed(1)})`);


        // --- DETERMINISTIC FORMULA ---
        const lhsRaw =
            (0.35 * masteryScore) +
            (0.25 * retentionScore) +
            (0.20 * consistencyScore) +
            (0.20 * growthVelocity);

        const lhsScore = Math.round(lhsRaw);
        console.log(`= FINAL LHS: ${lhsScore}`);
        console.groupEnd();

        // Status Mapping
        let status: "at_risk" | "stabilizing" | "advancing" | "thriving" = "at_risk";
        if (lhsScore >= 80) status = "thriving";
        else if (lhsScore >= 60) status = "advancing";
        else if (lhsScore >= 40) status = "stabilizing";

        const insightText = delta > 0
            ? `Great momentum! Mastery is up +${Math.round(delta)}% this week.`
            : "Keep consistent to stabilize your growth.";

        const currentXP = events.length * 50 + 1000;
        const level = Math.floor(currentXP / 1000) + 1;

        return {
            lhsScore,
            status,
            insightText,
            xp: {
                level,
                currentXP,
                nextLevelXP: level * 1000,
                weeklyXPDelta: events.filter(e => (Date.now() - e.timestamp) < 7 * 24 * 3600 * 1000).length * 50
            },
            isBuilding: false
        };
    }

    private static calculateCognitiveSkills(events: NormalizedPerformanceEvent[]): CognitiveSkillsDTO {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        console.groupCollapsed("[LOGIC] Cognitive Skills (Real Data)");

        // 1. Knowledge Retention (Success Rate in Quizzes)
        const last30d = events.filter(e => (now - e.timestamp) < 30 * oneDay && e.type === 'quiz');

        // DEBUG: Retention Filter
        if (last30d.length === 0) {
            const anyQuiz = events.find(e => e.type === 'quiz');
            if (anyQuiz) {
                const diffDays = (now - anyQuiz.timestamp) / oneDay;
                console.log(`[DEBUG] Retention: Found 0 recent quizzes, but found older quiz:`, anyQuiz);
                console.log(`[DEBUG] Age: ${diffDays.toFixed(1)} days. (Limit: 30)`);
            } else {
                console.log(`[DEBUG] Retention: No quizzes found AT ALL in ${events.length} events.`);
            }
        } else {
            console.log(`[DEBUG] Retention: Found ${last30d.length} valid quizzes in last 30d.`);
        }

        let retention = 50; // Neutral start
        if (last30d.length > 0) {
            const passed = last30d.filter(e => e.isPass).length;
            retention = (passed / last30d.length) * 100;
            console.log(`- Retention: ${Math.round(retention)}% (${passed} passed / ${last30d.length} quizzes in 30d)`);
        } else {
            console.log(`- Retention: 50% (No quizzes in last 30d, defaulting to neutral)`);
        }

        // 2. Consistency (Study Frequency)
        // Target: Study 7 days out of 14 (50% daily habit) -> 100% score
        const last14d = events.filter(e => (now - e.timestamp) < 14 * oneDay);
        const uniqueDays = new Set(last14d.map(e => new Date(e.timestamp).toDateString()));
        const consistency = Math.min(100, (uniqueDays.size / 7) * 100);

        // DEBUG: Date Analysis
        if (last14d.length > 0) {
            const first = new Date(last14d[0].timestamp).toLocaleDateString();
            const last = new Date(last14d[last14d.length - 1].timestamp).toLocaleDateString();
            console.log(`[DEBUG] Consistency Check: Found ${last14d.length} events in last 14d.`);
            console.log(`[DEBUG] Date Range: ${first} to ${last}`);
            console.log(`[DEBUG] Unique Days Found: ${Array.from(uniqueDays).join(', ')}`);
        }

        console.log(`- Consistency: ${Math.round(consistency)}% (${uniqueDays.size} active days in last 14d, Target: 7)`);

        // 3. Focus Time (PHASE 1: NEUTRAL)
        // Data not yet reliable, keeping neutral to avoid false signals.
        const focusScore = 50;
        console.log(`- Focus Time: 50% (Phase 1 Pattern: Fixed Neutral)`);

        // 4. Problem Solving (Based on Quiz Performance)
        // Heuristic: >80% avg score -> 75 (Strong), >60% -> 60 (Good), else 45 (Developing)
        const gradedEvents = events.filter(e => e.scorePercent !== null);
        let problemSolvingScore = 45; // Default developing
        let avgScore = 0;

        if (gradedEvents.length > 0) {
            avgScore = gradedEvents.reduce((a, b) => a + (b.scorePercent || 0), 0) / gradedEvents.length;
            if (avgScore > 80) problemSolvingScore = 75;
            else if (avgScore > 60) problemSolvingScore = 60;
            else problemSolvingScore = 45;
        }
        console.log(`- Problem Solving: ${problemSolvingScore}% (Avg Score: ${Math.round(avgScore)}% -> Bucket Heuristic)`);

        // 5. Quiz Speed (Based on Time calculated vs Expected)
        // Heuristic: <20s/q -> 75 (Fast), <60s/q -> 60 (Normal), else 45 (Slow)
        // If no metadata, default to 50 (Neutral)
        let speedScore = 50;
        const speedEvents = events.filter(e => e.metadata.totalQuestions && e.metadata.timeTakenSeconds);

        if (speedEvents.length > 0) {
            let totalQ = 0;
            let totalSec = 0;
            speedEvents.forEach(e => {
                totalQ += e.metadata.totalQuestions || 0;
                totalSec += e.metadata.timeTakenSeconds || 0;
            });

            if (totalQ > 0) {
                const avgTimePerQuestion = totalSec / totalQ;
                if (avgTimePerQuestion < 20) speedScore = 75;      // < 20s per question
                else if (avgTimePerQuestion < 60) speedScore = 60; // < 60s per question
                else speedScore = 45;                              // Slow
                console.log(`- Quiz Speed: ${speedScore}% (Avg Time/Q: ${avgTimePerQuestion.toFixed(1)}s -> Bucket Heuristic)`);
            }
        } else {
            console.log(`- Quiz Speed: 50% (No timing metadata available)`);
        }

        console.groupEnd();

        return {
            studentScore: Math.round((retention + consistency + focusScore + problemSolvingScore + speedScore) / 5),
            classAverage: 0,
            metrics: [
                { name: 'knowledge_retention', value: Math.round(retention), delta7d: 0 },
                { name: 'consistency', value: Math.round(consistency), delta7d: 0 },
                { name: 'focus_time', value: Math.round(focusScore), delta7d: 0 },
                { name: 'problem_solving', value: Math.round(problemSolvingScore), delta7d: 0 },
                { name: 'quiz_speed', value: Math.round(speedScore), delta7d: 0 }
            ],
            insight: consistency < 50 ? "Try to study for at least 15 minutes every day." : "Your consistency is strong!"
        };
    }

    private static buildMasteryCanvas(stats: Record<string, any>): MasteryCanvasDTO {
        console.groupCollapsed("[AGGREGATOR] Building Mastery Canvas");
        const nodes = Object.entries(stats).map(([id, s]) => {
            const avg = s.count > 0 ? (s.total / s.count) : 0;
            const daysSince = (Date.now() - s.lastAttempt) / (1000 * 60 * 60 * 24);
            let retention: "stable" | "fading" | "critical" = "stable";
            if (daysSince > 14) retention = "critical";
            else if (daysSince > 7) retention = "fading";

            return {
                subjectId: id,
                subjectName: id.charAt(0).toUpperCase() + id.slice(1),
                masteryPercent: Math.round(avg),
                retentionState: retention,
                lastAttemptAt: new Date(s.lastAttempt).toISOString()
            };
        });
        console.log(`Generated ${nodes.length} nodes from subject stats.`);
        console.groupEnd();

        return { nodes, edges: [] };
    }

    private static buildSubjectOverview(stats: Record<string, any>): SubjectOverviewDTO[] {
        return Object.entries(stats).map(([id, s]: [string, any]) => {
            const avg = s.count > 0 ? (s.total / s.count) : 0;
            const daysSince = (Date.now() - s.lastAttempt) / (1000 * 60 * 60 * 24);
            let retention: "stable" | "fading" | "critical" = "stable";
            if (daysSince > 14) retention = "critical";
            else if (daysSince > 7) retention = "fading";

            return {
                subjectId: id,
                subjectName: id.charAt(0).toUpperCase() + id.slice(1),
                masteryPercent: Math.round(avg),
                retentionState: retention,
                lastAttemptAt: new Date(s.lastAttempt).toISOString()
            };
        });
    }

    private static extractRecentActivity(events: NormalizedPerformanceEvent[]): RecentActivityDTO[] {
        console.groupCollapsed("[AGGREGATOR] Extracting Recent Activity");
        const activity: RecentActivityDTO[] = events
            .sort((a, b) => b.timestamp - a.timestamp)
            .filter(e => e.scorePercent !== null) // Only graded events
            .slice(0, 5)
            .map(e => {
                const subjectName = e.subjectId.charAt(0).toUpperCase() + e.subjectId.slice(1);

                const score = e.scorePercent!;

                return {
                    id: e.id,
                    type: "quiz",
                    subjectName: subjectName,
                    masteryDelta: score >= 80 ? 5 : (score >= 50 ? 2 : -2),
                    retentionImpact: score >= 60 ? "improved" : "declined",
                    occurredAt: new Date(e.timestamp).toISOString()
                };
            });
        console.log(`Extracted ${activity.length} recent activities.`);
        console.groupEnd();
        return activity;
    }

    private static buildGrowthTimeline(events: NormalizedPerformanceEvent[]): GrowthTimelineDTO {
        // Simple distinct dates logic
        const daily: Record<string, { total: number, count: number }> = {};

        events.forEach(e => {
            if (e.scorePercent === null) return;
            const date = new Date(e.timestamp).toLocaleDateString();
            if (!daily[date]) daily[date] = { total: 0, count: 0 };
            daily[date].total += e.scorePercent;
            daily[date].count++;
        });

        const points = Object.entries(daily)
            .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
            .map(([date, data]) => ({
                date: date.split('/')[0] + '/' + date.split('/')[1], // DD/MM
                masteryScore: Math.round(data.total / data.count),
                expectedScore: 60 // Baseline
            }));

        console.log(`[AGGREGATOR] Growth Timeline: Generated ${points.length} points.`);
        return { points };
    }
}
