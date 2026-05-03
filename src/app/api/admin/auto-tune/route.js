export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

// ── POST: Upload a new training dataset ──────────────────────────────────
export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { name, samples } = body;

        if (!name || !samples || !Array.isArray(samples) || samples.length === 0) {
            return NextResponse.json({ error: 'Name and a non-empty samples array are required' }, { status: 400 });
        }

        // Validate samples have text and label
        const validSamples = samples.filter(s =>
            s.text && typeof s.text === 'string' && s.text.trim().length > 0 &&
            s.label && ['human', 'ai'].includes(s.label.toLowerCase())
        ).map(s => ({
            text: s.text.trim(),
            label: s.label.toLowerCase(),
            ...(s.format === 'sentence' ? { format: 'sentence' } : {}),
        }));

        if (validSamples.length === 0) {
            return NextResponse.json({
                error: 'No valid samples found. Each sample needs a "text" string and a "label" of "human" or "ai".'
            }, { status: 400 });
        }

        const humanCount = validSamples.filter(s => s.label === 'human').length;
        const aiCount = validSamples.filter(s => s.label === 'ai').length;

        const prisma = getPrisma();
        const dataset = await prisma.tuningDataset.create({
            data: {
                name,
                samples: validSamples,
                sampleCount: validSamples.length,
            }
        });

        return NextResponse.json({
            success: true,
            dataset: {
                id: dataset.id,
                name: dataset.name,
                sampleCount: dataset.sampleCount,
                humanCount,
                aiCount,
                createdAt: dataset.createdAt,
            }
        });
    } catch (error) {
        console.error('[Auto-Tune] POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── GET: List all datasets and their latest tuning runs ──────────────────
export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        const datasets = await prisma.tuningDataset.findMany({
            include: {
                runs: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        progress: true,
                        bestAccuracy: true,
                        bestMcc: true,
                        trialCount: true,
                        createdAt: true,
                        completedAt: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
        });

        const result = datasets.map(ds => {
            const samples = ds.samples || [];
            const humanCount = Array.isArray(samples) ? samples.filter(s => s.label === 'human').length : 0;
            const aiCount = Array.isArray(samples) ? samples.filter(s => s.label === 'ai').length : 0;

            return {
                id: ds.id,
                name: ds.name,
                sampleCount: ds.sampleCount,
                humanCount,
                aiCount,
                hasCachedScores: !!ds.scoreCache,
                latestRun: ds.runs[0] || null,
                createdAt: ds.createdAt,
            };
        });

        return NextResponse.json({ datasets: result });
    } catch (error) {
        console.error('[Auto-Tune] GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── DELETE: Remove a dataset ─────────────────────────────────────────────
export async function DELETE(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Dataset ID is required' }, { status: 400 });
        }

        const prisma = getPrisma();
        await prisma.tuningDataset.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Auto-Tune] DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 });
    }
}
