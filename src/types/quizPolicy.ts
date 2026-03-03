/**
 * QUIZ MODE TYPE SYSTEM
 * 
 * CRITICAL INVARIANT:
 * - `QuizRouteMode` is for App.tsx routing (UI concern)
 * - `QuizLearningOrigin` is for policy enforcement (pedagogical concern)
 * 
 * ⚠️ NEVER use `mode` for policy decisions
 * ✅ ALWAYS use `origin` for policy decisions
 * 
 * Policy resolver reads: request.metadata.origin
 * NOT: request.mode ❌
 */

// UI Routing Mode (App.tsx layer)
export type QuizRouteMode = 'adaptive-quiz';

// Learning Policy Origin (Quiz Engine layer)
export type QuizLearningOrigin =
    | 'NEW'        // First-time exploration, MCQ only
    | 'REPAIR'     // Fix weak atoms, MCQ + FillIn
    | 'SMART'      // Fast reinforcement, MCQ + TrueFalse
    | 'PRACTICE'   // User-driven, all types allowed
    | 'EXPAND'     // Learn NEW topics, MCQ only
    | 'CHALLENGE'; // Deep assessment, MCQ only

/**
 * Quiz generation request with clear separation of concerns
 */
export interface QuizGenerationMetadata {
    scope: 'FILE' | 'SUBJECT' | 'ALL';
    scopeId: string;
    origin: QuizLearningOrigin; // ✅ Used for policy enforcement
}

/**
 * INVARIANT ENFORCEMENT:
 * Quiz policy resolver MUST read from metadata.origin
 */
export function resolveQuizPolicy(metadata: QuizGenerationMetadata): QuestionType[] {
    // ✅ CORRECT: Read from origin
    return resolveAllowedQuestionTypes(metadata.origin, metadata.scope);

    // ❌ NEVER DO THIS:
    // return resolveAllowedQuestionTypes(request.mode, ...);
}

/**
 * Type guard to ensure origin is set before quiz starts
 */
export function validateQuizRequest(request: { metadata?: any }): void {
    if (!request.metadata?.origin) {
        throw new Error(
            '[QUIZ_CONTRACT_VIOLATION] Missing metadata.origin. ' +
            'Quiz policy requires explicit learning origin (NEW/REPAIR/SMART/etc.)'
        );
    }

    const validOrigins: QuizLearningOrigin[] = ['NEW', 'REPAIR', 'SMART', 'PRACTICE', 'EXPAND', 'CHALLENGE'];
    if (!validOrigins.includes(request.metadata.origin)) {
        throw new Error(
            `[QUIZ_CONTRACT_VIOLATION] Invalid origin: ${request.metadata.origin}. ` +
            `Must be one of: ${validOrigins.join(', ')}`
        );
    }
}
