export const maxDuration = 300; // 5 minute timeout
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prepareDocuments, buildScoreCache, runExhaustiveSearch, evaluateConfig } from '@/lib/auto-tuner';
import { getEngineConfig } from '@/lib/chunking';

// ── POST: Start a tuning run (Returns immediately) ───────────────────────
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

    // Check if there's already an active run for this dataset
    const activeRun = await prisma.tuningRun.findFirst({
        where: { datasetId: id, status: { in: ['PENDING', 'CACHING', 'TUNING'] } }
    });

    if (activeRun) {
        return NextResponse.json({ success: true, runId: activeRun.id, message: 'Continuing active run' });
    }

    // Create a new tuning run
    const run = await prisma.tuningRun.create({
        data: { datasetId: id, status: 'PENDING', progress: 0 }
    });

    // Start tuning in background (don't await)
    runTuningInBackground(run.id, id, dataset.samples);

    return NextResponse.json({ success: true, runId: run.id });
}

/**
 * Background worker for the tuning process.
 * Updates the database persistently so it survives browser closure.
 */
async function runTuningInBackground(runId, datasetId, rawSamples) {
    const prisma = getPrisma();
    console.log(`🚀 [Auto-Tune] Background run ${runId} started.`);

    try {
        // 1. Prepare documents
        const documents = prepareDocuments(rawSamples);
        if (documents.length < 2) throw new Error('Need at least 2 valid documents to tune');

        // 2. Build or reuse score cache
        const dataset = await prisma.tuningDataset.findUnique({ where: { id: datasetId } });
        let cache;

        if (dataset.scoreCache) {
            cache = dataset.scoreCache;
        } else {
            await prisma.tuningRun.update({
                where: { id: runId },
                data: { status: 'CACHING', progress: 10, message: '🔍 Analyzing linguistic patterns for cache (Phase 1)...' }
            });

            cache = await buildScoreCache(documents, async (progress, status) => {
                await prisma.tuningRun.update({
                    where: { id: runId },
                    data: { status: 'CACHING', progress: Math.max(10, progress), error: null, message: status }
                });
            });

            await prisma.tuningDataset.update({
                where: { id: datasetId },
                data: { scoreCache: cache }
            });
        }

        // 3. Baseline — evaluate current production config for before/after comparison
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

        // 4. Grid Search (now async — yields event loop and awaits progress callbacks)
        await prisma.tuningRun.update({
            where: { id: runId },
            data: { status: 'TUNING', progress: 0, message: '🧠 Optimizing 50,000+ configurations (Phase 2)...' }
        });

        // Time-based throttle to avoid hammering the DB
        let lastDbUpdate = Date.now();
        const DB_UPDATE_INTERVAL_MS = 3000; // Update DB at most every 3 seconds

        const searchResult = await runExhaustiveSearch(cache, async (progress, status, trialsRun) => {
            const now = Date.now();
            if (now - lastDbUpdate >= DB_UPDATE_INTERVAL_MS || progress === 100) {
                lastDbUpdate = now;
                try {
                    await prisma.tuningRun.update({
                        where: { id: runId },
                        data: {
                            progress,
                            trialCount: trialsRun,
                            message: `🧠 ${status}`
                        }
                    });
                } catch (dbErr) {
                    console.warn(`[Auto-Tune] Progress update failed (non-fatal):`, dbErr.message);
                }
            }
        });

        // 5. Finalize — include baseline metrics for before/after comparison
        await prisma.tuningRun.update({
            where: { id: runId },
            data: {
                status: 'COMPLETE',
                progress: 100,
                bestConfig: searchResult.bestConfig,
                bestAccuracy: searchResult.bestMetrics.accuracy,
                bestMcc: searchResult.bestMetrics.mcc,
                metrics: {
                    ...searchResult.bestMetrics,
                    baseline: baselineMetrics,
                },
                trialCount: searchResult.trialCount,
                log: searchResult.topTrials,
                completedAt: new Date(),
                message: `✅ Complete! Accuracy: ${baselineMetrics.accuracy}% → ${searchResult.bestMetrics.accuracy}% | MCC: ${baselineMetrics.mcc} → ${searchResult.bestMetrics.mcc}`
            }
        });

        console.log(`✅ [Auto-Tune] Background run ${runId} complete. Baseline: ${baselineMetrics.accuracy}% → Best: ${searchResult.bestMetrics.accuracy}%`);

    } catch (error) {
        console.error(`❌ [Auto-Tune] Background run ${runId} failed:`, error);
        try {
            await prisma.tuningRun.update({
                where: { id: runId },
                data: { status: 'FAILED', error: error.message }
            });
        } catch (dbErr) {
            console.error(`❌ [Auto-Tune] Failed to update run status:`, dbErr.message);
        }
    }
}

// ── GET: Persistent Status Stream (SSE) ──────────────────────────────────
export async function GET(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const prisma = getPrisma();

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (data) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch { /* stream closed */ }
            };

            let lastProgress = -1;
            let lastStatus = '';

            const pollInterval = setInterval(async () => {
                const run = await prisma.tuningRun.findFirst({
                    where: { datasetId: id },
                    orderBy: { createdAt: 'desc' }
                });

                if (!run) {
                    send({ error: 'No active run' });
                    clearInterval(pollInterval);
                    controller.close();
                    return;
                }

                // If updated, send to client
                if (run.progress !== lastProgress || run.status !== lastStatus) {
                    send({
                        id: run.id,
                        status: run.status,
                        progress: run.progress,
                        message: run.message,
                        trialCount: run.trialCount,
                        bestAccuracy: run.bestAccuracy,
                        bestMcc: run.bestMcc,
                        error: run.error,
                        completedAt: run.completedAt,
                        bestConfig: run.bestConfig,
                        metrics: run.metrics,
                        log: run.log ? run.log.slice(0, 5) : []
                    });
                    lastProgress = run.progress;
                    lastStatus = run.status;
                }

                if (run.status === 'COMPLETE' || run.status === 'FAILED') {
                    clearInterval(pollInterval);
                    controller.close();
                }
            }, 1000); // Poll DB every second for SSE relay

            req.signal.addEventListener('abort', () => clearInterval(pollInterval));
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
