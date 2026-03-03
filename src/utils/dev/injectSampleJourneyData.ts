import { JourneySDK } from '../../services/journey/journeySdk';

const SUBJECTS = [
    'Arabic',
    'English',
    'Mathematics',
    'Science',
    'Social Studies',
    'Frensh'
];

/**
 * DEV UTILITY: Injects realistic sample data (~200+ events) 
 * to verify Performance Engine aggregation logic.
 * 
 * Safety:
 * - Only runs in DEV mode (caller responsibility)
 * - Marks events with __dev: true metadata
 */
export async function injectSampleJourneyData(studentId: string) {
    console.group("🧪 [DEV] Injecting Sample Journey Data");
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    let counter = 0;
    const events: any[] = [];

    // Generate ~200 events over last 30 days
    // Pattern: Daily study + frequent quizzes to simulate a "Thriving" student
    for (let day = 1; day <= 30; day++) {
        const timestamp = now - day * DAY;
        const dateStr = new Date(timestamp).toISOString().split('T')[0];

        for (const subject of SUBJECTS) {
            // Study event (Daily Consistency)
            events.push({
                id: `sample-study-${now}-${counter++}`,
                studentId,
                date: dateStr,
                subjectId: subject,
                type: 'study',
                startAt: timestamp,
                metadata: { __dev: true }
            });

            // Quiz every 2 days (Regular Retention Check)
            if (day % 2 === 0) {
                // Score: 6-10 (Weighted towards high scores for 'Advancing' status)
                const score = 6 + Math.floor(Math.random() * 5);

                events.push({
                    id: `sample-quiz-${now}-${counter++}`,
                    studentId,
                    date: dateStr,
                    subjectId: subject,
                    type: 'quiz',
                    metrics: {
                        score,
                        total: 10,
                        percentage: (score / 10) * 100,
                        totalQuestions: 10,       // Moved to metrics for Normalizer
                        timeTakenSeconds: 300     // Moved to metrics for Normalizer
                    },
                    metadata: {
                        __dev: true
                    },
                    startAt: timestamp
                });
            }
        }
    }

    // Persist using JourneySDK
    console.log(`Writing ${events.length} events to IndexedDB for student: ${studentId}...`);
    for (const event of events) {
        // @ts-ignore - Ignoring strict type checks for dev utility on 'metrics' vs 'metadata' schema overlap
        await JourneySDK.createEvent(event);
    }

    // VERIFY PERSISTENCE
    const check = await JourneySDK.getAllEvents(studentId);
    console.log(`[VERIFY] Database now has ${check.length} events for this student.`);

    if (check.length < events.length) {
        console.error("❌ CRITICAL: Writes appeared to succeed but data is missing!");
        alert(`Error: Wrote ${events.length} but found ${check.length}. Check console.`);
        return;
    }

    console.log("✅ Injection Verified. Reloading in 1s...");
    setTimeout(() => {
        window.location.reload();
    }, 1000);
    console.groupEnd();
}
