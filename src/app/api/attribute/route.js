export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import {
    getEngineConfig,
    calculateBurstinessNudge,
    attributeScoresToSentences,
    contextualSmooth,
    classifyResults,
} from '@/lib/chunking';
import { reconcileScan } from '@/lib/budget-governor';
import { verifyBudgetToken } from '@/lib/scan-token';

/**
 * Live-path attribution endpoint. Receives the per-window AI probabilities gathered
 * by the client queue and runs the EXACT pipeline the auto-tuner optimizes against
 * (evaluateConfig): score-penalty → burstiness → 3-signal attribution → contextual
 * smoothing → threshold classification. Returns per-sentence labels + breakdown.
 *
 * Pure CPU (~ms) — no model calls here, so no Vercel timeout risk.
 */
export async function POST(req) {
    try {
        const body = await req.json();
        const { sentences, scenarios, scores, budgetToken, executedQueries, actualInvocations } = body;

        if (!Array.isArray(sentences) || !Array.isArray(scenarios) || !Array.isArray(scores)) {
            return NextResponse.json({ error: "Missing sentences / scenarios / scores arrays" }, { status: 400 });
        }

        const engineCfg = await getEngineConfig();

        // Rebuild the 0-100 score array parallel to scenarios, applying the SAME
        // short-window confidence penalty the tuner uses (buildScoreCache):
        // windows under 10 words are pulled toward neutral 50 (the model is unreliable
        // on tiny fragments). null = a query that failed/timed out → neutral 50.
        const scores100 = scenarios.map((s, i) => {
            const p = scores[i];
            let v = (p == null || typeof p !== 'number') ? 50 : p * 100;
            const wordCount = String(s.text || '').trim().split(/\s+/).filter(Boolean).length;
            if (wordCount < 10) v = 50 + (v - 50) * 0.6;
            return v;
        });

        const burstinessNudge = calculateBurstinessNudge(sentences, engineCfg);
        const rawChunks = attributeScoresToSentences(sentences, scenarios, scores100, burstinessNudge, engineCfg);
        const smoothedChunks = contextualSmooth(rawChunks, engineCfg);
        const { chunks, breakdown, overallLabel } = classifyResults(smoothedChunks, engineCfg);

        // Attach each sentence's source paragraph index so the heatmap can restore the
        // original paragraph spacing (chunks are in sentence order, parallel to `sentences`).
        const paraOf = new Array(sentences.length).fill(0);
        for (const s of scenarios) {
            if (typeof s.paragraphIndex === 'number') {
                for (const idx of (s.sentenceIndices || [])) paraOf[idx] = s.paragraphIndex;
            }
        }
        const chunksWithPara = chunks.map((c, i) => ({ ...c, para: paraOf[i] ?? 0 }));

        // Reconcile the reservation against the REAL invocation cost now that the scan is
        // done. The reservation basis (estimate/monthKey/callsPerQuery) comes from the
        // server-signed budgetToken — NOT from client-supplied fields — so it can't be
        // forged to skew the shared ledger. Prefer the queue's honest proxy-call tally
        // (submit + every poll + every retry); fall back to the submit+poll estimate.
        // reconcileScan also CHARGES an overage (retry-heavy scans can exceed the
        // reservation), so the budget can't silently drift under sustained failures.
        const budget = await verifyBudgetToken(budgetToken);
        if (budget && budget.monthKey && typeof budget.estimate === 'number') {
            const callsPerQuery = budget.callsPerQuery || 2;
            const real = (typeof actualInvocations === 'number' && actualInvocations >= 0)
                ? actualInvocations
                : (typeof executedQueries === 'number' ? executedQueries : scenarios.length) * callsPerQuery;
            await reconcileScan({ monthKey: budget.monthKey, estimate: budget.estimate, actualInvocations: real });
        }

        return NextResponse.json({ chunks: chunksWithPara, breakdown, overallLabel });

    } catch (error) {
        console.error("Attribution Pipeline Failure:", error);
        return NextResponse.json({ error: "Internal Server Error during attribution", details: error.message }, { status: 500 });
    }
}
