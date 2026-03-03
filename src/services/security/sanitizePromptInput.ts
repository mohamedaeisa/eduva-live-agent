/**
 * Security Utility: Sanitize inputs before injecting into LLM headers/prompts.
 * Prevents prompt injection attacks like "Ignore previous instructions".
 */

export function sanitizePromptInput(input: string, maxLength = 100): string {
    if (!input) return "";

    // 1. Truncate
    let safe = input.substring(0, maxLength);

    // 2. Strip Control Characters (newlines allowed for content, but maybe not for Profile fields?)
    // For Archetype fields, we should be strict.
    safe = safe.replace(/[^a-zA-Z0-9\s\-_.,]/g, '');

    return safe.trim();
}

/**
 * Validates that a value belongs to an Enum or Allowlist.
 */
export function validateEnum(value: string, allowed: string[] | object): boolean {
    const whitelist = Array.isArray(allowed) ? allowed : Object.values(allowed);
    return whitelist.includes(value);
}
