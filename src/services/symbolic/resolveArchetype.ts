import { UserProfile } from '../../types';
import { SymbolicArchetype, AbstractionLevel, LanguageComplexity } from './types';
import { sha256 } from '../../utils/hashUtils';

/**
 * Deterministically maps a Student Profile to a Symbolic Archetype.
 * This ensures that similar students share the same backbone of generated atoms,
 * allowing for high cache hit rates (1-to-Many instead of 1-to-1).
 */
export async function resolveArchetype(
    user: UserProfile,
    subject: string
): Promise<SymbolicArchetype> {
    // 1. Extract Stable Traits
    // Default to Grade 10 if missing
    const grade = parseInt((user.preferences.defaultYear || "10").replace(/[^0-9]/g, '')) || 10;

    // Heuristic: Determine academic orientation based on history or preference
    // For v1, we assume EXAM orientation if 'examCount' is high or explicity set
    const isExamOriented = (user.dailyStats?.actionsPerformed || 0) > 50; // Simple heuristic for v1

    // Heuristic: Abstraction based on grade
    let abstraction = AbstractionLevel.BALANCED;
    if (grade < 9) abstraction = AbstractionLevel.CONCRETE;
    if (grade > 11) abstraction = AbstractionLevel.ABSTRACT;

    // Heuristic: Language Complexity
    // Could be derived from previous reading/comprehension stats
    const complexity = LanguageComplexity.STANDARD;

    // 2. Construct ID Parts
    const parts = [
        `grade${grade}`,
        abstraction,
        isExamOriented ? 'exam' : 'learn',
        complexity
    ];

    // 3. Generate Stable ID
    const rawId = parts.join('_');

    return {
        id: rawId,
        abstractionLevel: abstraction,
        examOrientation: isExamOriented,
        languageComplexity: complexity,
        gradeLevel: grade
    };
}
