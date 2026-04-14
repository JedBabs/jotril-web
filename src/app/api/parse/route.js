export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
        }

        // Server-side size enforcement (5MB limit)
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 413 });
        }

        const { name, type } = file;

        // Convert Web File stream to Buffer for our extraction engines
        const stream = file.stream();
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        let extractedText = '';

        if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
            // Dynamic import to prevent Next.js static compilation crashes out of memory or missing fs exports
            const pdfParse = (await import('pdf-parse')).default || await import('pdf-parse');
            const data = await pdfParse(buffer);
            extractedText = data.text;
        } else if (
            type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            name.toLowerCase().endsWith('.docx')
        ) {
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (type === 'text/plain' || name.toLowerCase().endsWith('.txt')) {
            extractedText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({ error: 'Unsupported file type. Please upload PDF, DOCX, or TXT.' }, { status: 415 });
        }

        if (!extractedText || extractedText.trim() === '') {
            return NextResponse.json({ error: 'Could not extract any readable text from this file.' }, { status: 422 });
        }

        return NextResponse.json({ success: true, text: extractedText });

    } catch (error) {
        console.error("File Parse Error:", error);
        return NextResponse.json({ error: 'Failed to parse document.', details: error.message }, { status: 500 });
    }
}
