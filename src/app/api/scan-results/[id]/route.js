export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

/**
 * GET /api/scan-results/[id]
 * Fetch a single scan result by ID, including full chunks data.
 * Used for on-demand PDF generation from the "Previous Uploads" table.
 */
export async function GET(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const prisma = getPrisma();

        const scanResult = await prisma.scanResult.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                filename: true,
                type: true,
                wordCount: true,
                sentenceCount: true,
                overallLabel: true,
                breakdown: true,
                chunks: true,
                createdAt: true,
            }
        });

        if (!scanResult) {
            return NextResponse.json({ error: 'Scan result not found' }, { status: 404 });
        }

        // Ensure users can only access their own scans
        if (scanResult.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json(scanResult);
    } catch (error) {
        console.error('[ScanResults] Error fetching by ID:', error);
        return NextResponse.json({ error: 'Failed to fetch scan result' }, { status: 500 });
    }
}
