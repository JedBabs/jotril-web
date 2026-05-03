export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minute timeout for long tuning runs
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import { prepareDocuments, buildScoreCache, runExhaustiveSearch, evaluateConfig } from '@/lib/auto-tuner';
import { getEngineConfig } from '@/lib/chunking';

// ── POST: Start a tuning run (SSE stream) ────────────────────────────────
export async function POST(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const prisma = getPrisma();

    // Fetch the dataset
    const dataset = await prisma.tuningDataset.findUnique({ where: { id } });
    if (!dataset) {
        return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Create a new tuning run
    const run = await prisma.tuningRun.create({
        data: { datasetId: id, status: 'CACHING', progress: 0 }
    });

    // Stream progress via SSE
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (event, data) => {
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch { /* stream closed */ }
            };

            try {
                // ── Step 1: Prepare documents ────────────────────────────
                send('progress', { phase: 'PREPARING', progress: 0, message: 'Preparing documents...' });
                const documents = prepareDocuments(dataset.samples);

                if (documents.length < 2) {
                    throw new Error('Need at least 2 valid documents to tune');
                }

                // ── Step 2: Build score cache (or reuse) ─────────────────
                let cache;

                if (dataset.scoreCache) {
                    send('progress', { phase: 'CACHING', progress: 50, message: 'Reusing cached model scores...' });
                    cache = dataset.scoreCache;
                } else {
                    send('progress', { phase: 'CACHING', progress: 0, message: 'Querying model for all documents...' });

                    await prisma.tuningRun.update({
                        where: { id: run.id },
                        data: { status: 'CACHING', progress: 0 }
                    });

                    cache = await buildScoreCache(documents, (progress, status) => {
                        send('progress', { phase: 'CACHING', progress, message: status });
                    });

                    // Persist cache to dataset for future runs
                    await prisma.tuningDataset.update({
                        where: { id },
                        data: { scoreCache: cache }
                    });
                }

                // ── Step 3: Evaluate current config as baseline ──────────
                send('progress', { phase: 'BASELINE', progress: 0, message: 'Evaluating current config as baseline...' });
                const currentConfig = await getEngineConfig();
                const baselineConfig = {
                    signalWeights: {
                        direct: currentConfig.direct?.weight ?? 0.30,
                        differential: currentConfig.differential?.weight ?? 0.43,
                        anchor: currentConfig.anchor?.weight ?? 0.27,
                    },
                    windowConfidence: currentConfig.windowConfidence,
                    anchorThreshold: currentConfig.anchorThreshold,
                    classification: currentConfig.classification,
                    smoothing: currentConfig.smoothing,
                    burstiness: currentConfig.burstiness,
                };
                const baselineMetrics = evaluateConfig(cache, baselineConfig);
                send('baseline', { config: baselineConfig, metrics: baselineMetrics });

                // ── Step 4: Run exhaustive grid search ───────────────────
                await prisma.tuningRun.update({
                    where: { id: run.id },
                    data: { status: 'TUNING', progress: 0 }
                });

                const searchResult = runExhaustiveSearch(cache, (progress, status, trialsRun) => {
                    send('progress', { phase: 'TUNING', progress, message: status, trialsRun });
                });

                // ── Step 5: Save results ─────────────────────────────────
                await prisma.tuningRun.update({
                    where: { id: run.id },
                    data: {
                        status: 'COMPLETE',
                        progress: 100,
                        bestConfig: searchResult.bestConfig,
                        bestAccuracy: searchResult.bestMetrics.accuracy,
                        bestMcc: searchResult.bestMetrics.mcc,
                        metrics: searchResult.bestMetrics,
                        trialCount: searchResult.trialCount,
                        log: searchResult.topTrials,
                        completedAt: new Date(),
                    }
                });

                send('complete', {
                    runId: run.id,
                    bestConfig: searchResult.bestConfig,
                    bestMetrics: searchResult.bestMetrics,
                    baselineMetrics,
                    trialCount: searchResult.trialCount,
                    topTrials: searchResult.topTrials.slice(0, 10),
                });

                controller.close();
            } catch (error) {
                console.error('[Auto-Tune Run] Error:', error);

                try {
                    await prisma.tuningRun.update({
                        where: { id: run.id },
                        data: { status: 'FAILED', error: error.message }
                    });
                } catch { /* ignore */ }

                send('error', { error: error.message });
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    });
}

// ── GET: Get the latest run results for a dataset ────────────────────────
export async function GET(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const prisma = getPrisma();

    const run = await prisma.tuningRun.findFirst({
        where: { datasetId: id },
        orderBy: { createdAt: 'desc' },
    });

    if (!run) {
        return NextResponse.json({ error: 'No runs found for this dataset' }, { status: 404 });
    }

    return NextResponse.json({ run });
}
