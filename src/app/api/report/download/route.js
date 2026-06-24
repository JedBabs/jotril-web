export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';
import { renderReportPdf } from '@/lib/report/render';
import { generateReportId } from '@/lib/report/design-system';
import { storageConfigured, reportKey, downloadReport as downloadCachedReport } from '@/lib/report-storage';

const MAX_HTML_BYTES = 8 * 1024 * 1024;

function safeFileBase(name) {
    return (String(name || 'Scan').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60)) || 'Scan';
}

function pdfResponse(buf, filename) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const CHUNK = 64 * 1024;
    const stream = new ReadableStream({
        start(controller) {
            for (let i = 0; i < u8.length; i += CHUNK) controller.enqueue(u8.subarray(i, Math.min(i + CHUNK, u8.length)));
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

// Loads + ownership-checks a scan. Returns { scan } or { errorResponse }.
async function loadScan(scanId, userId) {
    const prisma = getPrisma();
    const baseSelect = { userId: true, filename: true, breakdown: true, overallLabel: true, chunks: true, sentenceCount: true, wordCount: true };
    let scan;
    try {
        scan = await prisma.scanResult.findUnique({ where: { id: scanId }, select: { ...baseSelect, sourceHtml: true } });
    } catch {
        scan = await prisma.scanResult.findUnique({ where: { id: scanId }, select: baseSelect });
    }
    if (!scan) return { errorResponse: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
    if (scan.userId !== userId) return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    return { scan };
}

/**
 * GET /api/report/download?scanId=…  — IDM-proof PDF download.
 *
 * Triggered by a normal <a download> navigation (not fetch+blob), so
 * download-manager extensions (IDM/FDM) and the browser handle the bytes
 * directly — JavaScript never reads the response, so it can't be intercepted
 * into a 0-byte file. Streams the GCS-cached high-fidelity report when present,
 * else renders on the fly.
 */
export async function GET(req) {
    try {
        const scanId = new URL(req.url).searchParams.get('scanId');
        if (!scanId) return NextResponse.json({ error: 'scanId required' }, { status: 400 });

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { scan, errorResponse } = await loadScan(scanId, session.user.id);
        if (errorResponse) return errorResponse;

        // Cached high-fidelity report (Gotenberg + highlights + cover).
        if (storageConfigured()) {
            try {
                const cached = await downloadCachedReport(reportKey(session.user.id, scanId));
                if (cached) return pdfResponse(cached, scan.filename);
            } catch (e) {
                console.warn('[Download] cache lookup failed; rendering fresh:', e?.message);
            }
        }

        // Fallback: standard render from stored chunks / sourceHtml.
        const data = {
            filename: scan.filename, breakdown: scan.breakdown, overallLabel: scan.overallLabel,
            chunks: Array.isArray(scan.chunks) ? scan.chunks : [],
            sentenceCount: scan.sentenceCount, wordCount: scan.wordCount,
            sourceHtml: scan.sourceHtml || null,
            reportId: generateReportId(),
        };
        if (data.chunks.length === 0 && !data.sourceHtml) {
            return NextResponse.json({ error: 'Nothing to render' }, { status: 400 });
        }
        if (data.sourceHtml && data.sourceHtml.length > MAX_HTML_BYTES) data.sourceHtml = null;
        const pdf = await renderReportPdf(data);
        return pdfResponse(pdf, scan.filename);
    } catch (error) {
        console.error('[Download] failed:', error);
        return NextResponse.json({ error: 'Failed to generate report PDF' }, { status: 500 });
    }
}

/**
 * HEAD /api/report/download?scanId=…  — cheap preflight (auth + ownership only,
 * no render). Lets the client surface errors before triggering the download
 * navigation. HEAD has no attachment body, so download managers ignore it.
 */
export async function HEAD(req) {
    try {
        const scanId = new URL(req.url).searchParams.get('scanId');
        if (!scanId) return new Response(null, { status: 400 });
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return new Response(null, { status: 401 });
        const { errorResponse } = await loadScan(scanId, session.user.id);
        if (errorResponse) return new Response(null, { status: errorResponse.status });
        return new Response(null, { status: 200 });
    } catch {
        return new Response(null, { status: 500 });
    }
}
