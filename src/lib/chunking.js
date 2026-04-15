/**
 * Jotril V2 Chunking Engine
 *
 * Multi-scale text analysis system designed to maximize detection accuracy.
 * Analyzes text at multiple chunk lengths (1-4 sentence sliding windows + full paragraphs)
 * so the model can find the granularity where it's most confident about each sentence.
 *
 * The system picks the highest-confidence result across all scales for each sentence,
 * enabling precise detection of exactly where in a document AI was used.
 *
 * Smart cap system preserves full accuracy for short/medium documents while preventing
 * runaway API calls on very long documents.
 */

/**
 * Splits text into paragraphs by double-newline boundaries.
 */
export function splitIntoParagraphs(text) {
    if (!text) return [];
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

/**
 * Splits text into sentences using punctuation boundaries.
 * Filters out very short fragments (< 6 chars) that would produce noisy scores.
 */
export function splitIntoSentences(text) {
    if (!text) return [];

    // Use native V8 AI-linguistic segmenter for flawless sentence boundaries regardless of edge cases
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(text)).map(s => s.segment);

    return segments.map(s => s.trim()).filter(s => s.length > 5);
}

/**
 * Generates all multi-scale text combinations for a single paragraph.
 * This is the core accuracy engine — each combination becomes one model query.
 *
 * Scales generated:
 * - 1-sentence windows: baseline per-sentence score
 * - 2-sentence windows: captures cross-sentence patterns
 * - 3-sentence windows: broader context detection
 * - 4-sentence windows: maximum context window
 * - Full paragraph: document-level calibration
 *
 * @param {string} paragraph - A single paragraph of text
 * @returns {Array<{text: string, type: string, sentenceIndices: number[]}>}
 */
export function generateSentenceCombinations(paragraph) {
    const sentences = splitIntoSentences(paragraph);

    if (sentences.length === 0) {
        return [{ text: paragraph, type: 'paragraph', sentenceIndices: [] }];
    }

    const combinations = [];

    // Sliding sentence windows (1 through min(5, n) sentences)
    const maxWindow = Math.min(5, sentences.length);
    for (let windowSize = 1; windowSize <= maxWindow; windowSize++) {
        for (let i = 0; i <= sentences.length - windowSize; i++) {
            const windowSentences = sentences.slice(i, i + windowSize);
            const indices = Array.from({ length: windowSize }, (_, k) => i + k);
            combinations.push({
                text: windowSentences.join(' ').trim(),
                type: `window-${windowSize}`,
                sentenceIndices: indices
            });
        }
    }

    // Full paragraph baseline (only if different from what we already have)
    if (sentences.length > maxWindow) {
        combinations.push({
            text: paragraph,
            type: 'paragraph',
            sentenceIndices: Array.from({ length: sentences.length }, (_, i) => i)
        });
    }

    // Leave-One-Out Perturbation windows (Context stripping)
    // We send the paragraph minus exactly one sentence to measure the exact contextual drop.
    if (sentences.length > 2) {
        for (let i = 0; i < sentences.length; i++) {
            const indices = [];
            const textParts = [];
            for (let j = 0; j < sentences.length; j++) {
                if (i !== j) {
                    indices.push(j);
                    textParts.push(sentences[j]);
                }
            }
            combinations.push({
                text: textParts.join(' ').trim(),
                type: 'leave-one-out',
                sentenceIndices: indices
            });
        }
    }

    return combinations;
}

/**
 * Deduplicates combinations by normalized text content.
 * Preserves the first occurrence (which has the correct sentenceIndices mapping).
 */
