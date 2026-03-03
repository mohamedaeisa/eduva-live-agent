/**
 * ARABIC CANONICALIZATION UTILS (v1.3)
 * 
 * Purpose: Ensure "concept tags" are deduplicated regardless of style.
 * Example: "الْعِلْمُ" == "العلم" == "علم" -> "علم"
 */

// Tashkeel (Diacritics) & Tatweel
const TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;

// Alef Variants -> Bare Alef
const ALEF_REGEX = /[أإآ]/g;

// Taa Marbuta -> Haa
const TAA_MARBUTA_REGEX = /ة/g;

/**
 * Generates a "Canonical Key" for storage and deduplication.
 * NOT for display.
 */
export function normalizeArabicKey(text: string): string {
    if (!text) return '';

    let normalized = text.trim();

    // 1. Unicode Normalization (NFKC)
    normalized = normalized.normalize('NFKC');

    // 2. Remove Tashkeel (Diacritics)
    normalized = normalized.replace(TASHKEEL_REGEX, '');

    // 3. Normalize Alefs (أ -> ا)
    normalized = normalized.replace(ALEF_REGEX, 'ا');

    // 4. Normalize Taa Marbuta (ة -> ه) - Optional, but good for fuzzy matching "مدرسة" vs "مدرسه"
    // In education strictness, Taa Marbuta matters, but for key deduplication it's safer to normalize.
    normalized = normalized.replace(TAA_MARBUTA_REGEX, 'ه');

    // 5. Remove "Al-" (ال definition prefix) if it's the start of the word
    // Logic: If word starts with "ال" and is > 3 chars, strip it.
    // e.g. "الهمزة" -> "همزه"
    if (normalized.startsWith('ال') && normalized.length > 3) {
        normalized = normalized.substring(2);
    }

    // 6. Lowercase (for mixed English/Arabic tags)
    return normalized.toLowerCase();
}
