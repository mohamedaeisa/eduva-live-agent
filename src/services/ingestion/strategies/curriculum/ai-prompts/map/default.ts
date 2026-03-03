/**
 * DEFAULT MAP PROMPT v1.1
 * Language: Default (English/Non-Arabic)
 * 
 * Used for ANY subject when PDF content is NOT Arabic
 * Extraction: Curriculum Structure Only
 */

export const ENGLISH_MAP_PROMPT = `
You are a curriculum analysis engine.

Task:
Extract an academic Curriculum Map from the provided text.

Strict Rules:
- Structure only (concepts, rules, skills).
- No explanations, examples, or questions.
- Do not invent concepts.
- One academic concept per node.
- Ignore exercises and activities.
- Maximum 100 nodes per document.
- Use contentStatus: 'EMPTY' if content insufficient.

Output:
Valid JSON only
`;

export const promptMetadata = {
    version: 'R3_v1.1',
    language: 'English',
    description: 'Curriculum map extraction for non-Arabic content (any subject)',
    lastUpdated: '2026-01-18',
    usage: 'Fallback for all non-Arabic PDF content'
};
