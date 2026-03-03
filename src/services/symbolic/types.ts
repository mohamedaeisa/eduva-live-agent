export type ArchetypeID = string; // e.g., "archetype_gr9_academic_concrete"

export enum AbstractionLevel {
    CONCRETE = 'concrete',
    BALANCED = 'balanced',
    ABSTRACT = 'abstract'
}

export enum LanguageComplexity {
    SIMPLIFIED = 'simplified',
    STANDARD = 'standard',
    ADVANCED = 'advanced'
}

export interface SymbolicArchetype {
    id: ArchetypeID;
    abstractionLevel: AbstractionLevel;
    examOrientation: boolean;
    languageComplexity: LanguageComplexity;
    gradeLevel: number;
}
