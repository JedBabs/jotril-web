export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby cap; one headless-Chrome render per call

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';
import { renderReportPdf } from '@/lib/report/render';
import { generateReportId } from '@/lib/report/design-system';

const MAX_HTML_BYTES = 8 * 1024 * 1024; // cap reproduced-document HTML
const MAX_CHUNKS = 50000;

function safeFileBase(name) {
    return (String(name || 'Scan').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60)) || 'Scan';
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

        // Return a standard Uint8Array and let the platform set Content-Length.
        // Hand-setting Content-Length collided with the dev server's chunked
        // transfer encoding → browsers received 0 bytes (Node's lenient client
        // didn't). See _report_debug history.
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Jotril_Report_${safeFileBase(data.filename)}.pdf"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[Report] PDF render failed:', error);
        return NextResponse.json({ error: 'Failed to generate report PDF' }, { status: 500 });
    }
}
