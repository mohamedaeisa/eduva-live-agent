/**
 * Phase 3 R3 v1.1 P2: Prompt Type Definitions
 */

export type PromptPhase = 'map' | 'atom';
export type PromptLanguage = 'arabic' | 'english';
export type PromptVariant = 'single' | 'batch' | 'default';

export interface PromptConfig {
    phase: PromptPhase;
    language: PromptLanguage;
    variant?: PromptVariant;
}

export interface PromptMetadata {
    version: string;
    description: string;
    lastUpdated: string;
}
