export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

/**
 * GET /api/scan-results
 * Fetch all previous scan results for the authenticated user
 */
export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const prisma = getPrisma();
        const scanResults = await prisma.scanResult.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(scanResults);
    } catch (error) {
        console.error('[ScanResults] Error fetching:', error);
        return NextResponse.json({ error: 'Failed to fetch scan results' }, { status: 500 });
    }
}
