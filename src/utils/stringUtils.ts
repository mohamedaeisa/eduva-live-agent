/**
 * EDUVA String Utilities
 * Specialized for cleaning AI outputs and standardizing extracted text.
 */

/**
 * Decodes HTML entities (both decimal/hex and named) into plain characters.
 * Essential for correcting OCR/AI artifacts like &#215; (×).
 */
export function decodeHTMLEntities(text: string): string {
    if (!text || !text.includes('&')) return text;

    const entities: Record<string, string> = {
        '&times;': '×',
        '&divide;': '÷',
        '&plusmn;': '±',
        '&plus;': '+',
        '&minus;': '−',
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&quot;': '"',
        '&apos;': "'",
        '&deg;': '°',
        '&mu;': 'μ',
        '&alpha;': 'α',
        '&beta;': 'β',
        '&pi;': 'π',
        '&rho;': 'ρ',
        '&sigma;': 'σ',
        '&omega;': 'ω'
    };

    let result = text;

    // 1. Handle Named Entities
    Object.entries(entities).forEach(([name, char]) => {
        result = result.replace(new RegExp(name, 'g'), char);
    });

    // 2. Handle Decimal Entities (e.g. &#215;)
    result = result.replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10);
        // Map common specific math entities to LaTeX-friendly ones if needed, 
        // or just return the character. KaTeX likes characters fine as long as they aren't symbols.
        return String.fromCharCode(code);
    });

    // 3. Handle Hex Entities (e.g. &#x00D7;)
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });

    return result;
}

/**
 * Specifically converts common scientific symbols to LaTeX commands.
 * Used for deep formula cleaning.
 */
export function symbolicToLatex(text: string): string {
    if (!text) return text;

    return text
        .replace(/×/g, '\\times ')
        .replace(/÷/g, '\\div ')
        .replace(/±/g, '\\pm ')
        .replace(/≤/g, '\\le ')
        .replace(/≥/g, '\\ge ')
        .replace(/≈/g, '\\approx ')
        .replace(/≠/g, '\\neq ')
        .replace(/→/g, '\\to ')
        .replace(/⇒/g, '\\Rightarrow ')
        .replace(/α/g, '\\alpha ')
        .replace(/β/g, '\\beta ')
        .replace(/γ/g, '\\gamma ')
        .replace(/δ/g, '\\delta ')
        .replace(/Δ/g, '\\Delta ')
        .replace(/π/g, '\\pi ')
        .replace(/θ/g, '\\theta ')
        .replace(/σ/g, '\\sigma ')
        .replace(/ω/g, '\\omega ')
        .replace(/\^([0-9]+)/g, '^{$1}') // Fix exponents without braces
        .replace(/_([0-9]+)/g, '_{$1}'); // Fix subscripts without braces
}
