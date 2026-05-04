export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';

export async function POST(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const prisma = getPrisma();

        const run = await prisma.tuningRun.findUnique({
            where: { id }
        });

        if (!run) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }

        if (run.status === 'COMPLETE' || run.status === 'FAILED') {
            return NextResponse.json({ error: 'Run is already finished' }, { status: 400 });
        }

        await prisma.tuningRun.update({
            where: { id },
            data: {
                status: 'FAILED',
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
