export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

export async function POST(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const prisma = getPrisma();

        // The frontend may send either a run ID or a dataset ID.
        // Try to find the run directly first, then fall back to finding
        // the latest run for the given dataset ID.
        let run = await prisma.tuningRun.findUnique({ where: { id } });

        if (!run) {
            // Fallback: treat `id` as a dataset ID and find its latest run
            run = await prisma.tuningRun.findFirst({
                where: { datasetId: id },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!run) {
            return NextResponse.json({ error: 'No tuning run found for this ID' }, { status: 404 });
        }

        // If the run already finished (COMPLETE or FAILED), delete it so
        // the user can start a fresh run on the same dataset.
        if (run.status === 'COMPLETE' || run.status === 'FAILED' || run.status === 'CANCELLED') {
            await prisma.tuningRun.delete({ where: { id: run.id } });
            return NextResponse.json({ success: true, message: 'Finished run cleared successfully.' });
        }

        // Otherwise, mark the active run as CANCELLED (force-stop).
        await prisma.tuningRun.update({
            where: { id: run.id },
            data: {
                status: 'CANCELLED',
                error: 'Run forcefully cancelled by administrator.',
                completedAt: new Date()
            }
        });

        return NextResponse.json({ success: true, message: 'Run cancelled successfully.' });
    } catch (error) {
        console.error('[AutoTune Cancel] Error:', error);
        return NextResponse.json({ error: 'Failed to cancel the run' }, { status: 500 });
    }
}
