export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'WONTFIX'];
const PAGE_SIZE = 50;

// GET — list feedback for the admin triage page. Optional ?status= & ?cursor=.
export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const cursor = searchParams.get('cursor');

        const where = {};
        if (status && STATUSES.includes(status)) where.status = status;

        const [items, counts] = await Promise.all([
            prisma.feedback.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: PAGE_SIZE + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                // Explicit select so the heavy `screenshot` base64 is NEVER loaded into
                // the list (it's fetched lazily per item via GET /api/admin/feedback/[id]).
                select: {
                    id: true, category: true, message: true, rating: true, status: true,
                    adminNote: true, pageUrl: true, email: true, createdAt: true,
                    user: { select: { email: true, role: true } },
                },
            }),
            prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);

        const hasMore = items.length > PAGE_SIZE;
        const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

        // Which of these rows actually carry a screenshot — a cheap id-only probe
        // (no blobs transferred). Tolerates the column not being pushed yet.
        let screenshotIds = new Set();
        try {
            const withShots = await prisma.feedback.findMany({
                where: { id: { in: page.map((f) => f.id) }, NOT: { screenshot: null } },
                select: { id: true },
            });
            screenshotIds = new Set(withShots.map((f) => f.id));
        } catch { /* screenshot column not present yet — none flagged */ }

        const statusCounts = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, WONTFIX: 0 };
        counts.forEach((c) => {
            if (statusCounts[c.status] !== undefined) statusCounts[c.status] = c._count._all;
        });

        return NextResponse.json({
            items: page.map((f) => ({
                id: f.id,
                category: f.category,
                message: f.message,
                rating: f.rating,
                status: f.status,
                adminNote: f.adminNote,
                pageUrl: f.pageUrl,
                email: f.email || f.user?.email || null,
                userRole: f.user?.role || null,
                hasScreenshot: screenshotIds.has(f.id),
                createdAt: f.createdAt,
            })),
            nextCursor: hasMore ? page[page.length - 1].id : null,
            counts: statusCounts,
        });
    } catch (error) {
        console.error('[Admin Feedback] GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
