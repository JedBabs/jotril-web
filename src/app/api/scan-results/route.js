export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

/**
 * GET /api/scan-results
 * Fetch paginated scan results for the authenticated user.
 * Query params: ?limit=20&cursor=<lastResultId>
 */
export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
        const cursor = searchParams.get('cursor');

        const prisma = getPrisma();
        const scanResults = await prisma.scanResult.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // Fetch one extra to detect if there are more pages
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
                id: true,
                filename: true,
                type: true,
                wordCount: true,
                sentenceCount: true,
                overallLabel: true,
                breakdown: true,
                createdAt: true,
                // Exclude 'chunks' from list view — it can be megabytes of JSON
            }
        });

        const hasMore = scanResults.length > limit;
        const results = hasMore ? scanResults.slice(0, limit) : scanResults;
        const nextCursor = hasMore ? results[results.length - 1].id : null;

        return NextResponse.json({
            results,
            nextCursor,
            hasMore,
        });
    } catch (error) {
        console.error('[ScanResults] Error fetching:', error);
        return NextResponse.json({ error: 'Failed to fetch scan results' }, { status: 500 });
    }
}

/**
 * POST /api/scan-results
 * Persists a completed scan for the authenticated user (enables history + PDF download).
 * Guests are silently rejected (401) — useAnalyze fires this best-effort and ignores it.
 */
export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { filename, type, wordCount, sentenceCount, overallLabel, breakdown, chunks } = body;

        if (!Array.isArray(chunks) || chunks.length === 0 || !overallLabel) {
            return NextResponse.json({ error: 'Invalid scan payload' }, { status: 400 });
        }

        const prisma = getPrisma();
        const saved = await prisma.scanResult.create({
            data: {
                userId: session.user.id,
                filename: filename || 'Pasted Text',
                type: type === 'DOCUMENT' ? 'DOCUMENT' : 'TEXT',
                wordCount: Number(wordCount) || 0,
                sentenceCount: Number(sentenceCount) || chunks.length,
                overallLabel,
                breakdown: breakdown || {},
                chunks, // full per-sentence chunks — needed to regenerate the PDF report
            },
            select: { id: true, createdAt: true },
        });

        return NextResponse.json({ id: saved.id, createdAt: saved.createdAt });
    } catch (error) {
        console.error('[ScanResults] Error saving:', error);
        return NextResponse.json({ error: 'Failed to save scan result' }, { status: 500 });
    }
}
