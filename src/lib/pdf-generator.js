import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import htmlToPdfmake from "html-to-pdfmake";

// Initialize fonts
pdfMake.vfs = pdfFonts.pdfMake.vfs;

/**
 * Premium Vector-PDF Report Generator for Jotril AI — V3 Engine
 * 
 * Uses pdfmake + html-to-pdfmake for 100% crisp VECTOR graphics,
 * selectable text, native pagination (no slicing text in half),
 * and perfect retention of tables, bolding, colors, and lists.
 */

const COLORS = {
    ai: 'rgba(239, 68, 68, 0.25)',     // Vivid red
    mixed: 'rgba(245, 158, 11, 0.25)'  // Vibrant amber
};

// ─── CHUNK-TO-CHARACTER MAP ─────────────────────────────────
function buildChunkMap(chunks) {
    const map = [];
    for (const chunk of chunks) {
        for (let i = 0; i < chunk.text.length; i++) {
            map.push(chunk.label);
        }
    }
    return map;
}

function matchTextToChunkMap(targetText, fullAnalysisText, chunkMap) {
    const result = [];
    let aPtr = 0;
    for (let t = 0; t < targetText.length; t++) {
        const tChar = targetText[t];
        while (aPtr < fullAnalysisText.length && /\s/.test(fullAnalysisText[aPtr]) && !(/\s/.test(tChar))) {
            aPtr++;
        }
        if (/\s/.test(tChar) && aPtr < fullAnalysisText.length && !(/\s/.test(fullAnalysisText[aPtr]))) {
            result.push(chunkMap[Math.max(0, aPtr - 1)] || 'human');
            continue;
        }
        if (aPtr < fullAnalysisText.length && tChar.toLowerCase() === fullAnalysisText[aPtr].toLowerCase()) {
            result.push(chunkMap[aPtr] || 'human');
            aPtr++;
        } else {
            let found = false;
            const maxScan = Math.min(20, fullAnalysisText.length - aPtr);
            for (let scan = 1; scan <= maxScan; scan++) {
                if (tChar.toLowerCase() === fullAnalysisText[aPtr + scan].toLowerCase()) {
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

// ─── DOM HIGHLIGHT INJECTOR ─────────────────────────────────
function injectHighlightsIntoDOM(container, chunks) {
    if (!chunks || chunks.length === 0) return;
    const fullText = chunks.map(c => c.text).join('');
    const chunkMap = buildChunkMap(chunks);
    const htmlText = container.textContent || '';
    const charLabels = matchTextToChunkMap(htmlText, fullText, chunkMap);

    let globalCharIdx = 0;

    function walk(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent;
            if (!text || text.trim() === '') {
                globalCharIdx += text.length;
                return;
            }

            const labels = charLabels.slice(globalCharIdx, globalCharIdx + text.length);
            const spans = [];
            let currentLabel = labels[0];
            let currentText = text[0];

            for (let i = 1; i < text.length; i++) {
                if (labels[i] === currentLabel) {
                    currentText += text[i];
                } else {
                    spans.push({ text: currentText, label: currentLabel });
                    currentLabel = labels[i];
                    currentText = text[i];
                }
            }
            if (currentText) spans.push({ text: currentText, label: currentLabel });

            const fragment = document.createDocumentFragment();
            for (const span of spans) {
                if (span.label === 'ai' || span.label === 'mixed') {
                    // Span styling mapped specifically for pdfmake
                    const mark = document.createElement('span');
                    mark.textContent = span.text;
                    mark.style.backgroundColor = span.label === 'ai' ? '#EF4444' : '#F59E0B'; // rgb colors are more reliable in pdfmake core
                    mark.style.color = '#FFFFFF'; // force white text over solid background since transparency acts weird sometimes in pdfMake rendering text underneath
                    fragment.appendChild(mark);
                } else {
                    fragment.appendChild(document.createTextNode(span.text));
                }
            }
            node.replaceWith(fragment);
            globalCharIdx += text.length;
            return;
        }

        if (node.nodeType === 1) {
            // Re-style block-level elements for better pdfMake AST parsing
            if (node.tagName === 'P') node.style.marginBottom = '10px';
            if (node.classList.contains('align-center')) node.style.textAlign = 'center';
            if (node.classList.contains('align-right')) node.style.textAlign = 'right';
            if (node.classList.contains('align-justify')) node.style.textAlign = 'justify';

            const children = Array.from(node.childNodes);
            for (const child of children) {
                walk(child);
            }
        }
    }
    walk(container);
}

// ─── MAIN EXPORT ────────────────────────────────────────────
export function generatePDFReport(data) {
    const {
        filename,
        breakdown,
        overallLabel,
        chunks,
        sentenceCount,
        wordCount,
        sourceHtml = null,
        date = new Date().toLocaleDateString()
    } = data;

    // 1. Convert our content to an injected DOM to get perfectly highlighted HTML
    const wrapper = document.createElement('div');

    if (sourceHtml) {
        wrapper.innerHTML = sourceHtml;
        injectHighlightsIntoDOM(wrapper, chunks);
    } else {
        // Plain text rendering: loop chunks and wrap in spans
        chunks.forEach(chunk => {
            const span = document.createElement('span');
            span.textContent = chunk.text + ' ';
            if (chunk.label === 'ai') {
                span.style.backgroundColor = '#EF4444';
                span.style.color = '#FFFFFF';
            } else if (chunk.label === 'mixed') {
                span.style.backgroundColor = '#F59E0B';
                span.style.color = '#FFFFFF';
            }
            wrapper.appendChild(span);
        });
    }

    const annotatedHTML = wrapper.innerHTML;

    // 2. Convert standard HTML directly to pdfMake definition
    // pdfMake naturally supports <p>, <strong>, <em>, <table>, <tr>, <td>, <ul>, <img src="base64">
    const htmlAst = htmlToPdfmake(annotatedHTML, {
        tableAutoSize: true,
        defaultStyles: {
            p: { margin: [0, 0, 0, 10] },
            h1: { fontSize: 24, bold: true, margin: [0, 10, 0, 5] },
            h2: { fontSize: 18, bold: true, margin: [0, 10, 0, 5] },
            h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
            table: { margin: [0, 5, 0, 15] },
            img: { margin: [0, 10, 0, 10] }
        }
    });

    // 3. Build the full Vector PDF payload structure
    const assessColor = breakdown.ai >= 60 ? '#EF4444' : (breakdown.ai >= 30 || breakdown.mixed >= 40 ? '#F59E0B' : '#10B981');
    const fname = filename.length > 40 ? filename.substring(0, 37) + '...' : filename;

    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],

        info: {
            title: `Jotril Report - ${fname}`,
            author: 'Jotril AI Engine',
            subject: 'AI Detection Analysis Report',
        },

        // Crisp Vector Header / Footer Native to PDF
        header: {
            margin: [40, 20, 40, 0],
            columns: [
                { text: [{ text: 'Jotril', bold: true, color: '#0F172A' }, { text: 'AI', bold: true, color: '#10B981' }], fontSize: 18 },
                { text: `Report Date: ${date}`, alignment: 'right', fontSize: 10, color: '#64748B', margin: [0, 8, 0, 0] }
            ]
        },

        footer: function (currentPage, pageCount) {
            return {
                margin: [40, 0, 40, 0],
                columns: [
                    { text: 'Powered by Jotril V3 Core Engine', fontSize: 8, color: '#94A3B8' },
                    { text: `Page ${currentPage.toString()} of ${pageCount}`, alignment: 'right', fontSize: 8, color: '#94A3B8' }
                ]
            };
        },

        content: [
            // Divider
            { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 515, y2: 10, lineWidth: 1, lineColor: '#E2E8F0' }], margin: [0, -10, 0, 20] },

            // Document Assessment Banner
            {
                table: {
                    widths: ['*'],
                    body: [[{
                        text: [
                            { text: 'DOCUMENT ASSESSMENT\n', fontSize: 11, bold: true, margin: [0, 0, 0, 4], opacity: 0.9 },
                            { text: overallLabel.toUpperCase(), fontSize: 20, bold: true }
                        ],
                        alignment: 'center',
                        fillColor: assessColor,
                        color: 'white',
                        border: [false, false, false, false],
                        margin: [0, 8, 0, 8]
                    }]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 25]
            },

            // Stats row
            {
                columns: [
                    { stack: [{ text: sentenceCount.toString(), fontSize: 26, bold: true, color: '#0F172A' }, { text: 'SENTENCES', fontSize: 10, color: '#64748B', bold: true }], width: '*' },
                    { stack: [{ text: wordCount.toString(), fontSize: 26, bold: true, color: '#0F172A' }, { text: 'WORDS', fontSize: 10, color: '#64748B', bold: true }], width: '*' },
                    { stack: [{ text: fname, fontSize: 16, bold: true, color: '#0F172A' }, { text: 'FILE', fontSize: 10, color: '#64748B', bold: true }], width: '1.5*' }
                ],
                margin: [0, 0, 0, 30]
            },

            // Composition Breakdown
            { text: 'COMPOSITION BREAKDOWN', fontSize: 10, bold: true, color: '#64748B', margin: [0, 0, 0, 5] },
            {
                canvas: [
                    { type: 'rect', x: 0, y: 0, w: 515 * (Math.max(0, breakdown.human) / 100), h: 10, color: '#10B981' },
                    { type: 'rect', x: 515 * (Math.max(0, breakdown.human) / 100), y: 0, w: 515 * (Math.max(0, breakdown.mixed) / 100), h: 10, color: '#F59E0B' },
                    { type: 'rect', x: 515 * ((Math.max(0, breakdown.human) + Math.max(0, breakdown.mixed)) / 100), y: 0, w: 515 * (Math.max(0, breakdown.ai) / 100), h: 10, color: '#EF4444' }
                ],
                margin: [0, 0, 0, 10]
            },

            // Legend
            {
                columns: [
                    { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: '#10B981' }], width: 15 }, { text: [{ text: `${breakdown.human}% `, bold: true }, 'Human'], fontSize: 11, width: 'auto' },
                    { width: 20, text: '' },
                    { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: '#F59E0B' }], width: 15 }, { text: [{ text: `${breakdown.mixed}% `, bold: true }, 'Mixed'], fontSize: 11, width: 'auto' },
                    { width: 20, text: '' },
                    { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: '#EF4444' }], width: 15 }, { text: [{ text: `${breakdown.ai}% `, bold: true }, 'AI'], fontSize: 11, width: 'auto' }
                ],
                margin: [0, 0, 0, 30]
            },

            { text: sourceHtml ? 'Formatted Document Analysis' : 'Sentence-Level Heatmap', fontSize: 14, bold: true, color: '#0F172A', margin: [0, 0, 0, 15] },

            // THIS is where the full HTML AST is elegantly injected. It behaves like native components.
            ...htmlAst
        ],

        defaultStyle: {
            font: 'Roboto',
            fontSize: 11,
            lineHeight: 1.6,
            color: '#1E293B'
        }
    };

    // 4. Trigger download directly mapping vector structures.
    pdfMake.createPdf(docDefinition).download(`Jotril_Report_${filename.replace(/\.[^/.]+$/, "")}.pdf`);
}
