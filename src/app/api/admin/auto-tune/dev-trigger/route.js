export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { runExhaustiveSearch } from '@/lib/auto-tuner';
import { after } from 'next/server';

// Same heartbeat-staleness threshold as the main /run route. An "active" run
// untouched for this long is presumed dead (worker process gone) and reclaimed.
const STALE_RUN_MS = 120_000; // 2 min

// Local-dev escape hatch: runs the grid search to FULL exhaustion (no deadline)
// against an ALREADY-cached dataset. Shares the same TuningRun lifecycle as the
// main /run route — it no longer keeps a fragile in-memory lock and no longer
// wipes COMPLETE history (it only reclaims dead runs + clears prior dead rows).
export async function GET(req) {
    const prisma = getPrisma();
    const dataset = await prisma.tuningDataset.findFirst();
    if (!dataset || !dataset.scoreCache) {
        return NextResponse.json({ error: 'No dataset or score cache found' }, { status: 404 });
    }

    // Refuse if a genuinely-live run exists; reclaim it if its heartbeat is stale.
    const active = await prisma.tuningRun.findFirst({
        where: { datasetId: dataset.id, status: { in: ['PENDING', 'CACHING', 'TUNING'] } },
        orderBy: { createdAt: 'desc' },
    });
    if (active) {
        const age = Date.now() - new Date(active.updatedAt).getTime();
        if (age < STALE_RUN_MS) {
            return NextResponse.json({ error: 'A run is already active', runId: active.id }, { status: 409 });
        }
        await prisma.tuningRun.update({
            where: { id: active.id },
            data: { status: 'FAILED', error: 'Run abandoned (no heartbeat — worker process died). Auto-reclaimed.', completedAt: new Date() },
        });
    }

    // Clear only DEAD runs — keep COMPLETE history so the UI/apply still see it.
    await prisma.tuningRun.deleteMany({
        where: { datasetId: dataset.id, status: { in: ['FAILED', 'CANCELLED'] } }
    });

    // Create a single new run
    const run = await prisma.tuningRun.create({
        data: {
            datasetId: dataset.id,
            status: 'TUNING',
            progress: 0,
            message: 'Grid search starting...'
        }
    });

    after(async () => {
        const cache = dataset.scoreCache;

        try {
            console.log(`🚀 [Dev-Tuner] Starting grid search (run ${run.id}). No deadline — running to full exhaustion.`);

            let lastDbUpdate = Date.now();
            const searchResult = await runExhaustiveSearch(cache, async (progress, status, trialsRun) => {
                const now = Date.now();
                if (now - lastDbUpdate >= 5000 || progress === 100) {
                    lastDbUpdate = now;
                    console.log(`[Dev-Tuner] ${progress}% - ${status} (${trialsRun} trials)`);
                    try {
                        await prisma.tuningRun.update({
                            where: { id: run.id },
                            data: { progress, trialCount: trialsRun, message: `🧠 ${status}` }
                        });
                    } catch (dbErr) {
                        console.warn(`[Dev-Tuner] DB update failed:`, dbErr.message?.substring(0, 100));
                    }
                }
            }); // No deadline — run the full grid search

            await prisma.tuningRun.update({
                where: { id: run.id },
                data: {
                    status: 'COMPLETE',
                    progress: 100,
                    bestConfig: searchResult.bestConfig,
                    bestAccuracy: searchResult.testMetrics?.accuracy ?? searchResult.bestMetrics.accuracy,
                    bestMcc: searchResult.testMetrics?.mcc ?? searchResult.bestMetrics.mcc,
                    metrics: {
                        ...searchResult.bestMetrics,
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
            console.log(`✅ [Dev-Tuner] Complete! ${searchResult.trialCount} trials. Train: ${searchResult.trainMetrics?.accuracy}% | Test: ${searchResult.testMetrics?.accuracy}%`);
        } catch (err) {
            console.error('[Dev-Tuner] Run failed:', err.message);
            try {
                await prisma.tuningRun.update({
                    where: { id: run.id },
                    data: { status: 'FAILED', error: err.message?.substring(0, 500) }
                });
            } catch (_) { }
        }
    });

    return NextResponse.json({ success: true, runId: run.id });
}
