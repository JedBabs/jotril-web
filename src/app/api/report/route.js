export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby cap; one headless-Chrome render per call

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';
import { renderReportPdf } from '@/lib/report/render';
import { generateReportId } from '@/lib/report/design-system';
import { storageConfigured, reportKey, downloadReport as downloadCachedReport } from '@/lib/report-storage';

const MAX_HTML_BYTES = 8 * 1024 * 1024; // cap reproduced-document HTML
const MAX_CHUNKS = 50000;

function safeFileBase(name) {
    return (String(name || 'Scan').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60)) || 'Scan';
}

// Stream a PDF buffer as an attachment. Chunked so the body flows immediately
// (long renders looked idle to download accelerators / intermediaries).
function pdfResponse(buf, filename) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const CHUNK = 64 * 1024;
    const stream = new ReadableStream({
        start(controller) {
            for (let i = 0; i < u8.length; i += CHUNK) {
                controller.enqueue(u8.subarray(i, Math.min(i + CHUNK, u8.length)));
            }
            controller.close();
        },
    });
    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(u8.length),
            'Content-Disposition': `attachment; filename="Jotril_Report_${safeFileBase(filename)}.pdf"`,
            'Cache-Control': 'no-store',
        },
    });
}

/**
 * POST /api/report
 * Renders a Jotril report PDF via headless Chrome.
 *
 *  - { scanId }  → auth-gated; fetches the persisted scan (incl. sourceHtml).
 *  - inline      → { filename, breakdown, overallLabel, chunks, sentenceCount,
 *                    wordCount, sourceHtml } for a fresh scan (guests allowed).
 *  - ?cover=1    → render only the branded cover (single page; used by the
 *                  PDF-upload overlay path to prepend a cover).
 */
export async function POST(req) {
    try {
        const url = new URL(req.url);
        const coverOnly = url.searchParams.get('cover') === '1';
        const body = await req.json().catch(() => ({}));

        let data;
        if (body.scanId) {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const prisma = getPrisma();
            const baseSelect = {
                userId: true, filename: true, breakdown: true, overallLabel: true,
                chunks: true, sentenceCount: true, wordCount: true,
            };
            let scan;
            try {
                scan = await prisma.scanResult.findUnique({
                    where: { id: body.scanId },
                    select: { ...baseSelect, sourceHtml: true },
                });
            } catch (e) {
                // Fallback for deployments where the sourceHtml column isn't pushed yet.
                console.warn('[Report] sourceHtml select failed; falling back to chunk reconstruction:', e?.message);
                scan = await prisma.scanResult.findUnique({ where: { id: body.scanId }, select: baseSelect });
            }
            if (!scan) return NextResponse.json({ error: 'Scan result not found' }, { status: 404 });
            if (scan.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

            // High-fidelity cache hit → stream the prewarmed Gotenberg + highlight
            // + cover PDF (populated by /api/report/prewarm). Works for both fresh
            // and history downloads; no original file needed.
            if (!coverOnly && storageConfigured()) {
                try {
                    const cached = await downloadCachedReport(reportKey(session.user.id, body.scanId));
                    if (cached) return pdfResponse(cached, scan.filename);
                } catch (e) {
                    console.warn('[Report] cache lookup failed; rendering fresh:', e?.message);
                }
            }

            data = {
                filename: scan.filename, breakdown: scan.breakdown, overallLabel: scan.overallLabel,
                chunks: Array.isArray(scan.chunks) ? scan.chunks : [],
                sentenceCount: scan.sentenceCount, wordCount: scan.wordCount,
                sourceHtml: scan.sourceHtml || null,
            };
        } else {
            data = {
                filename: body.filename || 'Scan',
                breakdown: body.breakdown || { human: 0, mixed: 0, ai: 0 },
                overallLabel: body.overallLabel || '',
                chunks: Array.isArray(body.chunks) ? body.chunks : [],
                sentenceCount: Number(body.sentenceCount) || (Array.isArray(body.chunks) ? body.chunks.length : 0),
                wordCount: Number(body.wordCount) || 0,
                sourceHtml: typeof body.sourceHtml === 'string' ? body.sourceHtml : null,
            };
        }

        if (!coverOnly && data.chunks.length === 0 && !data.sourceHtml) {
            return NextResponse.json({ error: 'Nothing to render' }, { status: 400 });
        }

        // Abuse / footgun guards: oversized HTML falls back to the chunk-based
        // body; absurd chunk counts are rejected outright.
        if (data.sourceHtml && data.sourceHtml.length > MAX_HTML_BYTES) data.sourceHtml = null;
        if (data.chunks.length > MAX_CHUNKS) {
            return NextResponse.json({ error: 'Document too large to render' }, { status: 413 });
        }

        data.coverOnly = coverOnly;
        data.reportId = generateReportId();

        const pdf = await renderReportPdf(data);
        return pdfResponse(pdf, data.filename);
    } catch (error) {
        console.error('[Report] PDF render failed:', error);
        return NextResponse.json({ error: 'Failed to generate report PDF' }, { status: 500 });
    }
}
