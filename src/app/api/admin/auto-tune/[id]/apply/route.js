export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { invalidateEngineConfigCache } from '@/lib/chunking';

// ── POST: Apply the best config from a completed tuning run ──────────────
export async function POST(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const prisma = getPrisma();

    // Find the latest completed run for this dataset
    const run = await prisma.tuningRun.findFirst({
        where: { datasetId: id, status: 'COMPLETE' },
        orderBy: { createdAt: 'desc' },
    });

    if (!run || !run.bestConfig) {
        return NextResponse.json({ error: 'No completed tuning run found' }, { status: 404 });
    }

    try {
        // Snapshot the current config for undo
        const existing = await prisma.engineConfig.findUnique({ where: { id: 'global' } });
        const previousData = existing?.data || null;

        // The tuner only optimizes detection params (signalWeights, windowConfidence,
        // anchorThreshold, classification, smoothing, burstiness) — it has no `budget`
        // key. A wholesale overwrite would silently reset the budget-governor block to
        // defaults, so carry the existing budget settings forward.
        const mergedConfig = { ...run.bestConfig };
        if (existing?.data?.budget) mergedConfig.budget = existing.data.budget;

        // Apply the tuned config
        await prisma.engineConfig.upsert({
            where: { id: 'global' },
            update: { data: mergedConfig, previousData },
            create: { id: 'global', data: mergedConfig, previousData },
        });

        // Invalidate in-memory cache
        invalidateEngineConfigCache();

        return NextResponse.json({
            success: true,
            config: run.bestConfig,
            accuracy: run.bestAccuracy,
            mcc: run.bestMcc,
            canUndo: !!previousData,
        });
    } catch (error) {
        console.error('[Auto-Tune Apply] Error:', error);
        return NextResponse.json({ error: 'Failed to apply config' }, { status: 500 });
    }
}
