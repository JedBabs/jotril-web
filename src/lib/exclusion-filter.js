/**
 * Smart Exclusion Filter
 * 
 * Determines if a sentence or text chunk is a generic, common phrase, heading,
 * date, or metadata that should BYPASS the AI analysis engine.
 * 
 * Benefits:
 * - Prevents false AI flags on standard formatting ("Table of Contents", "Conclusion").
 * - Saves significant API token costs by dropping pure boilerplate.
 */

const EXACT_EXCLUSIONS = new Set([
    'introduction',
    'conclusion',
    'table of contents',
    'contents',
    'summary',
    'executive summary',
    'references',
    'bibliography',
    'appendix',
    'index',
    'acknowledgments',
    'methodology',
    'results',
    'discussion',
    'background',
    'contact us',
    'about us',
    'privacy policy',
    'terms of service',
    'all rights reserved',
    'copyright',
    'disclaimer',
    'foreword',
    'preface',
    'epilogue',
    'chapter'
]);

const REGEX_EXCLUSIONS = [
    /^(page|pg\.?)\s*\d+$/i,             // Page numbers (Page 1)
    /^chapter\s*\d+(?:\.\d+)*$/i,        // Chapter numbers (Chapter 5, Chapter 3.1)
    /^[0-9]{1,4}[-/.\\][0-9]{1,2}[-/.\\][0-9]{1,4}$/, // Numeric dates (2024-05-12)
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}$/i, // Explicit dates
    /^\d{1,2}:\d{2}\s*(am|pm)?$/i,       // Times
    /^https?:\/\/[^\s]+$/i,              // Standalone URLs
    /^[\d\W]+$/,                         // Pure numbers/symbols (e.g., "1.", "1.2.3", "---", "2024")
    /^[a-z]{1,2}\)$/i,                   // List items like "a)", "b)", "ii)"
    /^[ivxlcdm]+\.?$/i,                  // Roman numerals
];

/**
 * Evaluates whether text is generic enough to bypass heavy AI analysis.
 * @param {string} text - The sentence or paragraph to check
 * @returns {boolean} True if it should be excluded from scoring
 */
export function isExcludable(text) {
    if (!text) return true;

    const clean = text.trim();
    if (clean.length < 4) return true; // Way too short to be linguistically meaningful

    const lowered = clean.toLowerCase().replace(/[.:;,\-_]/g, '').trim();

    // 1. Direct exact match for generic headings
    if (EXACT_EXCLUSIONS.has(lowered)) {
        return true;
    }

    // 2. Pattern matching for dates, times, URLs, page numbers
    if (REGEX_EXCLUSIONS.some(regex => regex.test(clean))) {
        return true;
    }

    // 3. Very short list strings (e.g. "Section 1", "Part A")
    const words = lowered.split(/\s+/);
    if (words.length <= 3) {
        if (words[0] === 'section' || words[0] === 'part' || words[0] === 'module' || words[0] === 'unit') {
            return true;
        }
    }

    return false;
}
