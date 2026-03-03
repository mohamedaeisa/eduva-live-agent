/**
 * Phase 3 R3 v1.1 P2: Centralized Prompt Registry
 * 
 * Purpose: Single source of truth for all AI prompts with versioning
 * 
 * Structure:
 * - map/: Map extraction prompts by language
 * - atom/: Atom extraction prompts by subject/language
 * - registry.ts: Router with fail-fast error handling
 */

import { PromptConfig } from './types';
import { ARABIC_MAP_PROMPT } from './map/arabic';
import { ENGLISH_MAP_PROMPT } from './map/default';
import { ARABIC_ATOM_PROMPT_BATCH } from './atom/arabic';
import { DEFAULT_ATOM_PROMPT_SINGLE, DEFAULT_ATOM_PROMPT_BATCH } from './atom/default';

/**
 * Get prompt by configuration
 * Throws if prompt not found (fail-fast)
 */
export function getPrompt(config: PromptConfig): string {
    const lang = config.language.toLowerCase();
    const phase = config.phase.toLowerCase();
    const variant = config.variant || 'default';

    const key = `${phase}_${lang}_${variant}`;

    const REGISTRY: Record<string, string> = {
        // Map Prompts
        'map_arabic_default': ARABIC_MAP_PROMPT,
        'map_english_default': ENGLISH_MAP_PROMPT,

        // Atom Prompts - Arabic (Exception subjects)
        'atom_arabic_default': ARABIC_ATOM_PROMPT_BATCH,
        'atom_arabic_single': ARABIC_ATOM_PROMPT_BATCH,
        'atom_arabic_batch': ARABIC_ATOM_PROMPT_BATCH,

        // Atom Prompts - Default (Generic subjects: Math, Science, etc.)
        'atom_english_default': DEFAULT_ATOM_PROMPT_SINGLE,
        'atom_english_single': DEFAULT_ATOM_PROMPT_SINGLE,
        'atom_english_batch': DEFAULT_ATOM_PROMPT_BATCH,
    };

    const prompt = REGISTRY[key];

    if (!prompt) {
        throw new Error(`[PROMPT_REGISTRY] No prompt found for key: ${key}`);
    }

    return prompt;
}

/**
 * Get prompt version (for metadata tracking)
 */
export function getPromptVersion(config: PromptConfig): string {
    // All prompts currently at R3_v1.1
    return 'R3_v1.1';
}

/**
 * List all available prompts
 */
export function listAvailablePrompts(): string[] {
    return [
        'map_arabic_default',
        'map_english_default',
        'atom_arabic_default',
        'atom_arabic_single',
        'atom_arabic_batch',
        'atom_english_default',
    ];
}
