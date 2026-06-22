import mammoth from 'mammoth';

/**
 * Extracts raw text from supported document buffers.
 * Supported types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * 
 * @param {Buffer} buffer - The file buffer
 * @param {string} mimeType - The mime type of the document
 * @returns {Promise<string>} The extracted raw text
 */
export async function extractTextFromDocument(buffer, mimeType) {
    if (!buffer) throw new Error('No document buffer provided');

    // PDF parsing — pdf-parse v2 exports a PDFParse class (the old callable
    // default export no longer exists). Externalized in next.config.mjs.
    if (mimeType === 'application/pdf') {
        let parser;
        try {
            const { PDFParse } = require('pdf-parse');
            parser = new PDFParse({ data: new Uint8Array(buffer) });
            const result = await parser.getText();
            return result?.text || '';
        } catch (error) {
            console.error('[FileParser] PDF parsing failed:', error);
            throw new Error('Failed to parse PDF document. It may be corrupted or encrypted.');
        } finally {
            if (parser?.destroy) await parser.destroy().catch(() => {});
        }
    }

    // DOCX parsing
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            return result.value || '';
        } catch (error) {
            console.error('[FileParser] DOCX parsing failed:', error);
            throw new Error('Failed to parse Word document. Ensure it is a valid .docx file.');
        }
    }

    // Plain text parsing fallback
    if (mimeType === 'text/plain') {
        return buffer.toString('utf-8');
    }

    throw new Error(`Unsupported document format: ${mimeType}`);
}

function decodeEntities(s) {
    return String(s)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
        .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } });
}

/**
 * Convert reproduced DOCX HTML into plain, analysable prose with all TABLE
 * content removed — so tabular data is exempt from AI scoring (not scored, not
 * counted in the breakdown, and not highlighted). Block-level elements become
 * line breaks so sentence/paragraph boundaries survive for the chunker.
 *
 * @param {string} html - mammoth convertToHtml output
 * @returns {string} table-free plain text
 */
export function htmlToProseText(html) {
    let s = String(html || '');
    s = s.replace(/<table\b[\s\S]*?<\/table>/gi, '\n');      // drop tables entirely
    s = s.replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/figure|\/blockquote)\b[^>]*>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');                            // strip remaining tags
    s = decodeEntities(s);
    return s
        .replace(/[ \t ]+/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Extracts structured HTML from supported document buffers.
 * Only DOCX files produce reliable HTML via mammoth. PDF/TXT return null.
 * 
 * @param {Buffer} buffer - The file buffer
 * @param {string} mimeType - The mime type of the document
 * @returns {Promise<string|null>} The HTML string or null
 */
export async function extractHtmlFromDocument(buffer, mimeType) {
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        try {
            const options = {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Heading 4'] => h4:fresh",
                    "p[style-name='Heading 5'] => h5:fresh",
                    "p[style-name='Heading 6'] => h6:fresh",
                    "p[style-name='Title'] => h1.docx-title:fresh",
                    "p[style-name='Subtitle'] => p.docx-subtitle:fresh",
                    "p[alignment='left'] => p.align-left:fresh",
                    "p[alignment='center'] => p.align-center:fresh",
                    "p[alignment='right'] => p.align-right:fresh",
                    "p[alignment='both'] => p.align-justify:fresh",
                    "p[alignment='justify'] => p.align-justify:fresh"
                ],
                preserveEmptyParagraphs: true
            };
            const result = await mammoth.convertToHtml({ buffer }, options);
            return result.value || null;
        } catch (error) {
            console.error('[FileParser] DOCX HTML extraction failed:', error);
            return null;
        }
    }
    return null; // PDFs and plain text have no reliable HTML source
}
