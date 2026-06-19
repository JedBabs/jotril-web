export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { splitIntoSentences } from '@/lib/chunking';
import { extractTextFromDocument, extractHtmlFromDocument } from '@/lib/file-parser';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        let text = formData.get('text') || '';
        let sourceHtml = null;
        let fileName = 'Pasted Text';

        if (file) {
            fileName = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());
            text = await extractTextFromDocument(buffer, file.type);
            sourceHtml = await extractHtmlFromDocument(buffer, file.type);
        }

        if (!text || text.trim().length === 0) {
            return NextResponse.json({ error: "No parsable text found in payload" }, { status: 400 });
        }

        // Chunking architecture decoupled from processing execution layer
        const sentences = splitIntoSentences(text);

        return NextResponse.json({
            chunks: sentences,
            sourceHtml: sourceHtml,
            filename: fileName,
            chunkCount: sentences.length
        });

    } catch (error) {
        console.error("Analysis Pipeline Hard Failure:", error);
        return NextResponse.json({ error: "Internal Server Error during File Parsing", details: error.message }, { status: 500 });
    }
}
