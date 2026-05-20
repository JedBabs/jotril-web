/**
 * Standalone Auto-Tuner Runner (CommonJS)
 * 
 * Runs the grid search by directly requiring the compiled modules.
 * Works around Next.js' `after()` not executing locally.
 * 
 * Usage: node run-tuner.cjs
 * 
 * Note: Requires `npm run build` to have been run first so
 * we can use the compiled chunks. Alternatively, this script
 * just hits the dev-trigger endpoint with a longer wait.
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Jotril Auto-Tuner — Standalone Runner');
    console.log('═══════════════════════════════════════════════════════\n');

    // 1. Find dataset with score cache
    const dataset = await prisma.tuningDataset.findFirst({
        where: { scoreCache: { not: null } },
        orderBy: { createdAt: 'desc' },
    });

    if (!dataset || !dataset.scoreCache) {
        console.error('❌ No dataset with score cache found.');
        process.exit(1);
    }

    const cache = dataset.scoreCache;
    console.log(`📦 Dataset: "${dataset.name}" (${dataset.sampleCount} samples)`);
    console.log(`📊 Cache: ${cache.length} documents\n`);

    // 2. Clean up old stuck runs
    const cleaned = await prisma.tuningRun.deleteMany({
        where: { datasetId: dataset.id, status: { in: ['TUNING', 'PENDING', 'CACHING'] } }
    });
    if (cleaned.count > 0) console.log(`🧹 Cleaned ${cleaned.count} orphaned run(s)\n`);

    // 3. Create new run record
    const run = await prisma.tuningRun.create({
        data: {
            datasetId: dataset.id,
            status: 'TUNING',
            progress: 0,
            message: 'Grid search starting (standalone)...'
        }
    });
    console.log(`🚀 Run ID: ${run.id}\n`);

    // ── INLINE the auto-tuner logic (pure CPU, no external imports needed) ──

    // Import the chunking functions dynamically (they use ES module exports)
    // Instead, we inline the key functions needed

    // Load the auto-tuner and chunking modules by patching require
    const Module = require('module');
    const originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...rest) {
        // Handle Next.js @/ alias
        if (request.startsWith('@/')) {
            request = require('path').join(__dirname, 'src', request.slice(2));
        }
        // Handle extensionless .js imports
        try {
            return originalResolve.call(this, request, parent, ...rest);
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND' && !request.endsWith('.js')) {
                return originalResolve.call(this, request + '.js', parent, ...rest);
            }
            throw e;
        }
    };

    // The modules use ES module syntax (import/export), so we need to transpile
    // Let's use a different approach - evaluate them directly

    // Actually, the simplest approach: just copy the pure functions we need
    // The grid search is entirely CPU-bound and only needs evaluateConfig + computeMetrics

    const {
        attributeScoresToSentences,
        calculateBurstinessNudge,
        contextualSmooth,
        classifyResults,
        SIGNAL_CONFIG
    } = await loadChunking();

    const startTime = Date.now();

    // ── EVALUATECONFIG (inlined) ──
    function evaluateConfig(cacheSubset, candidateConfig) {
        const predictions = [];
        const truths = [];

        for (const doc of cacheSubset) {
            const engineCfg = {
                direct: { weight: candidateConfig.signalWeights.direct },
                differential: { weight: candidateConfig.signalWeights.differential },
                anchor: { weight: candidateConfig.signalWeights.anchor },
                windowConfidence: { ...SIGNAL_CONFIG.windowConfidence, ...candidateConfig.windowConfidence },
                anchorThreshold: candidateConfig.anchorThreshold,
                classification: candidateConfig.classification,
                smoothing: candidateConfig.smoothing,
                burstiness: candidateConfig.burstiness,
            };

            const burstinessNudge = calculateBurstinessNudge(doc.sentences, engineCfg);
            const rawChunks = attributeScoresToSentences(
                doc.sentences, doc.scenarios, doc.scores, burstinessNudge, engineCfg, doc.sentenceToScenarioMap
            );
            const smoothedChunks = contextualSmooth(rawChunks, engineCfg);
            const { breakdown } = classifyResults(smoothedChunks, engineCfg);

            const predictedLabel = breakdown.ai >= 50 ? 'ai' : 'human';
            predictions.push(predictedLabel);
            truths.push(doc.label);
        }

        return computeMetrics(predictions, truths);
    }

    function computeMetrics(predictions, truths) {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (let i = 0; i < predictions.length; i++) {
            const pred = predictions[i] === 'ai';
            const truth = truths[i] === 'ai';
            if (pred && truth) tp++;
            else if (pred && !truth) fp++;
            else if (!pred && !truth) tn++;
            else fn++;
        }
        const total = tp + fp + tn + fn;
        const accuracy = total > 0 ? (tp + tn) / total : 0;
        const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
        const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
        const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
        const mccNum = (tp * tn) - (fp * fn);
        const mccDen = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
        const mcc = mccDen > 0 ? mccNum / mccDen : 0;
        return {
            accuracy: Math.round(accuracy * 10000) / 100,
            precision: Math.round(precision * 10000) / 100,
            recall: Math.round(recall * 10000) / 100,
            f1: Math.round(f1 * 10000) / 100,
            mcc: Math.round(mcc * 10000) / 10000,
            confusionMatrix: { tp, fp, tn, fn },
            total,
        };
    }

    // ── PARAM SPACE & HELPERS (inlined) ──
    const PARAM_SPACE = {
        'signalWeights.direct': { min: 0.10, max: 0.50, coarseStep: 0.10, fineStep: 0.02 },
        'signalWeights.differential': { min: 0.20, max: 0.60, coarseStep: 0.15, fineStep: 0.02 },
        'signalWeights.anchor': { min: 0.10, max: 0.40, coarseStep: 0.10, fineStep: 0.02 },
        'classification.humanMax': { min: 40, max: 80, coarseStep: 10, fineStep: 2 },
        'classification.mixedMax': { min: 60, max: 90, coarseStep: 10, fineStep: 2 },
        'smoothing.maxNudge': { min: 5, max: 45, coarseStep: 10, fineStep: 2 },
        'windowConfidence.window-1': { min: 0.05, max: 0.40, coarseStep: 0.10, fineStep: 0.03 },
        'windowConfidence.window-2': { min: 0.25, max: 0.75, coarseStep: 0.15, fineStep: 0.05 },
        'windowConfidence.window-3': { min: 0.60, max: 1.00, coarseStep: 0.10, fineStep: 0.03 },
        'windowConfidence.window-4': { min: 0.80, max: 1.00, coarseStep: 0.05, fineStep: 0.02 },
        'windowConfidence.window-5': { min: 0.85, max: 1.00, coarseStep: 0.05, fineStep: 0.02 },
        'anchorThreshold': { min: 0.50, max: 1.00, coarseStep: 0.10, fineStep: 0.03 },
        'burstiness.lowThreshold': { min: 3, max: 15, coarseStep: 4, fineStep: 1 },
        'burstiness.highThreshold': { min: 6, max: 25, coarseStep: 5, fineStep: 1 },
        'burstiness.lowNudge': { min: 0, max: 15, coarseStep: 5, fineStep: 1 },
        'burstiness.highNudge': { min: 0, max: 20, coarseStep: 5, fineStep: 1 },
    };

    function rangeValues(min, max, step) {
        const vals = [];
        for (let v = min; v <= max + step * 0.01; v += step) vals.push(Math.round(v * 1000) / 1000);
        return vals;
    }

    function setConfigValue(config, path, value) {
        const keys = path.split('.');
        let obj = config;
        for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]]; }
        obj[keys[keys.length - 1]] = value;
    }

    function getConfigValue(config, path) {
        const keys = path.split('.');
        let obj = config;
        for (const key of keys) { if (obj == null) return undefined; obj = obj[key]; }
        return obj;
    }

    function getBaseConfig() {
        return {
            signalWeights: { direct: 0.30, differential: 0.43, anchor: 0.27 },
            windowConfidence: {
                'window-1': 0.15, 'window-2': 0.50, 'window-3': 0.85,
                'window-4': 0.95, 'window-5': 0.98, 'leave-one-out': 0.99, 'paragraph': 1.00,
            },
            anchorThreshold: 0.85,
            classification: { humanMax: 62, mixedMax: 75 },
            smoothing: { maxNudge: 25 },
            burstiness: { lowThreshold: 7, highThreshold: 12, lowNudge: 5, highNudge: 10 },
        };
    }

    const cloneConfig = (cfg) => JSON.parse(JSON.stringify(cfg));

    function cartesianProduct(ranges, maxCombos = 50000) {
        const result = []; const indices = new Array(ranges.length).fill(0);
        const lengths = ranges.map(r => r.values.length);
        while (true) {
            if (result.length >= maxCombos) break;
            result.push(ranges.map((r, i) => ({ path: r.path, value: r.values[indices[i]] })));
            let carry = true;
            for (let i = ranges.length - 1; i >= 0 && carry; i--) { indices[i]++; if (indices[i] < lengths[i]) carry = false; else indices[i] = 0; }
            if (carry) break;
        }
        return result;
    }

    // ── BUILD SENTENCE-TO-SCENARIO MAP ──
    for (const doc of cache) {
        if (!doc.sentenceToScenarioMap || !doc.sentenceToScenarioMap[0]?.withSentence) {
            doc.sentenceToScenarioMap = doc.sentences.map((_, si) => {
                const withSentence = [], withoutSentence = [];
                doc.scenarios.forEach((sc, idx) => {
                    if (sc.sentenceIndices.includes(si)) withSentence.push({ scenario: sc, idx });
                    else withoutSentence.push({ scenario: sc, idx });
                });
                return { withSentence, withoutSentence };
            });
        }
    }

    // ── TRAIN/TEST SPLIT (80/20, stratified) ──
    const humanDocs = cache.filter(d => d.label === 'human');
    const aiDocs = cache.filter(d => d.label === 'ai');
    const deterministicShuffle = (arr) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) { const j = (i * 2654435761) % (i + 1);[copy[i], copy[j]] = [copy[j], copy[i]]; }
        return copy;
    };
    const sH = deterministicShuffle(humanDocs), sA = deterministicShuffle(aiDocs);
    const hSplit = Math.round(sH.length * 0.8), aSplit = Math.round(sA.length * 0.8);
    const trainCache = [...sH.slice(0, hSplit), ...sA.slice(0, aSplit)];
    const testCache = [...sH.slice(hSplit), ...sA.slice(aSplit)];
    console.log(`📊 Split: ${trainCache.length} train (${hSplit}H/${aSplit}A) | ${testCache.length} test (${sH.length - hSplit}H/${sA.length - aSplit}A)\n`);

    // ── GRID SEARCH ──
    let bestConfig = getBaseConfig();
    let bestMetrics = evaluateConfig(trainCache, bestConfig);
    let bestScore = bestMetrics.mcc;
    let totalTrials = 0;
    const topTrials = [];
    const YIELD_EVERY = 500;
    let lastDbUpdate = Date.now();

    function recordTrial(config, metrics) {
        totalTrials++;
        if (metrics.mcc > bestScore) {
            bestScore = metrics.mcc;
            bestConfig = cloneConfig(config);
            bestMetrics = { ...metrics };
        }
        topTrials.push({ config: cloneConfig(config), accuracy: metrics.accuracy, mcc: metrics.mcc });
        if (topTrials.length > 20) { topTrials.sort((a, b) => b.mcc - a.mcc); topTrials.length = 20; }
    }

    async function updateProgress(progress, status) {
        const bar = '█'.repeat(Math.floor(progress / 2.5)) + '░'.repeat(40 - Math.floor(progress / 2.5));
        process.stdout.write(`\r  [${bar}] ${progress}% — ${totalTrials.toLocaleString()} trials | ${status}`.padEnd(120));
        const now = Date.now();
        if (now - lastDbUpdate >= 5000 || progress === 100) {
            lastDbUpdate = now;
            try { await prisma.tuningRun.update({ where: { id: run.id }, data: { progress, trialCount: totalTrials, message: `🧠 ${status}` } }); } catch (_) { }
        }
    }

    // Phase 1: Coarse
    await updateProgress(0, 'Phase 1: Coarse sweep...');
    const primaryParams = ['signalWeights.direct', 'signalWeights.differential', 'signalWeights.anchor', 'classification.humanMax', 'classification.mixedMax', 'smoothing.maxNudge'];
    const primaryRanges = primaryParams.map(p => ({ path: p, values: rangeValues(PARAM_SPACE[p].min, PARAM_SPACE[p].max, PARAM_SPACE[p].coarseStep) }));
    const coarseCombos = cartesianProduct(primaryRanges);
    for (let i = 0; i < coarseCombos.length; i++) {
        const c = cloneConfig(bestConfig);
        for (const { path, value } of coarseCombos[i]) setConfigValue(c, path, value);
        if (c.classification.humanMax >= c.classification.mixedMax) continue;
        recordTrial(c, evaluateConfig(trainCache, c));
        if (totalTrials % YIELD_EVERY === 0) await new Promise(r => setImmediate(r));
        if (i % 200 === 0) await updateProgress(Math.round((i / coarseCombos.length) * 33), `Phase 1: ${i}/${coarseCombos.length} (MCC: ${bestScore.toFixed(4)})`);
    }

    // Phase 2: Medium
    await updateProgress(33, 'Phase 2: Medium sweep...');
    const allParams = Object.keys(PARAM_SPACE);
    for (const paramPath of allParams) {
        const space = PARAM_SPACE[paramPath];
        const cur = getConfigValue(bestConfig, paramPath);
        const halfRange = (space.max - space.min) * 0.3;
        const vals = rangeValues(Math.max(space.min, cur - halfRange), Math.min(space.max, cur + halfRange), space.fineStep);
        for (const val of vals) {
            const c = cloneConfig(bestConfig); setConfigValue(c, paramPath, val);
            if (c.classification.humanMax >= c.classification.mixedMax) continue;
            if (c.burstiness.lowThreshold >= c.burstiness.highThreshold) continue;
            recordTrial(c, evaluateConfig(trainCache, c));
            if (totalTrials % YIELD_EVERY === 0) await new Promise(r => setImmediate(r));
        }
        await updateProgress(33 + Math.round(((allParams.indexOf(paramPath) + 1) / allParams.length) * 33), `Phase 2: ${paramPath} (MCC: ${bestScore.toFixed(4)})`);
    }

    // Phase 2.5: Pairwise interactions
    await updateProgress(66, 'Phase 2.5: Pairwise interactions...');
    const interactionPairs = [
        ['signalWeights.direct', 'signalWeights.differential'], ['signalWeights.direct', 'signalWeights.anchor'],
        ['signalWeights.differential', 'signalWeights.anchor'], ['classification.humanMax', 'classification.mixedMax'],
        ['smoothing.maxNudge', 'classification.humanMax'], ['burstiness.lowNudge', 'burstiness.highNudge'],
        ['burstiness.lowThreshold', 'burstiness.highThreshold'], ['anchorThreshold', 'signalWeights.anchor'],
    ];
    for (let pi = 0; pi < interactionPairs.length; pi++) {
        const [p1, p2] = interactionPairs[pi];
        const s1 = PARAM_SPACE[p1], s2 = PARAM_SPACE[p2];
        const b1 = getConfigValue(bestConfig, p1), b2 = getConfigValue(bestConfig, p2);
        const r1 = rangeValues(Math.max(s1.min, b1 - (s1.max - s1.min) * 0.25), Math.min(s1.max, b1 + (s1.max - s1.min) * 0.25), s1.fineStep);
        const r2 = rangeValues(Math.max(s2.min, b2 - (s2.max - s2.min) * 0.25), Math.min(s2.max, b2 + (s2.max - s2.min) * 0.25), s2.fineStep);
        for (const v1 of r1) for (const v2 of r2) {
            const c = cloneConfig(bestConfig); setConfigValue(c, p1, v1); setConfigValue(c, p2, v2);
            if (c.classification.humanMax >= c.classification.mixedMax) continue;
            if (c.burstiness.lowThreshold >= c.burstiness.highThreshold) continue;
            recordTrial(c, evaluateConfig(trainCache, c));
            if (totalTrials % YIELD_EVERY === 0) await new Promise(r => setImmediate(r));
        }
        await updateProgress(66 + Math.round(((pi + 1) / interactionPairs.length) * 17), `Phase 2.5: ${p1} × ${p2}`);
    }

    // Phase 3: Fine
    await updateProgress(83, 'Phase 3: Fine refinement...');
    for (let pass = 0; pass < 3; pass++) {
        let improved = false;
        for (const paramPath of allParams) {
            const space = PARAM_SPACE[paramPath];
            const cur = getConfigValue(bestConfig, paramPath);
            const microRange = rangeValues(Math.max(space.min, cur - space.fineStep * 3), Math.min(space.max, cur + space.fineStep * 3), space.fineStep);
            for (const val of microRange) {
                const c = cloneConfig(bestConfig); setConfigValue(c, paramPath, val);
                if (c.classification.humanMax >= c.classification.mixedMax) continue;
                if (c.burstiness.lowThreshold >= c.burstiness.highThreshold) continue;
                const prev = bestScore;
                recordTrial(c, evaluateConfig(trainCache, c));
                if (bestScore > prev) improved = true;
                if (totalTrials % YIELD_EVERY === 0) await new Promise(r => setImmediate(r));
            }
        }
        await updateProgress(83 + Math.round(((pass + 1) / 3) * 17), `Phase 3 pass ${pass + 1}/3 (MCC: ${bestScore.toFixed(4)})`);
        if (!improved) break;
    }

    topTrials.sort((a, b) => b.mcc - a.mcc);

    // Final validation
    const trainMetrics = evaluateConfig(trainCache, bestConfig);
    const testMetrics = evaluateConfig(testCache, bestConfig);
    const fullMetrics = evaluateConfig(cache, bestConfig);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  ✅ TUNING COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  ⏱  Duration:      ${elapsed}s`);
    console.log(`  🔬 Trials:        ${totalTrials.toLocaleString()}`);
    console.log();
    console.log(`  📊 Train (${trainCache.length}): Acc=${trainMetrics.accuracy}% MCC=${trainMetrics.mcc}`);
    console.log(`  🧪 Test  (${testCache.length}): Acc=${testMetrics.accuracy}% MCC=${testMetrics.mcc}`);
    console.log(`  📈 Full  (${cache.length}): Acc=${fullMetrics.accuracy}% MCC=${fullMetrics.mcc}`);
    console.log();
    console.log('  🏆 Best Config:');
    console.log(JSON.stringify(bestConfig, null, 4).split('\n').map(l => '     ' + l).join('\n'));

    // Save
    await prisma.tuningRun.update({
        where: { id: run.id },
        data: {
            status: 'COMPLETE', progress: 100,
            bestConfig, bestAccuracy: testMetrics.accuracy, bestMcc: testMetrics.mcc,
            metrics: { ...fullMetrics, baseline: null, train: trainMetrics, test: testMetrics, splitInfo: { trainSize: trainCache.length, testSize: testCache.length, totalSize: cache.length } },
            trialCount: totalTrials,
            log: topTrials.slice(0, 20),
            completedAt: new Date(),
            message: `✅ ${totalTrials} trials | Train: ${trainMetrics.accuracy}% | Test: ${testMetrics.accuracy}% | MCC: ${testMetrics.mcc}`
        }
    });

    console.log('\n  💾 Results saved to database.');
    console.log('  ➡  Go to Admin → Auto-Tuner → "Apply to Production Engine" to activate.\n');
}

// Load chunking module dynamically - handles the ES module format
async function loadChunking() {
    // Use dynamic import for the ES module
    const mod = await import('./src/lib/chunking.js');
    return mod;
}

main()
    .catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
