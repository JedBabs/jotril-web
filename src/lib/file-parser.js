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
