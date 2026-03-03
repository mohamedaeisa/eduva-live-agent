import { JourneyEvent } from "../../types/journey";

export interface NormalizedPerformanceEvent {
    id: string;
    subjectId: string;
    type: "quiz" | "Notes" | "Exam" | "other";
    scorePercent: number | null; // Null if not graded
    timestamp: number;
    isPass: boolean;
    durationMin: number; // Added for Focus Time
    metadata: {
        totalQuestions?: number; // For Speed calc
        timeTakenSeconds?: number; // For Speed calc
    };
}

export class EventNormalizer {
    static normalize(events: JourneyEvent[]): NormalizedPerformanceEvent[] {
        let debugLogCount = 0;
        return events.map(e => {
            // DEBUG INJECTION
            if (e.id.startsWith('sample-quiz') && debugLogCount < 3) {
                console.log(`[NORMALIZER DEBUG] ID: ${e.id}, Type: ${e.type}, Metrics:`, e.metrics);
                debugLogCount++;
            }

            let score: number | null = null;
            if (e.metrics) {
                if (e.metrics.percentage !== undefined) score = e.metrics.percentage;
                else if (e.metrics.total && e.metrics.score !== undefined) score = (e.metrics.score / e.metrics.total) * 100;
                else if (e.metrics.score !== undefined) score = e.metrics.score;
            }

            // Cap score
            if (score !== null) score = Math.max(0, Math.min(100, score));

            return {
                id: e.id,
                subjectId: e.subjectId || e.title || "General",
                type: (['quiz', 'exam', 'adaptive-quiz'].includes(e.type as string)) ? 'quiz' : 'other',
                scorePercent: score,
                timestamp: e.startAt,
                isPass: score !== null ? score >= 60 : false,
                durationMin: e.durationMin || e.metrics?.timeTakenMin || 0,
                metadata: {
                    totalQuestions: e.metrics?.total,
                    timeTakenSeconds: e.metrics?.timeTakenSeconds
                }
            };
        });
    }
}
