export const maxDuration = 300; // 5 minute timeout
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { after } from 'next/server';
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

    // Clean up ALL old dead runs for this dataset so they don't confuse the SSE poller
    await prisma.tuningRun.deleteMany({
        where: { datasetId: id, status: { in: ['FAILED', 'CANCELLED'] } }
    });

    // Create a new tuning run
    const run = await prisma.tuningRun.create({
        data: { datasetId: id, status: 'PENDING', progress: 0 }
    });

    // Start tuning in background
    after(() => {
        runTuningInBackground(run.id, id, dataset.samples);
    });

    return NextResponse.json({ success: true, runId: run.id });
}

/**
 * Background worker for the tuning process.
 * Updates the database persistently so it survives browser closure.
 */
async function runTuningInBackground(runId, datasetId, rawSamples) {
    const startTime = Date.now();

    const prisma = getPrisma();
    console.log(`🚀 [Auto-Tune] Background run ${runId} started.`);

    // ── Cancellation gate ──────────────────────────────────────────────
    // Periodically checks the DB to see if the admin force-stopped this run.
    // Only triggers on explicit CANCELLED status (set by the /cancel endpoint).
    let lastCancelCheck = Date.now();
    const CANCEL_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds at most
    async function assertNotCancelled() {
        const now = Date.now();
        if (now - lastCancelCheck < CANCEL_CHECK_INTERVAL_MS) return;
        lastCancelCheck = now;
        try {
            const current = await prisma.tuningRun.findUnique({
                where: { id: runId },
                select: { status: true }
            });
            // ONLY cancel on explicit CANCELLED status — NOT on FAILED
            // (FAILED can be set by our own error handler, causing a feedback loop)
            if (!current || current.status === 'CANCELLED') {
                throw new Error('CANCELLED');
            }
        } catch (e) {
            if (e.message === 'CANCELLED') throw e;
            // DB hiccup — don't kill the run for a transient read error
        }
    }

    try {
        // 1. Prepare documents
        const documents = prepareDocuments(rawSamples);
        if (documents.length < 2) throw new Error('Need at least 2 valid documents to tune');

        // 2. Build or reuse score cache
        const dataset = await prisma.tuningDataset.findUnique({ where: { id: datasetId } });
        let cache;

        // ── Time-based throttle to avoid hammering the DB ──
        let lastDbUpdate = Date.now();
        const DB_UPDATE_INTERVAL_MS = 2500; // Update DB at most every 2.5 seconds

        if (dataset.scoreCache) {
            cache = dataset.scoreCache;
        } else {
            await prisma.tuningRun.update({
                where: { id: runId },
                data: { status: 'CACHING', progress: 10, message: '🔍 Analyzing linguistic patterns for cache (Phase 1)...' }
            });

            cache = await buildScoreCache(documents, async (progress, status) => {
                await assertNotCancelled();
                const now = Date.now();
                if (now - lastDbUpdate >= DB_UPDATE_INTERVAL_MS || progress >= 99) {
                    lastDbUpdate = now;
                    try {
                        await prisma.tuningRun.update({
                            where: { id: runId },
                            data: { status: 'CACHING', progress: Math.max(10, progress), error: null, message: status }
                        });
                    } catch (dbErr) {
                        console.warn(`[Auto-Tune] Cache progress update failed:`, dbErr.message);
                    }
                }
            });

            await prisma.tuningDataset.update({
                where: { id: datasetId },
                data: { scoreCache: cache }
            });
        }

        await assertNotCancelled();

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
        // Deadline is set HERE (not at function start) so the grid search gets its own
        // full time window, regardless of how long caching took.
        const gridDeadline = Date.now() + 270000; // 4.5 minutes for grid search phase

        await prisma.tuningRun.update({
            where: { id: runId },
            data: { status: 'TUNING', progress: 0, message: '🧠 Optimizing 50,000+ configurations (Phase 2)...' }
        });

        const searchResult = await runExhaustiveSearch(cache, async (progress, status, trialsRun) => {
            await assertNotCancelled();
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
                    console.warn(`[Auto-Tune] Grid search progress update failed:`, dbErr.message);
                }
            }
        }, gridDeadline);

        // 5. Final cancel check before writing COMPLETE (don't resurrect a cancelled run)
        await assertNotCancelled();

        // 6. Finalize — include baseline and train/test metrics for before/after comparison
        await prisma.tuningRun.update({
            where: { id: runId },
            data: {
                status: 'COMPLETE',
                progress: 100,
                bestConfig: searchResult.bestConfig,
                bestAccuracy: searchResult.testMetrics?.accuracy ?? searchResult.bestMetrics.accuracy,
                bestMcc: searchResult.testMetrics?.mcc ?? searchResult.bestMetrics.mcc,
                metrics: {
                    ...searchResult.bestMetrics,
                    baseline: baselineMetrics,
                    train: searchResult.trainMetrics,
                    test: searchResult.testMetrics,
                    splitInfo: searchResult.splitInfo,
                },
                trialCount: searchResult.trialCount,
                log: searchResult.topTrials,
                completedAt: new Date(),
                message: `✅ ${searchResult.trialCount} trials | Train: ${searchResult.trainMetrics?.accuracy}% | Test: ${searchResult.testMetrics?.accuracy}% | MCC: ${searchResult.testMetrics?.mcc}`
            }
        });

        console.log(`✅ [Auto-Tune] Background run ${runId} complete. Train: ${searchResult.trainMetrics?.accuracy}% | Test: ${searchResult.testMetrics?.accuracy}%`);

    } catch (error) {
        if (error.message === 'CANCELLED') {
            console.log(`🛑 [Auto-Tune] Background run ${runId} detected cancellation. Stopping gracefully.`);
            return; // Don't overwrite the CANCELLED status that the cancel route already set
        }
        console.error(`❌ [Auto-Tune] Background run ${runId} failed:`, error);
        try {
            // Only set FAILED if it hasn't already completed
            const currentRun = await prisma.tuningRun.findUnique({ where: { id: runId }, select: { status: true } });
            if (currentRun && currentRun.status !== 'COMPLETE' && currentRun.status !== 'CANCELLED') {
                await prisma.tuningRun.update({
                    where: { id: runId },
                    data: { status: 'FAILED', error: error.message?.substring(0, 500) || 'Unknown error' }
                });
            }
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
                // Prioritize active runs; only fall back to latest if none active
                let run = await prisma.tuningRun.findFirst({
                    where: { datasetId: id, status: { in: ['PENDING', 'CACHING', 'TUNING'] } },
                    orderBy: { createdAt: 'desc' }
                });
                if (!run) {
                    run = await prisma.tuningRun.findFirst({
                        where: { datasetId: id },
                        orderBy: { createdAt: 'desc' }
                    });
                }

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

                if (run.status === 'COMPLETE' || run.status === 'FAILED' || run.status === 'CANCELLED') {
                    clearInterval(pollInterval);
                    controller.close();
                }
            }, 5000); // Poll DB every 5 seconds for SSE relay

            req.signal.addEventListener('abort', () => clearInterval(pollInterval));
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Content-Encoding': 'none',
        }
    });
}
