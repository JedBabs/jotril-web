export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { extractTextFromDocument, extractHtmlFromDocument } from '@/lib/file-parser';
import { resolveScan } from '@/lib/budget-governor';

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

        // Resolve the user's tier server-side (never trust a client-supplied tier for
        // budget depth). The governor decides analysis depth, generates the multi-scale
        // scenarios, and reserves the estimated invocation budget.
        const session = await getServerSession(authOptions);
        const tier = session?.user?.role || 'UNAUTHENTICATED';

        const plan = await resolveScan({ tier, text });

        return NextResponse.json({
            // The multi-scale windows the client must query (full text retained — the
            // client derives uniqueTexts = scenarios.map(s => s.text) and the attribution
            // step needs text for the short-window confidence penalty).
            scenarios: plan.scenarios,
            sentences: plan.sentences,
            sourceHtml,
            filename: fileName,
            chunkCount: plan.scenarios.length,
            // Budget bookkeeping — round-tripped back to /api/attribute for reconciliation.
            depth: plan.depth,
            estimate: plan.estimate,
            monthKey: plan.monthKey,
            callsPerQuery: plan.callsPerQuery,
        });

    } catch (error) {
        console.error("Analysis Pipeline Hard Failure:", error);
        return NextResponse.json({ error: "Internal Server Error during File Parsing", details: error.message }, { status: 500 });
    }
}
