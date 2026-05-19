export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import path from 'path';

// ── POST: Upload a new training dataset ──────────────────────────────────
export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { name, samples, source } = body;
        const prisma = getPrisma();

        let finalSamples = [];
        let finalName = name;

        if (source === 'split-public') {
            for (let i = 1; i <= 4; i++) {
                const chunkPath = path.join(process.cwd(), 'public', `tuning_baseline_part_${i}.json`);
                if (!fs.existsSync(chunkPath)) {
                    return NextResponse.json({ error: `Missing dataset part ${i}` }, { status: 404 });
                }
                const content = fs.readFileSync(chunkPath, 'utf8');
                finalSamples.push(...JSON.parse(content));
            }
            finalName = name || 'Internal Baseline Dataset';
        } else if (source === 'local') {
            // Priority: Project Root, Fallback: Parent Dir
            let datasetPath = path.join(process.cwd(), 'test_dataset.json');
            if (!fs.existsSync(datasetPath)) {
                datasetPath = path.join(process.cwd(), '..', 'test_dataset.json');
            }

            if (!fs.existsSync(datasetPath)) {
                return NextResponse.json({ error: 'Local test_dataset.json not found' }, { status: 404 });
            }

            const fileContent = fs.readFileSync(datasetPath, 'utf8');
            const allSamples = JSON.parse(fileContent);

            // Smarter Sampling: Pick 2000 total (1000 Human, 1000 AI)
            // To ensure diversity, we'll take top & bottom from each category
            const humanPool = allSamples.filter(s => s.label?.toLowerCase() === 'human');
            const aiPool = allSamples.filter(s => s.label?.toLowerCase() === 'ai');

            const pickFromPool = (pool, count) => {
                if (pool.length <= count) return pool;
                // Strided sampling: pick evenly spaced items across the full pool
                const stride = pool.length / count;
                const picked = [];
                for (let i = 0; i < count; i++) {
                    picked.push(pool[Math.floor(i * stride)]);
                }
                return picked;
            };

            finalSamples = [
                ...pickFromPool(humanPool, 200),
                ...pickFromPool(aiPool, 200)
            ];

            finalName = name || 'Master Dataset';
        } else {
            if (!name || !samples || !Array.isArray(samples) || samples.length === 0) {
                return NextResponse.json({ error: 'Name and a non-empty samples array are required' }, { status: 400 });
            }
            finalSamples = samples;
        }

        // Validate samples have text and label
        const validSamples = finalSamples.filter(s =>
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

        const dataset = await prisma.tuningDataset.create({
            data: {
                name: finalName,
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

        // 1. Check for "Master Dataset" and test_dataset.json file
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

        const masterExists = datasets.some(ds => ds.name === 'Master Dataset');

        const visibleFiles = fs.readdirSync(process.cwd());
        const possiblePaths = [
            path.join(process.cwd(), 'test_dataset.json'),
            path.join(process.cwd(), 'jotril-web', 'test_dataset.json'),
            path.join(process.cwd(), '..', 'test_dataset.json')
        ];

        let datasetPath = possiblePaths.find(p => fs.existsSync(p));

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

        return NextResponse.json({
            datasets: result,
            hasLocalDataset: !!datasetPath && !masterExists,
            debugPath: datasetPath || 'None found',
            cwd: process.cwd(),
            visibleFiles: visibleFiles.slice(0, 10) // Show first 10 for safety
        });
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

        // Guard: prevent deleting a dataset with an active tuning run
        const activeRun = await prisma.tuningRun.findFirst({
            where: { datasetId: id, status: { in: ['PENDING', 'CACHING', 'TUNING'] } }
        });
        if (activeRun) {
            return NextResponse.json({ error: 'Cannot delete dataset while a tuning run is active' }, { status: 409 });
        }

        await prisma.tuningDataset.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Auto-Tune] DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 });
    }
}
