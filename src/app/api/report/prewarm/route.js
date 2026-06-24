export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';
import { convertDocxToPdf, gotenbergConfigured } from '@/lib/gotenberg';
import { buildHighlightedReport } from '@/lib/report/server-overlay';
import { renderReportPdf } from '@/lib/report/render';
import { generateReportId } from '@/lib/report/design-system';
import { storageConfigured, reportKey, conversionKey, reportExists, downloadReport, uploadReport } from '@/lib/report-storage';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * POST /api/report/prewarm  (FormData: file=DOCX [, scanId])
 *
 * Two-phase, so the slow Gotenberg DOCX→PDF conversion overlaps the scan
 * instead of being serialized after it:
 *
 *   Phase A — fired the moment a DOCX is uploaded (NO scanId). Converts the
 *   document to a faithful PDF and caches it in GCS content-addressed by the
 *   file hash (`conversions/{sha256}.pdf`). Runs in parallel with the HF scan,
 *   absorbing the Cloud Run cold start while the scan is still querying.
 *
 *   Phase B — fired right after the scan completes (file + scanId). Reuses the
 *   Phase-A conversion if it's ready (the common case — the scan is slower than
 *   the conversion), so it skips Gotenberg entirely; otherwise converts inline
 *   as a fallback. Then bakes in AI/mixed highlights + the branded cover and
 *   caches the final report at `{userId}/{scanId}.pdf` so later downloads (fresh
 *   OR history) are instant and high-fidelity.
 *
 * Idempotent: both phases return early if their target is already cached.
 * Best-effort — the client ignores failures and downloads fall back to the
 * standard renderer.
 */
export async function POST(req) {
    try {
        if (!gotenbergConfigured() || !storageConfigured()) {
            return NextResponse.json({ skipped: 'fidelity engine or storage not configured' }, { status: 501 });
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const form = await req.formData();
        const file = form.get('file');
        const scanId = form.get('scanId');
        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'file required' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const convKey = conversionKey(sha256(buffer));

        // ---- Phase A: convert-only (parallel with the scan, no scanId yet) ----
        if (!scanId) {
            if (await reportExists(convKey)) {
                return NextResponse.json({ converted: true, cached: true });
            }
            console.log('[Prewarm] convert-only: DOCX → PDF in parallel with scan…');
            const pdf = await convertDocxToPdf(buffer, file.name || 'document.docx');
            await uploadReport(convKey, pdf);
            console.log('[Prewarm] convert-only done:', pdf.length, 'bytes →', convKey);
            return NextResponse.json({ converted: true, bytes: pdf.length });
        }

        // ---- Phase B: full pipeline (scan complete) ----
        const key = reportKey(userId, scanId);
        if (await reportExists(key)) {
            return NextResponse.json({ cached: true });
        }

        const prisma = getPrisma();
        const scan = await prisma.scanResult.findUnique({
            where: { id: scanId },
            select: { userId: true, filename: true, breakdown: true, overallLabel: true, chunks: true, sentenceCount: true, wordCount: true },
        });
        if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        if (scan.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // 1. Reuse the parallel Phase-A conversion if it finished; else convert now.
        let convertedPdf = await downloadReport(convKey);
        if (convertedPdf) {
            console.log('[Prewarm] step 1/4: reusing parallel conversion (Gotenberg skipped):', convertedPdf.length, 'bytes');
        } else {
            console.log('[Prewarm] step 1/4: no parallel conversion cached — converting inline…');
            convertedPdf = await convertDocxToPdf(buffer, file.name || 'document.docx');
            uploadReport(convKey, convertedPdf).catch(() => { /* cache for retries — best-effort */ });
            console.log('[Prewarm] step 1/4 done:', convertedPdf.length, 'bytes');
        }

        console.log('[Prewarm] step 2/4: rendering branded cover…');
        let coverPdf = null;
        try {
            coverPdf = await renderReportPdf({
                filename: scan.filename, breakdown: scan.breakdown, overallLabel: scan.overallLabel,
                chunks: Array.isArray(scan.chunks) ? scan.chunks : [],
                sentenceCount: scan.sentenceCount, wordCount: scan.wordCount,
                coverOnly: true, reportId: generateReportId(),
            });
            console.log('[Prewarm] step 2/4 done:', coverPdf?.length, 'bytes');
        } catch (e) {
            console.warn('[Prewarm] step 2/4 cover failed, continuing without:', e?.message);
        }

        console.log('[Prewarm] step 3/4: overlaying highlights (pdf.js + pdf-lib)…');
        const finalPdf = await buildHighlightedReport(convertedPdf, scan.chunks, coverPdf);
        console.log('[Prewarm] step 3/4 done:', finalPdf.length, 'bytes');

        console.log('[Prewarm] step 4/4: uploading to GCS…');
        await uploadReport(key, finalPdf);
        console.log('[Prewarm] step 4/4 done — cached at', key);

        return NextResponse.json({ ok: true, bytes: finalPdf.length });
    } catch (error) {
        console.error('[Prewarm] failed:', error);
        return NextResponse.json({ error: 'Prewarm failed', detail: error?.message }, { status: 500 });
    }
}