function deduplicateCombinations(combinations) {
    const seen = new Set();
    return combinations.filter(item => {
        const normalized = item.text.trim().toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

/**
 * Applies the smart cap to prevent excessive API calls on very long documents.
 *
 * Tier 1 (< 100 sentences): No cap. Full multi-scale analysis.
 * Tier 2 (100-200 sentences): Keep all windows, but skip 5-sentence windows after sentence 100.
 * Tier 3 (200+ sentences): Same as Tier 2, plus skip 4-sentence windows from tail if still over limit.
 *
 * What we NEVER cut:
 * - 1-to-3 sentence windows (the accuracy core)
 * - Full paragraph baselines (calibration)
 * - The first 100 sentences' full analysis
 *
 * @param {Array} combinations - All generated combinations
 * @param {number} totalSentences - Total sentence count in the document
 * @returns {Array} - Capped combinations
 */
export function applySmartCap(combinations, totalSentences) {
    // Tier 1: Short documents — no cap at all
    if (totalSentences <= 100) {
        return combinations;
    }

    let filtered = combinations;

    // Tier 2: Medium documents — drop 5-sentence windows for sentences after position 100
    if (totalSentences > 100) {
        filtered = combinations.filter(combo => {
            if (combo.type !== 'window-5') return true;
            // Keep if any of its sentence indices are in the first 100
            return combo.sentenceIndices.some(idx => idx < 100);
        });
    }

    // Tier 3: Very long documents — drop 4-sentence windows for sentences after position 150
    if (totalSentences > 200 && filtered.length > 400) {
        filtered = filtered.filter(combo => {
            if (combo.type !== 'window-4') return true;
            return combo.sentenceIndices.some(idx => idx < 150);
        });
    }

    return filtered;
}

/**
 * Master function: generates all analysis scenarios for an entire document.
 *
 * @param {string} text - The full document text
 * @returns {{
 *   scenarios: Array<{text: string, type: string, sentenceIndices: number[], paragraphIndex: number}>,
 *   sentences: string[],
 *   paragraphs: string[],
 *   totalSentences: number
 * }}
 */
export function generateAnalysisScenarios(text) {
    const paragraphs = splitIntoParagraphs(text);
    const allSentences = [];
    const allScenarios = [];

    let sentenceOffset = 0;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const paragraph = paragraphs[pIdx];
        const paragraphSentences = splitIntoSentences(paragraph);
        allSentences.push(...paragraphSentences);

        const combinations = generateSentenceCombinations(paragraph);

        // Offset sentence indices to be document-global
        for (const combo of combinations) {
            allScenarios.push({
                ...combo,
                sentenceIndices: combo.sentenceIndices.map(i => i + sentenceOffset),
                paragraphIndex: pIdx
            });
        }

        sentenceOffset += paragraphSentences.length;
    }

    // Deduplicate
    const uniqueScenarios = deduplicateCombinations(allScenarios);

    // Apply smart cap
    const cappedScenarios = applySmartCap(uniqueScenarios, allSentences.length);

    console.log(
        `[Chunking] ${allSentences.length} sentences, ` +
        `${paragraphs.length} paragraphs → ` +
        `${uniqueScenarios.length} unique scenarios → ` +
        `${cappedScenarios.length} after smart cap`
    );

    return {
        scenarios: cappedScenarios,
        sentences: allSentences,
        paragraphs,
        totalSentences: allSentences.length
    };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNAL CONFIGURATION — The single tuning knob for the entire scoring engine.
 *
 * To change how the final score is calculated, adjust these weights.
 * Each signal is independent; their weights determine their influence
 * on the final blended score.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SIGNAL_CONFIG = {
    // ── Signal blend weights (relative — they get normalized) ──────────

    // Direct signal: confidence-scaled weighted average of all window scores
    direct: { weight: 0.30 },

    // Differential signal: marginal contribution analysis via delta pairs
    differential: { weight: 0.43 },

    // Anchor signal: scores from large, high-confidence windows only
    anchor: { weight: 0.27 },

    // ── Per-window confidence (reflects model training distribution) ───
    // Model trained on 25+ words:
    //   1-sentence ≈ 10 words (well below), 2-sentence ≈ 25 words (boundary),
    //   3-sentence ≈ 40 words (in-distribution), 4+ ≈ fully reliable
    windowConfidence: {
        'window-1': 0.15,
        'window-2': 0.50,
        'window-3': 0.85,
        'window-4': 0.95,
        'window-5': 0.98,
        'leave-one-out': 0.99, // Perturbation slices retain almost maximum context length
        'paragraph': 1.00,
    },

    // Minimum confidence threshold for a window to count as an "anchor"
    anchorThreshold: 0.85,
};

/**
 * ── Signal 1: Direct Confidence-Scaled Score ──────────────────────────
 *
 * For each window containing sentence S, its raw score is scaled by the
 * window's confidence (how much we trust that window size given the model's
 * training distribution). These are then averaged with confidence as weight.
 *
 * A 1-sentence window scoring 90% AI → 90 × 0.15 = 13.5 contribution.
 * A 3-sentence window scoring 85% AI → 85 × 0.85 = 72.25 contribution.
 *
 * @param {{score: number, type: string}[]} windowHits - All window scores for this sentence
 * @returns {number} 0-100 score
 */
function computeDirectSignal(windowHits) {
    if (windowHits.length === 0) return 0;

    const conf = SIGNAL_CONFIG.windowConfidence;
    let weightedSum = 0;
    let weightTotal = 0;

    for (const hit of windowHits) {
        const confidence = conf[hit.type] || 0.15;
        weightedSum += hit.score * confidence;
        weightTotal += confidence;
    }

    return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * ── Signal 2: Differential Marginal Analysis ──────────────────────────
 *
 * For each sentence S, finds "delta pairs" — pairs of overlapping windows
 * where one includes S and the other doesn't. The score difference reveals
 * S's marginal impact on the AI signal.
 *
 * Example: [S1,S2,S3] scores 85, [S1,S2] scores 60 → S3's delta = +25
 *
 * Consistent positive deltas = S is strongly AI.
 * Consistent negative deltas = S is strongly human.
 * Scattered deltas = low confidence in this signal.
 *
 * The delta consistency itself becomes a quality metric. If deltas disagree,
 * we reduce this signal's influence and let anchor/direct dominate.
 *
 * @param {number} sentenceIdx - Index of the sentence to analyze
 * @param {Array<{sentenceIndices: number[], type: string}>} scenarios - All scenarios
 * @param {number[]} allScores - Parallel scores array
 * @returns {number} 0-100 score (50 = neutral/no data)
 */
function computeDifferentialSignal(sentenceIdx, scenarios, allScores) {
    const conf = SIGNAL_CONFIG.windowConfidence;
    const deltas = [];

    // Build index: which scenarios contain this sentence, which don't
    const withSentence = [];
    const withoutSentence = [];

    scenarios.forEach((scenario, idx) => {
        const includes = scenario.sentenceIndices.includes(sentenceIdx);
        if (includes) {
            withSentence.push({ scenario, idx, score: allScores[idx] || 0 });
        } else {
            withoutSentence.push({ scenario, idx, score: allScores[idx] || 0 });
        }
    });

    // Find delta pairs: two windows that differ by exactly this sentence
    // A window W1 (with S) and W2 (without S) form a pair if:
    //   W2's indices are a subset of W1's indices (minus S)
    //   OR W1's indices (minus S) are a subset of W2's indices
    for (const w1 of withSentence) {
        const w1IndicesWithoutS = w1.scenario.sentenceIndices.filter(i => i !== sentenceIdx);

        for (const w2 of withoutSentence) {
            const w2Indices = w2.scenario.sentenceIndices;

            // Check if w2 is exactly w1 minus S (perfect pair)
            if (w1IndicesWithoutS.length === w2Indices.length &&
                w1IndicesWithoutS.every(i => w2Indices.includes(i))) {

                const w1Len = w1.scenario.sentenceIndices.length;
                const w2Len = w2.scenario.sentenceIndices.length;
                const isolatedScore = (w1.score * w1Len) - (w2.score * w2Len);

                // Raw delta (the old strategy)
                const rawDelta = w1.score - w2.score;

                // Weight by the confidence of the larger window (w1, which includes S)
                const pairConfidence = conf[w1.scenario.type] || 0.15;
                deltas.push({ isolated: isolatedScore, raw: rawDelta, confidence: pairConfidence });
            }
        }
    }

    // If no delta pairs found, return neutral (50 = no information)
    if (deltas.length === 0) return -1; // Signal: no data available

    // Calculate weighted average of isolated scores and raw deltas
    let isolatedWeightedSum = 0;
    let rawWeightedSum = 0;
    let deltaWeightTotal = 0;

    for (const d of deltas) {
        // Clamp isolated scores between 0 and 100 before averaging them
        const clampedIsolated = Math.max(0, Math.min(100, d.isolated));
        isolatedWeightedSum += clampedIsolated * d.confidence;
        rawWeightedSum += d.raw * d.confidence;
        deltaWeightTotal += d.confidence;
    }

    const avgIsolated = deltaWeightTotal > 0 ? isolatedWeightedSum / deltaWeightTotal : 50;
    const avgRawDelta = deltaWeightTotal > 0 ? rawWeightedSum / deltaWeightTotal : 0;

    // Calculate delta consistency using isolated scores variance
    const rawIsolated = deltas.map(d => Math.max(0, Math.min(100, d.isolated)));
    const mean = rawIsolated.reduce((a, b) => a + b, 0) / rawIsolated.length;
    const variance = rawIsolated.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / rawIsolated.length;
    const stdDev = Math.sqrt(variance);

    // Consistency factor: 1.0 if stdDev=0 (perfect agreement), degrades as stdDev rises
    const consistency = 1 / (1 + stdDev / 15);

    // -- STRATEGY 1 (NEW): Polar extrapolated isolation
    const newDifferentialScore = 50 + (avgIsolated - 50) * consistency;

    // -- STRATEGY 2 (OLD): Baseline anchored delta
    const anchoredHits = withSentence
        .filter(w => (conf[w.scenario.type] || 0) >= 0.50)
        .sort((a, b) => (conf[b.scenario.type] || 0) - (conf[a.scenario.type] || 0));

    const baseline = anchoredHits.length > 0
        ? anchoredHits.slice(0, 3).reduce((sum, h) => sum + h.score, 0) / Math.min(3, anchoredHits.length)
        : 50; // Neutral if no anchors

    const oldDifferentialScore = baseline + (avgRawDelta * consistency * 0.5);

    // 50/50 blend of both differential approaches!
    const blendedDifferentialScore = (Math.max(0, Math.min(100, newDifferentialScore)) + Math.max(0, Math.min(100, oldDifferentialScore))) / 2;

    return Math.max(0, Math.min(100, blendedDifferentialScore));
}

/**
 * ── Signal 3: Anchor Score ────────────────────────────────────────────
 *
 * The score from only the most reliable windows (3-sentence+, paragraph).
 * These represent "ground truth" from within the model's training distribution.
 *
 * @param {{score: number, type: string}[]} windowHits - All window scores for this sentence
 * @returns {number} 0-100 score, or -1 if no anchor windows exist
 */
function computeAnchorSignal(windowHits) {
    const conf = SIGNAL_CONFIG.windowConfidence;
    const threshold = SIGNAL_CONFIG.anchorThreshold;

    const anchors = windowHits.filter(h => (conf[h.type] || 0) >= threshold);

    if (anchors.length === 0) return -1; // No anchor data

    // Weighted average of anchor windows (larger = more weight)
    let weightedSum = 0;
    let weightTotal = 0;

    for (const a of anchors) {
        const confidence = conf[a.type] || 0;
        weightedSum += a.score * confidence;
        weightTotal += confidence;
    }

    return weightTotal > 0 ? weightedSum / weightTotal : -1;
}

/**
 * Maps model scores back to individual sentences using a three-signal
 * differential attribution engine.
 *
 * Signals:
 *   1. DIRECT — confidence-scaled weighted average of all window scores
 *   2. DIFFERENTIAL — marginal contribution analysis via delta pairs
 *   3. ANCHOR — scores from large, high-confidence windows only
 *
 * Each signal is computed independently, then blended using the weights
 * in SIGNAL_CONFIG. To change which signal dominates, adjust those weights.
 *
 * The interface is identical to the previous version — same inputs, same
 * output shape — so no other code needs to change.
 *
 * @param {string[]} sentences - All sentences in document order
 * @param {Array<{sentenceIndices: number[], type: string}>} scenarios - The analysis scenarios
 * @param {number[]} scores - Parallel array of AI scores (0-100) for each scenario
 * @param {number} burstinessNudge - Document-level burstiness adjustment (0-10)
 * @returns {Array<{text: string, score: number}>}
 */
export function attributeScoresToSentences(sentences, scenarios, scores, burstinessNudge = 0) {
    const cfg = SIGNAL_CONFIG;

    // Pre-apply burstiness nudge to all scores (mutates a copy, not the original)
    const adjustedScores = scores.map(s => {
        const score = s || 0;
        return score > 60 ? Math.max(0, score - burstinessNudge) : score;
    });

    return sentences.map((sentence, sentenceIdx) => {
        // Collect all window hits for this sentence
        const windowHits = [];
        scenarios.forEach((scenario, scenarioIdx) => {
            if (scenario.sentenceIndices.includes(sentenceIdx)) {
                windowHits.push({
                    score: adjustedScores[scenarioIdx],
                    type: scenario.type,
                    scenarioIdx
                });
            }
        });

        if (windowHits.length === 0) {
            return { text: sentence + ' ', score: 0 };
        }

        // ── Compute three signals ────────────────────────────────────
        const directScore = computeDirectSignal(windowHits);
        const differentialScore = computeDifferentialSignal(sentenceIdx, scenarios, adjustedScores);
        const anchorScore = computeAnchorSignal(windowHits);

        // ── Blend signals using configured weights ───────────────────
        // If a signal returns -1, it has no data — exclude it from the blend
        let blendedSum = 0;
        let blendedWeightTotal = 0;

        // Direct signal always has data if windowHits > 0
        blendedSum += directScore * cfg.direct.weight;
        blendedWeightTotal += cfg.direct.weight;

        if (differentialScore >= 0) {
            blendedSum += differentialScore * cfg.differential.weight;
            blendedWeightTotal += cfg.differential.weight;
        }

        if (anchorScore >= 0) {
            blendedSum += anchorScore * cfg.anchor.weight;
            blendedWeightTotal += cfg.anchor.weight;
        }

        const finalScore = blendedWeightTotal > 0
            ? blendedSum / blendedWeightTotal
            : directScore; // Fallback to direct if nothing else available

        return {
            text: sentence + ' ',
            score: Math.max(0, Math.min(100, Math.round(finalScore))),
            devMetrics: {
                direct: Math.round(directScore),
                differential: Math.round(differentialScore),
                anchor: Math.round(anchorScore),
                burstinessNudge: burstinessNudge,
                rawFinal: Math.max(0, Math.min(100, Math.round(finalScore)))
            }
        };
    });
}

/**
 * Calculates the burstiness nudge for a document.
 * High variance in sentence lengths = more likely human writing.
 *
 * @param {string[]} sentences - Array of sentences
 * @returns {number} - Nudge value (0, 5, or 10) to subtract from high AI scores
 */
export function calculateBurstinessNudge(sentences) {
    if (sentences.length < 3) return 0;

    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(
        lengths.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / lengths.length
    );

    // Human writing typically has higher variance in sentence length
    if (stdDev > 12) return 10;
    if (stdDev > 7) return 5;
    return 0;
}

/**
 * Contextual Smoother
 *
 * Adjusts sentence scores based on the scores of surrounding sentences.
 * This handles the common case where a sentence in the middle of 3-4 AI
 * sentences gets a "mixed" score — it's almost certainly AI too.
 *
 * Works both directions:
 * - Mixed sentence surrounded by AI → nudged toward AI
 * - Mixed sentence surrounded by Human → nudged toward Human
 * - Already-confident sentences are barely affected
 *
 * The algorithm:
 * 1. For each sentence, look at a context window (up to 3 sentences each side)
 * 2. Closer neighbors get more weight (immediate neighbor = weight 3, 2 away = 2, 3 away = 1)
 * 3. Calculate the weighted average of neighbor scores (the "neighborhood consensus")
 * 4. If the sentence is in the ambiguous zone (25-75) AND neighbors have a strong consensus,
 *    nudge the sentence toward the consensus
 * 5. The nudge amount depends on:
 *    - How ambiguous the sentence is (closer to 50 = more nudgeable)
 *    - How strong the neighbor consensus is (all AI = strong nudge, mixed neighbors = weak nudge)
 *
 * @param {Array<{text: string, score: number}>} chunks - Raw scored chunks
 * @returns {Array<{text: string, score: number}>} - Smoothed chunks
 */
export function contextualSmooth(chunks) {
    if (chunks.length < 3) return chunks;

    const WINDOW_SIZE = 3; // Look 3 sentences each direction
    const NEIGHBOR_WEIGHTS = [3, 2, 1]; // Closer = more influence

    return chunks.map((chunk, idx) => {
        const rawScore = chunk.score;

        // Collect weighted neighbor scores
        let neighborWeightedSum = 0;
        let neighborWeightTotal = 0;

        for (let offset = 1; offset <= WINDOW_SIZE; offset++) {
            const weight = NEIGHBOR_WEIGHTS[offset - 1];

            // Look left
            if (idx - offset >= 0) {
                neighborWeightedSum += chunks[idx - offset].score * weight;
                neighborWeightTotal += weight;
            }
            // Look right
            if (idx + offset < chunks.length) {
                neighborWeightedSum += chunks[idx + offset].score * weight;
                neighborWeightTotal += weight;
            }
        }

        if (neighborWeightTotal === 0) return chunk;

        const neighborAvg = neighborWeightedSum / neighborWeightTotal;

        // How ambiguous is this sentence? (0 = very confident, 1 = completely ambiguous)
        // Peaks at score=50, drops to 0 at score=0 or score=100
        const ambiguity = 1 - Math.abs(rawScore - 50) / 50;

        // How strong is the neighbor consensus?
        // 0 = neighbors are all mixed (avg ~50), 1 = neighbors all agree (avg near 0 or 100)
        const consensusStrength = Math.abs(neighborAvg - 50) / 50;

        // Count words to detect short phrases (e.g. section headings without punctuation)
        const wordCount = chunk.text.trim().split(/\s+/).length;
        const isShortPhrase = wordCount <= 5;

        let smoothedScore = rawScore;

        if (isShortPhrase) {
            // Short phrases (like titles) lack sufficient statistical signal on their own.
            // If they are dropped in the middle of AI text, they are AI. 
            // We force them to heavily inherit their surroundings (80% neighbor, 20% self).
            smoothedScore = (rawScore * 0.2) + (neighborAvg * 0.8);
        } else {
            // Normal sentences: Only nudge if somewhat ambiguous AND neighbors have consensus
            // Max nudge: 25 points (when sentence is at 50 and all neighbors agree)
            const maxNudge = 25;
            const nudgeAmount = maxNudge * ambiguity * consensusStrength;

            // Direction: pull toward neighbor consensus
            if (neighborAvg > rawScore) {
                smoothedScore = rawScore + nudgeAmount;
            } else {
                smoothedScore = rawScore - nudgeAmount;
            }
        }

        // Clamp to 0-100
        smoothedScore = Math.max(0, Math.min(100, Math.round(smoothedScore)));

        return {
            ...chunk,
            score: smoothedScore,
            devMetrics: {
                ...chunk.devMetrics,
                smoothedFrom: chunk.score,
                smoothedTo: smoothedScore
            }
        };
    });
}

/**
 * Classifies each sentence into Human / Mixed / AI and computes document breakdown.
 *
 * @param {Array<{text: string, score: number}>} chunks - Smoothed scored chunks
 * @returns {{
 *   chunks: Array<{text: string, score: number, label: string}>,
 *   breakdown: { human: number, mixed: number, ai: number },
 *   overallLabel: string
 * }}
 */
export function classifyResults(chunks) {
    const classified = chunks.map(chunk => ({
        ...chunk,
        label: chunk.score <= 62 ? 'human' : chunk.score <= 75 ? 'mixed' : 'ai'
    }));

    const total = classified.length || 1;
    const humanCount = classified.filter(c => c.label === 'human').length;
    const mixedCount = classified.filter(c => c.label === 'mixed').length;
    const aiCount = classified.filter(c => c.label === 'ai').length;

    const breakdown = {
        human: Math.round((humanCount / total) * 100),
        mixed: Math.round((mixedCount / total) * 100),
        ai: Math.round((aiCount / total) * 100)
    };

    // Determine overall document label
    let overallLabel;
    if (breakdown.ai >= 60) overallLabel = 'Predominantly AI Generated';
    else if (breakdown.ai >= 30 || breakdown.mixed >= 40) overallLabel = 'Mixed Content';
    else overallLabel = 'Predominantly Human Written';

    return { chunks: classified, breakdown, overallLabel };
}
