export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

/**
 * GET /api/dashboard
 * Returns real stats for the authenticated user's dashboard.
 */
export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const prisma = getPrisma();
        const userId = session.user.id;

        // NOTE: the dev-admin user row is created at login (authorize() in the NextAuth
        // config), so we no longer upsert it here — that was a redundant sequential
        // write on every dashboard load. If the row is ever missing, the reads below
        // just return zeros/null until the next sign-in recreates it (no crash).

        // Only the reads the dashboard UI actually renders, in one parallel wave.
        // (Dropped: apiKey.count and the QuotaUsage "recent activity" findMany — both
        // were fetched but never displayed; the "Previous Uploads" table uses
        // pastScanResults. This takes the request from 6 reads + 1 write to 4 reads.)
        const [totalRequests, totalPoints, user, pastScanResults] = await Promise.all([
            prisma.quotaUsage.count({ where: { userId } }),
            prisma.quotaUsage.aggregate({ _sum: { pointsCost: true }, where: { userId } }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { role: true, purchasedPoints: true, email: true }
            }),
            prisma.scanResult.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    filename: true,
                    type: true,
                    wordCount: true,
                    sentenceCount: true,
                    overallLabel: true,
                    breakdown: true,
                    createdAt: true,
                }
            }),
        ]);

        return NextResponse.json({
            totalRequests,
            totalPointsSpent: totalPoints._sum.pointsCost || 0,
            tier: user?.role || 'FREE',
            purchasedPoints: user?.purchasedPoints || 0,
            email: user?.email,
            pastScanResults
        });
    } catch (error) {
        console.error('[Dashboard] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
