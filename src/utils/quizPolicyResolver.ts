/**
 * QUIZ POLICY RESOLVER
 * 
 * Central source of truth for allowed question types based on quiz mode.
 * This enforces learning integrity by preventing inappropriate question formats
 * in diagnostic and challenge contexts.
 * 
 * POLICY MATRIX:
 * - PRACTICE: All types allowed (student control)
 * - REPAIR: MCQ + FillIn only (no guessing)
 * - EXPAND: MCQ only (conceptual clarity)
 * - CHALLENGE: MCQ only (deep reasoning)
 * - NEW: MCQ only (first-exposure learning)
 * - SMART: MCQ + TrueFalse (fast adaptive reinforcement)
 */

export type QuizOrigin = 'PRACTICE' | 'REPAIR' | 'EXPAND' | 'CHALLENGE' | 'NEW' | 'SMART';
export type QuizScope = 'FILE' | 'SUBJECT' | 'ALL';
export type QuestionType = 'MCQ' | 'TrueFalse' | 'FillIn' | 'Match';

/**
 * Resolves allowed question types based on quiz mode.
 * 
 * @param origin - The quiz mode (PRACTICE, REPAIR, EXPAND, CHALLENGE)
 * @param scope - The quiz scope (FILE or SUBJECT) 
 * @param userSelectedTypes - Types selected by user in PRACTICE mode
 * @returns Array of allowed question types for this mode
 * 
 * @example
 * // PRACTICE mode - user has full control
 * resolveAllowedQuestionTypes('PRACTICE', 'FILE', ['MCQ', 'TrueFalse'])
 * // Returns: ['MCQ', 'TrueFalse']
 * 
 * @example
 * // REPAIR mode - policy override
 * resolveAllowedQuestionTypes('REPAIR', 'FILE', ['MCQ', 'TrueFalse'])
 * // Returns: ['MCQ', 'FillIn'] (TrueFalse filtered out)
 * 
 * @example  
 * // CHALLENGE mode - strict MCQ only
 * resolveAllowedQuestionTypes('CHALLENGE', 'SUBJECT')
 * // Returns: ['MCQ']
 */
export function resolveAllowedQuestionTypes(
    origin: QuizOrigin,
    scope: QuizScope,
    userSelectedTypes?: QuestionType[]
): QuestionType[] {
    // PRACTICE MODE: User has full control
    // Student explicitly chose these types via picker UI
    if (origin === 'PRACTICE') {
        // Default to MCQ if user didn't select anything
        return userSelectedTypes && userSelectedTypes.length > 0
            ? userSelectedTypes
            : ['MCQ'];
    }

    // REPAIR MODE: MCQ + FillIn only
    // Rationale: Precision diagnostics, no 50% guessing (TrueFalse)
    if (origin === 'REPAIR') {
        return ['MCQ', 'FillIn'];
    }

    // EXPAND MODE: MCQ only  
    // Rationale: Clear conceptual introduction for new atoms
    if (origin === 'EXPAND') {
        return ['MCQ'];
    }

    // CHALLENGE MODE: MCQ only
    // Rationale: Deep reasoning requires scenario-based MCQ
    if (origin === 'CHALLENGE') {
        return ['MCQ'];
    }

    // NEW MODE: MCQ only
    // Rationale: First-exposure learning benefits from clear conceptual options
    // Similar to EXPAND but used for different triggering logic
    if (origin === 'NEW') {
        return ['MCQ'];
    }

    // SMART MODE: MCQ + TrueFalse
    // Rationale: Fast adaptive reinforcement for momentum maintenance
    // Excludes Fill-in (too demanding) and Match (too slow)
    if (origin === 'SMART') {
        return ['MCQ', 'TrueFalse'];
    }

    // DEFENSIVE FALLBACK: Should never reach here
    console.warn('[POLICY] Unknown quiz origin:', origin, '- defaulting to MCQ');
    return ['MCQ'];
}

/**
 * Validates if a question type is allowed for a given mode.
 * Useful for runtime checks and telemetry.
 * 
 * @param type - Question type to validate
 * @param origin - Quiz mode
 * @param scope - Quiz scope
 * @returns true if type is allowed, false otherwise
 */
export function isQuestionTypeAllowed(
    type: QuestionType,
    origin: QuizOrigin,
    scope: QuizScope
): boolean {
    const allowedTypes = resolveAllowedQuestionTypes(origin, scope);
    return allowedTypes.includes(type);
}

/**
 * Get human-readable explanation for why a type is blocked.
 * Useful for UI tooltips and developer debugging.
 * 
 * @param type - Question type
 * @param origin - Quiz mode
 * @returns Explanation string or null if type is allowed
 */
export function getBlockReason(
    type: QuestionType,
    origin: QuizOrigin
): string | null {
    if (origin === 'PRACTICE') {
        return null; // All types allowed
    }

    const reasons: Record<QuestionType, Record<QuizOrigin, string>> = {
        TrueFalse: {
            PRACTICE: '',
            REPAIR: 'True/False questions allow 50% guessing and reduce diagnostic accuracy',
            EXPAND: 'True/False questions are too shallow for learning new concepts',
            CHALLENGE: 'True/False questions lack the depth needed for mastery challenges',
            NEW: 'First-exposure learning uses MCQ for conceptual clarity',
            SMART: '' // Allowed
        },
        Match: {
            PRACTICE: '',
            REPAIR: 'Matching questions are reserved for practice mode',
            EXPAND: 'Matching questions are reserved for practice mode',
            CHALLENGE: 'Matching questions are reserved for practice mode',
            NEW: 'Matching questions are reserved for practice mode',
            SMART: 'SMART practice uses MCQ + TrueFalse for speed'
        },
        FillIn: {
            PRACTICE: '',
            REPAIR: '',  // Allowed
            EXPAND: 'Fill-in questions are limited to repair mode',
            CHALLENGE: 'Challenge mode requires scenario-based reasoning (MCQ only)',
            NEW: 'First-exposure learning uses MCQ only',
            SMART: 'SMART practice focuses on quick reinforcement (MCQ + TF)'
        },
        MCQ: {
            PRACTICE: '',
            REPAIR: '',  // Allowed
            EXPAND: '',  // Allowed
            CHALLENGE: '', // Allowed
            NEW: '', // Allowed
            SMART: '' // Allowed
        }
    };

    const reason = reasons[type]?.[origin];
    return reason || null;
}
