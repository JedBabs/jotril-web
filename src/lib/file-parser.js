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

    // PDF parsing
    if (mimeType === 'application/pdf') {
        try {
            // pdf-parse is externalized in next.config.mjs so a standard require works
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(buffer);
            return data.text;
        } catch (error) {
            console.error('[FileParser] PDF parsing failed:', error);
            throw new Error('Failed to parse PDF document. It may be corrupted or encrypted.');
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
