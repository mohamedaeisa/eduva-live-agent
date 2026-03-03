import { LISEvent } from '../../services/lis/types';

export interface QuotaRule {
    metric: 'quizzesUsed' | 'notesUsed' | 'aiSecondsUsed' | 'examsUsed' | 'trainedMaterialUsed';
    amount: number;
    condition?: (event: LISEvent) => boolean;
}

/**
 * QUOTA MATRIX
 * Maps Telemetry Event Types to Usage Metrics.
 * 
 * To add a new chargeable action:
 * 1. Add the event type key
 * 2. Define the metric and amount
 * 3. Add optional conditional logic
 */
export const QUOTA_MATRIX: Record<string, QuotaRule> = {
    // Note Generation (Master Guide or Cheat Sheet)
    'notes.generated': {
        metric: 'notesUsed',
        amount: 1
    },

    // Quiz Generation Success (Fires when session ready)
    'quiz.generated': {
        metric: 'quizzesUsed',
        amount: 1
    },

    // Exam Generation Success (Fires when blueprint ready)
    'exam.generated': {
        metric: 'examsUsed',
        amount: 1
    },

    // Library Training Success
    'material.trained': {
        metric: 'trainedMaterialUsed',
        amount: 1
    },

    /* 
       ⚠️ REDUNDANCY GUARD:
       The following are high-level completion events. 
       We use the above .generated events instead to follow "Pay-for-Success" charging.
    
    // Exam Completion
    'exam.completed': {
        metric: 'examsUsed',
        amount: 1
    },

    // Quiz Completion (Batched)
    'quiz.completed': {
        metric: 'quizzesUsed',
        amount: 1
    },
    */

    // Example: Future Podcast Logic
    // 'podcast.generated': { metric: 'aiSecondsUsed', amount: 300 }
};
