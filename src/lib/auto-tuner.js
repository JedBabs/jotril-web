/**
 * Jotril Auto-Tuner Engine
 *
 * Exhaustive 3-phase grid search that optimizes all engine parameters
 * against a labeled training dataset. Model scores are cached so each
 * parameter evaluation is pure CPU (~0.5ms).
 *
 * Flow:
 *  1. buildScoreCache()  — one-time model queries, stores raw scores per document
 *  2. runExhaustiveSearch() — coarse→medium→fine grid search over 50k+ combos
 *  3. evaluateConfig()   — runs the full post-model pipeline for one config
 */

import {
    generateAnalysisScenarios,
    attributeScoresToSentences,
    calculateBurstinessNudge,
    contextualSmooth,
    classifyResults,
    splitIntoSentences,
    SIGNAL_CONFIG,
} from './chunking';
import { batchQueryModel } from './jotrilService';

// ═══════════════════════════════════════════════════════════════════════════
// 1. DATASET PREPARATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalizes a raw sample array into document-format objects.
 *
 * Supports two input formats:
 *  - Document-level: {text: "full paragraph", label: "human"|"ai"}
 *  - Sentence-level: {text: "one sentence", label: "human"|"ai", format: "sentence"}
 *
 * Sentence-level inputs are stitched into synthetic documents (3-7 sentences each).
 */
