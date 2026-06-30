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
                include: { user: { select: { email: true, role: true } } },
            }),
            prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);

        const hasMore = items.length > PAGE_SIZE;
        const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

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
