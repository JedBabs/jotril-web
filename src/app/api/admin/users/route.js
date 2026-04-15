export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

// Retrieve all users for the admin dash
export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [users, totalScans, todayScans, totalPointsAgg, todayPointsAgg] = await Promise.all([
            prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    createdAt: true,
                    purchasedPoints: true,
                    _count: { select: { quotaUsages: true } },
                    quotaUsages: { select: { pointsCost: true } }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.quotaUsage.count(),
            prisma.quotaUsage.count({ where: { createdAt: { gte: today } } }),
            prisma.quotaUsage.aggregate({ _sum: { pointsCost: true } }),
            prisma.quotaUsage.aggregate({ where: { createdAt: { gte: today } }, _sum: { pointsCost: true } })
        ]);

        const processedUsers = users.map(user => {
            const totalPointsSpent = user.quotaUsages.reduce((sum, usage) => sum + (usage.pointsCost || 0), 0);
            return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
                purchasedPoints: user.purchasedPoints,
                requestsMade: user._count.quotaUsages,
                pointsSpent: totalPointsSpent // compute client side total point usages
            };
        });

        const tierBreakdown = { FREE: 0, PRO: 0, ULTRA: 0, ADMIN: 0 };
        users.forEach(u => {
            if (tierBreakdown[u.role] !== undefined) tierBreakdown[u.role]++;
        });

        const platformStats = {
            totalUsers: users.length,
            tierBreakdown,
            scansAllTime: totalScans,
            scansToday: todayScans,
            pointsAllTime: totalPointsAgg._sum.pointsCost || 0,
            pointsToday: todayPointsAgg._sum.pointsCost || 0
        };

        return NextResponse.json({ users: processedUsers, stats: platformStats });
    } catch (error) {
        console.error('[Admin] Error fetching users:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Update a user's role or purchasedPoints
export async function PATCH(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { userId, role, addPurchasedPoints } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const updateData = {};

        if (role) {
            if (!['FREE', 'PRO', 'ULTRA', 'ADMIN'].includes(role)) {
                return NextResponse.json({ error: 'Invalid role payload' }, { status: 400 });
            }
            // Prevent self demotion to avoid locking out the only admin
            if (userId === session.user.id && role !== 'ADMIN') {
                return NextResponse.json({ error: 'Cannot demote your own admin account' }, { status: 400 });
            }
            updateData.role = role;
        }

        if (typeof addPurchasedPoints === 'number' && addPurchasedPoints > 0) {
            updateData.purchasedPoints = {
                increment: addPurchasedPoints
            };
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No valid update data provided' }, { status: 400 });
        }

        const prisma = getPrisma();
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, role: true, purchasedPoints: true }
        });

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('[Admin] Error updating user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
