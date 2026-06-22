/**
 * Jotril Report — Highlight Injector
 * ------------------------------------------------------------------
 * Maps per-sentence analysis labels onto the faithfully-reproduced document
 * HTML (mammoth output for DOCX) and wraps AI / mixed runs in <mark> tags.
 *
 * This function is serialised and executed INSIDE the headless Chrome page
 * (via page.evaluate), where a real DOM exists — so it must be fully
 * self-contained (no imports, no module-scope references). It operates only
 * on the reproduced document container (#jotril-doc-body), never the scorecard.
 *
 * The character-alignment algorithm is ported from the previous
 * pdf-generator.js (proven against real documents): it walks the rendered
 * text and the analysed text in parallel, tolerating whitespace/extraction
 * drift and resyncing on a short look-ahead when they diverge.
 */
export function injectHighlights(chunks) {
    const container = document.getElementById('jotril-doc-body');
    if (!container || !Array.isArray(chunks) || chunks.length === 0) return;

    // Per-character label array built from the analysed chunks.
    function buildChunkMap(cs) {
        const map = [];
        for (const chunk of cs) {
            const t = chunk && chunk.text ? String(chunk.text) : '';
            for (let i = 0; i < t.length; i++) map.push(chunk.label || 'human');
        }
        return map;
    }

    // Align the rendered document text to the analysed text, returning a
    // label for every character of targetText.
    function matchTextToChunkMap(targetText, fullAnalysisText, chunkMap) {
        const result = [];
        let aPtr = 0;
        for (let t = 0; t < targetText.length; t++) {
            const tChar = targetText[t];
            while (aPtr < fullAnalysisText.length && /\s/.test(fullAnalysisText[aPtr]) && !/\s/.test(tChar)) {
                aPtr++;
            }
            if (/\s/.test(tChar) && aPtr < fullAnalysisText.length && !/\s/.test(fullAnalysisText[aPtr])) {
                result.push(chunkMap[Math.max(0, aPtr - 1)] || 'human');
                continue;
            }
            if (aPtr < fullAnalysisText.length && tChar.toLowerCase() === fullAnalysisText[aPtr].toLowerCase()) {
                result.push(chunkMap[aPtr] || 'human');
                aPtr++;
            } else {
                let found = false;
                const maxScan = Math.min(20, fullAnalysisText.length - aPtr - 1);
                for (let scan = 1; scan <= maxScan; scan++) {
                    const aChar = fullAnalysisText[aPtr + scan];
                    if (aChar !== undefined && tChar.toLowerCase() === aChar.toLowerCase()) {
                        aPtr += scan;
                        result.push(chunkMap[aPtr] || 'human');
                        aPtr++;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const lookAhead = targetText.substring(t, t + 15).replace(/\s+/g, '').toLowerCase();
                    if (lookAhead.length >= 6) {
                        const searchStart = Math.max(0, aPtr - 30);
                        const searchEnd = Math.min(fullAnalysisText.length, aPtr + 200);
                        const searchWindow = fullAnalysisText.substring(searchStart, searchEnd).replace(/\s+/g, '').toLowerCase();
                        const resyncIdx = searchWindow.indexOf(lookAhead.substring(0, 6));
                        if (resyncIdx >= 0) {
                            let realIdx = searchStart;
                            let stripped = 0;
                            while (realIdx < searchEnd && stripped < resyncIdx) {
                                if (!/\s/.test(fullAnalysisText[realIdx])) stripped++;
                                realIdx++;
                            }
                            aPtr = realIdx;
                            result.push(chunkMap[aPtr] || 'human');
                            aPtr++;
                            continue;
                        }
                    }
                    result.push(chunkMap[Math.min(aPtr, chunkMap.length - 1)] || 'human');
                }
            }
        }
        return result;
    }

    // Document text for alignment, EXCLUDING tables — table content is exempt
    // from analysis, so it must not consume chunk positions (and walk() leaves
    // it unhighlighted). Visits the same text nodes walk() does, in order.
    function textContentExcludingTables(root) {
        let s = '';
        (function rec(node) {
            if (node.nodeType === 3) { s += node.textContent || ''; return; }
            if (node.nodeType === 1) {
                const tag = node.tagName;
                if (tag === 'TABLE' || tag === 'SCRIPT' || tag === 'STYLE') return;
                for (const ch of node.childNodes) rec(ch);
            }
        })(root);
        return s;
    }

    // Snap per-character labels to whole words so a single word never renders
    // split across two colors (the char aligner can drift a few chars mid-word).
    // Majority vote per word, ties broken ai > mixed > human — mirrors the
    // PDF-overlay path's per-item vote.
    function snapLabelsToWords(text, labels) {
        const n = text.length;
        let i = 0;
        while (i < n) {
            if (/\s/.test(text[i])) { i++; continue; }
            let j = i, h = 0, mx = 0, a = 0;
            while (j < n && !/\s/.test(text[j])) {
                const l = labels[j] || 'human';
                if (l === 'ai') a++; else if (l === 'mixed') mx++; else h++;
                j++;
            }
            const best = (a >= mx && a >= h && a > 0) ? 'ai'
                : (mx >= h && mx > 0) ? 'mixed' : 'human';
            for (let k = i; k < j; k++) labels[k] = best;
            i = j;
        }
    }

    const fullText = chunks.map(c => (c && c.text ? String(c.text) : '')).join('');
    const chunkMap = buildChunkMap(chunks);
    const htmlText = textContentExcludingTables(container);
    const charLabels = matchTextToChunkMap(htmlText, fullText, chunkMap);
    snapLabelsToWords(htmlText, charLabels);

    let globalCharIdx = 0;

    function walk(node) {
        if (node.nodeType === 3) { // text node
            const text = node.textContent;
            if (!text || text.trim() === '') {
                globalCharIdx += text ? text.length : 0;
                return;
            }
            const labels = charLabels.slice(globalCharIdx, globalCharIdx + text.length);
            const spans = [];
            let currentLabel = labels[0] || 'human';
            let currentText = text[0];
            for (let i = 1; i < text.length; i++) {
                if ((labels[i] || 'human') === currentLabel) {
                    currentText += text[i];
                } else {
                    spans.push({ text: currentText, label: currentLabel });
                    currentLabel = labels[i] || 'human';
                    currentText = text[i];
                }
            }
            if (currentText) spans.push({ text: currentText, label: currentLabel });

            const fragment = document.createDocumentFragment();
            for (const span of spans) {
                if (span.label === 'ai' || span.label === 'mixed') {
                    const mark = document.createElement('mark');
                    mark.className = span.label === 'ai' ? 'jt-ai' : 'jt-mixed';
                    mark.textContent = span.text;
                    fragment.appendChild(mark);
                } else {
                    fragment.appendChild(document.createTextNode(span.text));
                }
            }
            node.replaceWith(fragment);
            globalCharIdx += text.length;
            return;
        }
        if (node.nodeType === 1) { // element
            // Don't descend into media / already-marked nodes.
            const tag = node.tagName;
            // TABLE is skipped (and excluded from the alignment text above), so
            // tabular data is left unhighlighted and never desyncs the mapping.
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK' || tag === 'IMG' || tag === 'SVG' || tag === 'TABLE') return;
            const children = Array.from(node.childNodes);
            for (const child of children) walk(child);
        }
    }

    walk(container);
}
