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

        // Bypass for Dev Admin (who doesn't exist in the database)
        if (userId === 'dev-admin-id') {
            return NextResponse.json({
                totalRequests: 0,
                totalPointsSpent: 0,
                keyCount: 0,
                tier: 'ADMIN',
                purchasedPoints: 999999,
                email: 'dev@antigravity.local',
                name: 'Dev Admin',
                memberSince: new Date().toISOString(),
                recentScans: [],
                pastScanResults: []
            });
        }

        // Total analysis requests
        const totalRequests = await prisma.quotaUsage.count({
            where: { userId }
        });

        // Total points spent (all time)
        const totalPoints = await prisma.quotaUsage.aggregate({
            _sum: { pointsCost: true },
            where: { userId }
        });

        // API key count
        const keyCount = await prisma.apiKey.count({
            where: { userId }
        });

        // User details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, purchasedPoints: true, email: true, name: true, createdAt: true }
        });

        // Recent activity
        const recentScans = await prisma.quotaUsage.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                pointsCost: true,
                createdAt: true,
                size: true
            }
        });

        // Past scan results — exclude massive 'chunks' JSON to keep response lightweight
        const pastScanResults = await prisma.scanResult.findMany({
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
        });

        return NextResponse.json({
            totalRequests,
            totalPointsSpent: totalPoints._sum.pointsCost || 0,
            keyCount,
            tier: user?.role || 'FREE',
            purchasedPoints: user?.purchasedPoints || 0,
            email: user?.email,
            name: user?.name,
            memberSince: user?.createdAt,
            recentScans,
            pastScanResults
        });
    } catch (error) {
        console.error('[Dashboard] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
