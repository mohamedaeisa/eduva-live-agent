import { JourneyEvent } from '../../types/journey';

export interface PerformanceMetrics {
    subjectMastery: {
        subjectId: string;
        subjectName: string;
        confidenceScore: number;
        status: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
        trend: 'UP' | 'DOWN' | 'STABLE';
    }[];
    recentGrades: {
        id: string;
        title: string;
        subject: string;
        score: number;
        grade: string;
        date: string;
    }[];
    skills: {
        name: string;
        score: number;
        trend: 'UP' | 'DOWN' | 'STABLE';
    }[];
    goals: {
        title: string;
        target: string;
        progress: number;
    }[];
}

export const JourneyPerformanceService = {
    calculateMetrics: (events: JourneyEvent[]): PerformanceMetrics => {
        // 1. Subject Mastery
        const subjectStats: Record<string, { totalScore: number; count: number; scores: number[] }> = {};

        // Filter for graded items
        const gradedEvents = events.filter(e =>
            (e.type === 'quiz' || e.type === 'exam') &&
            e.metrics.score !== undefined
        );

        gradedEvents.forEach(e => {
            const subject = e.subjectId || 'General';
            // Use percentage if available, else raw score (assuming 100 max for now if not specified)
            // But builder now consistently puts percentage or score. 
            // If percentage exists, use it. If not, use (score/total)*100.
            let percent = e.metrics.percentage;
            if (percent === undefined && e.metrics.total) {
                percent = (e.metrics.score / e.metrics.total) * 100;
            } else if (percent === undefined) {
                percent = e.metrics.score; // Fallback
            }

            if (!subjectStats[subject]) {
                subjectStats[subject] = { totalScore: 0, count: 0, scores: [] };
            }
            subjectStats[subject].totalScore += percent;
            subjectStats[subject].count += 1;
            subjectStats[subject].scores.push(percent);
        });

        const subjectMastery = Object.entries(subjectStats).map(([subjectId, stats]) => {
            const avg = stats.totalScore / stats.count;
            // Trend: Compare avg of last 3 vs avg of all (simple heuristic)
            // events are sorted NEWEST first.
            const recentScores = stats.scores.slice(0, 3);
            const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

            let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
            if (recentAvg > avg + 5) trend = 'UP';
            else if (recentAvg < avg - 5) trend = 'DOWN';

            let status: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL' = 'GOOD';
            if (avg < 50) status = 'CRITICAL';
            else if (avg < 75) status = 'NEEDS_ATTENTION';

            return {
                subjectId,
                subjectName: subjectId.charAt(0).toUpperCase() + subjectId.slice(1),
                confidenceScore: Math.round(avg),
                status,
                trend
            };
        });

        // 2. Recent Grades
        const recentGrades = gradedEvents.slice(0, 5).map(e => {
            let percent = e.metrics.percentage;
            if (percent === undefined && e.metrics.total) percent = (e.metrics.score / e.metrics.total) * 100;
            else if (percent === undefined) percent = e.metrics.score;

            let grade = 'F';
            if (percent >= 90) grade = 'A';
            else if (percent >= 80) grade = 'B';
            else if (percent >= 70) grade = 'C';
            else if (percent >= 60) grade = 'D';

            return {
                id: e.id,
                title: e.title,
                subject: e.subjectId,
                score: percent,
                grade,
                date: e.date
            };
        });

        // 3. Skills (Mock derived from subjects for now)
        // In reality, we'd need skill tags on questions/quizzes.
        const skills = [
            { name: 'Problem Solving', score: subjectMastery.find(s => s.subjectId === 'math')?.confidenceScore || 0, trend: 'STABLE' as const },
            { name: 'Critical Thinking', score: subjectMastery.find(s => s.subjectId === 'science')?.confidenceScore || 0, trend: 'UP' as const },
            {
                name: 'Knowledge Retention', score: Math.round(
                    gradedEvents.length > 0
                        ? gradedEvents.reduce((acc, curr) => acc + (curr.metrics.percentage || 0), 0) / gradedEvents.length
                        : 0
                ), trend: 'STABLE' as const
            }
        ].filter(s => s.score > 0);
        // If no skills found (e.g. subject names don't match), fallback to showing generic if needed or empty.
        // Actually, let's just use the calculated average if subject not found?
        // Or if empty, we return empty list.

        // 4. Goals (Mock)
        const goals = [
            {
                title: 'Weekly Quiz Streak', target: '3 Quizzes', progress: Math.min((gradedEvents.filter(e => {
                    const d = new Date(e.startAt);
                    const now = new Date();
                    const oneWeek = 7 * 24 * 60 * 60 * 1000;
                    return (now.getTime() - d.getTime()) < oneWeek;
                }).length / 3) * 100, 100)
            },
            { title: 'Master ICT', target: '80% Avg', progress: subjectMastery.find(s => s.subjectId.toLowerCase().includes('ict'))?.confidenceScore || 0 }
        ];

        return {
            subjectMastery,
            recentGrades,
            skills,
            goals
        };
    }
};
