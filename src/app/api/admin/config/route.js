export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { invalidateEngineConfigCache } from '@/lib/chunking';

// Default engine configuration — serves as the fallback when no DB row exists
export const DEFAULT_CONFIG = {
    signalWeights: {
        direct: 0.30,
        differential: 0.43,
        anchor: 0.27
    },
    windowConfidence: {
        'window-1': 0.15,
        'window-2': 0.50,
        'window-3': 0.85,
        'window-4': 0.95,
        'window-5': 0.98,
        'leave-one-out': 0.99,
        'paragraph': 1.00
    },
    anchorThreshold: 0.85,
    classification: {
        humanMax: 62,
        mixedMax: 75
    },
    smoothing: {
        maxNudge: 25
    },
    burstiness: {
        lowThreshold: 7,
        highThreshold: 12,
        lowNudge: 5,
        highNudge: 10
    }
};

// GET: Return the current engine config + undo availability
export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        const row = await prisma.engineConfig.findUnique({ where: { id: 'global' } });
        const config = row?.data || DEFAULT_CONFIG;
        const canUndo = !!row?.previousData;
        return NextResponse.json({ config, defaults: DEFAULT_CONFIG, canUndo });
    } catch (error) {
        console.error('[Admin Config] GET error:', error);
        return NextResponse.json({ config: DEFAULT_CONFIG, defaults: DEFAULT_CONFIG, canUndo: false });
    }
}

// PATCH: Update the engine config (snapshots old config for undo)
export async function PATCH(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { config } = body;

        if (!config || typeof config !== 'object') {
            return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
        }

        const prisma = getPrisma();

        // Fetch the current config to save as previousData
        const existing = await prisma.engineConfig.findUnique({ where: { id: 'global' } });
        const previousData = existing?.data || DEFAULT_CONFIG;

        const updated = await prisma.engineConfig.upsert({
            where: { id: 'global' },
            update: { data: config, previousData },
            create: { id: 'global', data: config, previousData }
        });

        // Invalidate the in-memory cache so the next scan uses the new config
        invalidateEngineConfigCache();

        return NextResponse.json({ success: true, config: updated.data, canUndo: true });
    } catch (error) {
        console.error('[Admin Config] PATCH error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Undo — swap previousData back to data
export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        const existing = await prisma.engineConfig.findUnique({ where: { id: 'global' } });

        if (!existing?.previousData) {
            return NextResponse.json({ error: 'No previous config to undo to' }, { status: 400 });
        }

        // Swap: current becomes previous, previous becomes current
        const updated = await prisma.engineConfig.update({
            where: { id: 'global' },
            data: {
                data: existing.previousData,
                previousData: existing.data
            }
        });

        invalidateEngineConfigCache();

        return NextResponse.json({ success: true, config: updated.data, canUndo: true });
    } catch (error) {
        console.error('[Admin Config] POST (undo) error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
