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
        const { sentences, scenarios, scores, estimate, monthKey, callsPerQuery, executedQueries } = body;

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

        // Refund the unused slice of the reservation now that the real query count is known.
        if (monthKey && estimate) {
            const executed = typeof executedQueries === 'number' ? executedQueries : scenarios.length;
            const actualInvocations = executed * (callsPerQuery || 2);
            await reconcileScan({ monthKey, estimate, actualInvocations });
        }

        return NextResponse.json({ chunks: chunksWithPara, breakdown, overallLabel });

    } catch (error) {
        console.error("Attribution Pipeline Failure:", error);
        return NextResponse.json({ error: "Internal Server Error during attribution", details: error.message }, { status: 500 });
    }
}