export function prepareDocuments(rawSamples) {
    const documents = [];
    const sentencePool = { human: [], ai: [] };

    for (const sample of rawSamples) {
        const label = sample.label?.toLowerCase?.() === 'ai' ? 'ai' : 'human';
        const text = (sample.text || '').trim();
        if (!text) continue;

        if (sample.format === 'sentence') {
            sentencePool[label].push(text);
        } else {
            // Document-level — use as-is
            documents.push({ text, label, sentenceCount: splitIntoSentences(text).length });
        }
    }

    // Stitch sentence-level samples into synthetic documents
    for (const label of ['human', 'ai']) {
        const pool = sentencePool[label];
        if (pool.length === 0) continue;

        // Shuffle deterministically
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (i * 2654435761) % (i + 1); // hash-shuffle
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        let idx = 0;
        while (idx < pool.length) {
            const docSize = Math.min(3 + ((idx * 7) % 5), pool.length - idx); // 3-7 sentences
            const docSentences = pool.slice(idx, idx + docSize);
            const text = docSentences.join(' ');
            documents.push({ text, label, sentenceCount: docSize });
            idx += docSize;
        }
    }

    return documents;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SCORE CACHE BUILDING (One-time model queries)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs the full chunking + model query pipeline for each document.
 * Returns a cache structure that can be reused for thousands of config evaluations.
 *
 * @param {Array<{text: string, label: string}>} documents
 * @param {(progress: number, status: string) => void} onProgress
 * @returns {Promise<Array<{scenarios, sentences, scores, label}>>}
 */
export async function buildScoreCache(documents, onProgress) {
    const cache = [];
    const totalDocs = documents.length;
    const textDedup = new Map(); // Deduplicate identical scenario texts

    for (let i = 0; i < totalDocs; i++) {
        const doc = documents[i];
        await onProgress?.(Math.round((i / totalDocs) * 100), `Querying model for document ${i + 1}/${totalDocs}...`);

        // Step 1: Generate all multi-scale analysis scenarios
        const { scenarios, sentences, totalSentences } = generateAnalysisScenarios(doc.text);

        // Step 2: Deduplicate scenario texts across documents
        const textsToQuery = [];
        const queryMap = []; // Maps scenario index → deduplicated text index or cached score
        for (let s = 0; s < scenarios.length; s++) {
            const normalized = scenarios[s].text.trim().toLowerCase();
            if (textDedup.has(normalized)) {
                queryMap.push({ type: 'cached', score: textDedup.get(normalized) });
            } else {
                queryMap.push({ type: 'query', queryIdx: textsToQuery.length });
                textsToQuery.push(scenarios[s].text);
            }
        }

        // Step 3: Query the model for new texts only
        let rawResults = [];
        if (textsToQuery.length > 0) {
            rawResults = await batchQueryModel(textsToQuery, 5, 500);
        }

        // Step 4: Validate — if any result is null, the cache would be corrupted
        const nullCount = rawResults.filter(r => !r).length;
        if (nullCount > 0) {
            throw new Error(
                `Model returned ${nullCount}/${textsToQuery.length} failed results for document ${i + 1}. ` +
                `This would corrupt the score cache. Check HuggingFace Space availability.`
            );
        }

        // Step 5: Convert model outputs to raw 0-100 scores and cache dedup
        const scores = queryMap.map((entry, idx) => {
            let score;
            if (entry.type === 'cached') {
                score = entry.score;
            } else {
                const result = rawResults[entry.queryIdx];
                score = result.aiScore * 100;
                // Same confidence penalty as production pipeline
                const wordCount = scenarios[idx].text.split(/\s+/).length;
                if (wordCount < 10) {
                    score = 50 + (score - 50) * 0.6;
                }
                // Cache for future deduplication
                const normalized = scenarios[idx].text.trim().toLowerCase();
                textDedup.set(normalized, score);
            }
            return score;
        });

        cache.push({
            scenarios,
            sentences,
            scores,
            label: doc.label,
            totalSentences,
        });
    }

    await onProgress?.(100, `Model querying complete (${textDedup.size} unique texts cached)`);
    return cache;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CONFIG EVALUATION (Pure CPU — runs in ~0.5ms per call)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs the full post-model pipeline with a candidate config against cached scores.
 * Returns classification metrics vs ground truth.
 */
export function evaluateConfig(cache, candidateConfig) {
    const predictions = [];
    const truths = [];

    for (const doc of cache) {
        // Build the engine config shape expected by the pipeline
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

        // Run the attribution pipeline
        const burstinessNudge = calculateBurstinessNudge(doc.sentences, engineCfg);
        const rawChunks = attributeScoresToSentences(
            doc.sentences, doc.scenarios, doc.scores, burstinessNudge, engineCfg
        );
        const smoothedChunks = contextualSmooth(rawChunks, engineCfg);
        const { breakdown, overallLabel } = classifyResults(smoothedChunks, engineCfg);

        // Convert to binary classification
        const predictedLabel = breakdown.ai >= 50 ? 'ai' : 'human';
        predictions.push(predictedLabel);
        truths.push(doc.label);
    }

    return computeMetrics(predictions, truths);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. METRICS CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Computes accuracy, precision, recall, F1, MCC, and confusion matrix.
 * Treats 'ai' as the positive class.
 */
export function computeMetrics(predictions, truths) {
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

    // Matthews Correlation Coefficient — balanced metric even with class imbalance
    const mccNum = (tp * tn) - (fp * fn);
    const mccDen = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
    const mcc = mccDen > 0 ? mccNum / mccDen : 0;

    return {
        accuracy: Math.round(accuracy * 10000) / 100,   // %
        precision: Math.round(precision * 10000) / 100,
        recall: Math.round(recall * 10000) / 100,
        f1: Math.round(f1 * 10000) / 100,
        mcc: Math.round(mcc * 10000) / 10000,
        confusionMatrix: { tp, fp, tn, fn },
        total,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXHAUSTIVE 3-PHASE GRID SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default parameter search space definition.
 * Each parameter has a coarse range and step, used to generate candidate configs.
 */
const PARAM_SPACE = {
    // Signal weights (relative — normalized by the pipeline)
    'signalWeights.direct': { min: 0.10, max: 0.60, coarseStep: 0.10, fineStep: 0.02 },
    'signalWeights.differential': { min: 0.10, max: 0.70, coarseStep: 0.10, fineStep: 0.02 },
    'signalWeights.anchor': { min: 0.05, max: 0.50, coarseStep: 0.10, fineStep: 0.02 },

    // Classification thresholds
    'classification.humanMax': { min: 40, max: 80, coarseStep: 5, fineStep: 1 },
    'classification.mixedMax': { min: 60, max: 95, coarseStep: 5, fineStep: 1 },

    // Smoothing
    'smoothing.maxNudge': { min: 5, max: 45, coarseStep: 10, fineStep: 2 },

    // Window confidence
    'windowConfidence.window-1': { min: 0.05, max: 0.40, coarseStep: 0.10, fineStep: 0.03 },
    'windowConfidence.window-2': { min: 0.25, max: 0.75, coarseStep: 0.15, fineStep: 0.05 },
    'windowConfidence.window-3': { min: 0.60, max: 1.00, coarseStep: 0.10, fineStep: 0.03 },
    'windowConfidence.window-4': { min: 0.80, max: 1.00, coarseStep: 0.05, fineStep: 0.02 },
    'windowConfidence.window-5': { min: 0.85, max: 1.00, coarseStep: 0.05, fineStep: 0.02 },

    // Anchor threshold
    'anchorThreshold': { min: 0.50, max: 1.00, coarseStep: 0.10, fineStep: 0.03 },

    // Burstiness
    'burstiness.lowThreshold': { min: 3, max: 15, coarseStep: 4, fineStep: 1 },
    'burstiness.highThreshold': { min: 6, max: 25, coarseStep: 5, fineStep: 1 },
    'burstiness.lowNudge': { min: 0, max: 15, coarseStep: 5, fineStep: 1 },
    'burstiness.highNudge': { min: 0, max: 20, coarseStep: 5, fineStep: 1 },
};

/**
 * Generates a range of values from min to max with given step.
 */
function rangeValues(min, max, step) {
    const vals = [];
    for (let v = min; v <= max + step * 0.01; v += step) {
        vals.push(Math.round(v * 1000) / 1000); // avoid floating point drift
    }
    return vals;
}

/**
 * Sets a nested property on a config object using dot-path notation.
 */
function setConfigValue(config, path, value) {
    const keys = path.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
}

/**
 * Gets a nested property from a config object using dot-path notation.
 */
function getConfigValue(config, path) {
    const keys = path.split('.');
    let obj = config;
    for (const key of keys) {
        if (obj == null) return undefined;
        obj = obj[key];
    }
    return obj;
}

/**
 * Creates the base config from default values.
 */
function getBaseConfig() {
    return {
        signalWeights: { direct: 0.30, differential: 0.43, anchor: 0.27 },
        windowConfidence: {
            'window-1': 0.15, 'window-2': 0.50, 'window-3': 0.85,
            'window-4': 0.95, 'window-5': 0.98,
            'leave-one-out': 0.99, 'paragraph': 1.00,
        },
        anchorThreshold: 0.85,
        classification: { humanMax: 62, mixedMax: 75 },
        smoothing: { maxNudge: 25 },
        burstiness: { lowThreshold: 7, highThreshold: 12, lowNudge: 5, highNudge: 10 },
    };
}

/**
 * Deep-clone a config object.
 */
function cloneConfig(cfg) {
    return JSON.parse(JSON.stringify(cfg));
}

/**
 * Runs the full 3-phase exhaustive grid search.
 *
 * Phase 1 (Coarse): Sweep the 6 most impactful parameters with large steps
 * Phase 2 (Medium): Zoom into the best region across all parameters
 * Phase 3 (Fine):   Surgical ±1 fine-step sweep around the single best
 *
 * @param {Array} cache - Score cache from buildScoreCache()
 * @param {(progress: number, status: string, trialsRun: number) => void} onProgress
 * @returns {{ bestConfig, bestMetrics, trialCount, topTrials }}
 */
export async function runExhaustiveSearch(cache, onProgress) {
    let bestConfig = getBaseConfig();
    let bestMetrics = evaluateConfig(cache, bestConfig);
    let bestScore = bestMetrics.mcc;
    let totalTrials = 0;
    const topTrials = []; // Keep top 20

    // Helper: yield the event loop periodically to prevent blocking
    const YIELD_EVERY = 500;
    async function maybeYield() {
        if (totalTrials % YIELD_EVERY === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    function recordTrial(config, metrics) {
        totalTrials++;
        if (metrics.mcc > bestScore) {
            bestScore = metrics.mcc;
            bestConfig = cloneConfig(config);
            bestMetrics = { ...metrics };
        }
        // Track top 20
        topTrials.push({
            config: cloneConfig(config),
            accuracy: metrics.accuracy,
            mcc: metrics.mcc,
        });
        if (topTrials.length > 20) {
            topTrials.sort((a, b) => b.mcc - a.mcc);
            topTrials.length = 20;
        }
    }

    // ── PHASE 1: Coarse sweep of most impactful parameters ────────────
    await onProgress?.(0, 'Phase 1: Coarse sweep of primary parameters...', 0);

    const primaryParams = [
        'signalWeights.direct',
        'signalWeights.differential',
        'signalWeights.anchor',
        'classification.humanMax',
        'classification.mixedMax',
        'smoothing.maxNudge',
    ];

    // Generate all coarse combinations for primary params
    const primaryRanges = primaryParams.map(p => ({
        path: p,
        values: rangeValues(PARAM_SPACE[p].min, PARAM_SPACE[p].max, PARAM_SPACE[p].coarseStep),
    }));

    // Cartesian product (capped to prevent explosion)
    const coarseCombos = cartesianProduct(primaryRanges);
    const coarseTotal = coarseCombos.length;
    let lastProgressUpdate = Date.now();

    for (let i = 0; i < coarseTotal; i++) {
        const candidate = cloneConfig(bestConfig);
        for (const { path, value } of coarseCombos[i]) {
            setConfigValue(candidate, path, value);
        }

        // Enforce constraint: humanMax < mixedMax
        if (candidate.classification.humanMax >= candidate.classification.mixedMax) continue;

        const metrics = evaluateConfig(cache, candidate);
        recordTrial(candidate, metrics);
        await maybeYield();

        // Time-based progress updates (at most every 2 seconds)
        const now = Date.now();
        if (now - lastProgressUpdate >= 2000 || i === coarseTotal - 1) {
            await onProgress?.(Math.round((i / coarseTotal) * 33), `Phase 1: ${i}/${coarseTotal} combos (best MCC: ${bestScore.toFixed(4)})`, totalTrials);
            lastProgressUpdate = now;
        }
    }

    // ── PHASE 2: Medium sweep around best across ALL parameters ───────
    await onProgress?.(33, 'Phase 2: Medium sweep around best region...', totalTrials);

    const allParams = Object.keys(PARAM_SPACE);
    const phase2Base = cloneConfig(bestConfig);

    // For each parameter independently, sweep coarse range centered on best
    for (const paramPath of allParams) {
        const space = PARAM_SPACE[paramPath];
        const currentBest = getConfigValue(phase2Base, paramPath);
        const fineStep = space.fineStep;

        // Generate values around the current best
        const halfRange = (space.max - space.min) * 0.3; // ±30% of total range
        const searchMin = Math.max(space.min, currentBest - halfRange);
        const searchMax = Math.min(space.max, currentBest + halfRange);
        const values = rangeValues(searchMin, searchMax, fineStep);

        for (const val of values) {
            const candidate = cloneConfig(bestConfig);
            setConfigValue(candidate, paramPath, val);

            // Enforce constraints
            if (candidate.classification.humanMax >= candidate.classification.mixedMax) continue;
            if (candidate.burstiness.lowThreshold >= candidate.burstiness.highThreshold) continue;

            const metrics = evaluateConfig(cache, candidate);
            recordTrial(candidate, metrics);
            await maybeYield();
        }

        const paramProgress = 33 + Math.round(((allParams.indexOf(paramPath) + 1) / allParams.length) * 33);
        await onProgress?.(paramProgress, `Phase 2: Sweeping ${paramPath} (best MCC: ${bestScore.toFixed(4)})`, totalTrials);
    }

    // ── PHASE 2.5: Pairwise interactions for top parameters ───────────
    await onProgress?.(66, 'Phase 2.5: Pairwise interaction sweep...', totalTrials);

    const interactionPairs = [
        ['signalWeights.direct', 'signalWeights.differential'],
        ['signalWeights.direct', 'signalWeights.anchor'],
        ['signalWeights.differential', 'signalWeights.anchor'],
        ['classification.humanMax', 'classification.mixedMax'],
        ['smoothing.maxNudge', 'classification.humanMax'],
        ['burstiness.lowNudge', 'burstiness.highNudge'],
        ['burstiness.lowThreshold', 'burstiness.highThreshold'],
        ['anchorThreshold', 'signalWeights.anchor'],
    ];

    for (let pairIdx = 0; pairIdx < interactionPairs.length; pairIdx++) {
        const [p1, p2] = interactionPairs[pairIdx];
        const s1 = PARAM_SPACE[p1], s2 = PARAM_SPACE[p2];
        const best1 = getConfigValue(bestConfig, p1);
        const best2 = getConfigValue(bestConfig, p2);

        const range1 = rangeValues(
            Math.max(s1.min, best1 - (s1.max - s1.min) * 0.25),
            Math.min(s1.max, best1 + (s1.max - s1.min) * 0.25),
            s1.fineStep
        );
        const range2 = rangeValues(
            Math.max(s2.min, best2 - (s2.max - s2.min) * 0.25),
            Math.min(s2.max, best2 + (s2.max - s2.min) * 0.25),
            s2.fineStep
        );

        for (const v1 of range1) {
            for (const v2 of range2) {
                const candidate = cloneConfig(bestConfig);
                setConfigValue(candidate, p1, v1);
                setConfigValue(candidate, p2, v2);

                if (candidate.classification.humanMax >= candidate.classification.mixedMax) continue;
                if (candidate.burstiness.lowThreshold >= candidate.burstiness.highThreshold) continue;

                const metrics = evaluateConfig(cache, candidate);
                recordTrial(candidate, metrics);
                await maybeYield();
            }
        }

        await onProgress?.(
            66 + Math.round(((pairIdx + 1) / interactionPairs.length) * 17),
            `Phase 2.5: Pair ${p1} × ${p2} (best MCC: ${bestScore.toFixed(4)})`,
            totalTrials
        );
    }

    // ── PHASE 3: Fine surgical sweep ±1 step around single best ───────
    await onProgress?.(83, 'Phase 3: Fine-grained refinement around best...', totalTrials);

    // Multiple refinement passes to catch cascading improvements
    for (let pass = 0; pass < 3; pass++) {
        let improved = false;

        for (const paramPath of allParams) {
            const space = PARAM_SPACE[paramPath];
            const currentBest = getConfigValue(bestConfig, paramPath);
            const step = space.fineStep;

            // Tiny window: ±3 fine steps
            const microRange = rangeValues(
                Math.max(space.min, currentBest - step * 3),
                Math.min(space.max, currentBest + step * 3),
                step
            );

            for (const val of microRange) {
                const candidate = cloneConfig(bestConfig);
                setConfigValue(candidate, paramPath, val);

                if (candidate.classification.humanMax >= candidate.classification.mixedMax) continue;
                if (candidate.burstiness.lowThreshold >= candidate.burstiness.highThreshold) continue;

                const metrics = evaluateConfig(cache, candidate);
                const prevBest = bestScore;
                recordTrial(candidate, metrics);
                if (bestScore > prevBest) improved = true;
                await maybeYield();
            }
        }

        await onProgress?.(
            83 + Math.round(((pass + 1) / 3) * 17),
            `Phase 3 pass ${pass + 1}/3 (best MCC: ${bestScore.toFixed(4)})`,
            totalTrials
        );

        // If no improvement in this pass, stop early
        if (!improved) break;
    }

    // Sort final top trials
    topTrials.sort((a, b) => b.mcc - a.mcc);

    await onProgress?.(100, `Complete! ${totalTrials} configs evaluated. Best MCC: ${bestScore.toFixed(4)}`, totalTrials);

    return {
        bestConfig,
        bestMetrics,
        trialCount: totalTrials,
        topTrials: topTrials.slice(0, 20),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Cartesian product generator (capped)
// ═══════════════════════════════════════════════════════════════════════════

function cartesianProduct(ranges, maxCombos = 50000) {
    const result = [];
    const indices = new Array(ranges.length).fill(0);
    const lengths = ranges.map(r => r.values.length);

    while (true) {
        if (result.length >= maxCombos) break;

        // Build current combination
        const combo = ranges.map((r, i) => ({
            path: r.path,
            value: r.values[indices[i]],
        }));
        result.push(combo);

        // Increment indices (like an odometer)
        let carry = true;
        for (let i = ranges.length - 1; i >= 0 && carry; i--) {
            indices[i]++;
            if (indices[i] < lengths[i]) {
                carry = false;
            } else {
                indices[i] = 0;
            }
        }
        if (carry) break; // All combinations exhausted
    }

    return result;
}
