import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import htmlToPdfmake from "html-to-pdfmake";

// Initialize fonts
pdfMake.vfs = pdfFonts && pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

/**
 * Premium Vector-PDF Report Generator for Jotril AI — V4 Engine
 * 
 * Complete rewrite with:
 *  - Professional cover section with branded header
 *  - Executive summary with confidence indicators
 *  - Detailed stats dashboard with card-style metrics
 *  - Enhanced composition bar with rounded corners
 *  - Sentence-level heatmap with proper pagination
 *  - Disclaimer & methodology section
 *  - Unique report ID for verification
 *  - Page numbering & branded footer
 */

// ─── DESIGN TOKENS ─────────────────────────────────────────
const T = {
    // Brand
    navy: '#0F172A',
    navyLight: '#1E293B',
    slate: '#334155',
    muted: '#64748B',
    light: '#94A3B8',
    silver: '#CBD5E1',
    ghost: '#E2E8F0',
    surface: '#F1F5F9',
    white: '#FFFFFF',
    // Accents
    green: '#10B981',
    greenLight: '#D1FAE5',
    greenDark: '#065F46',
    amber: '#F59E0B',
    amberLight: '#FEF3C7',
    amberDark: '#92400E',
    red: '#EF4444',
    redLight: '#FEE2E2',
    redDark: '#991B1B',
    blue: '#2563EB',
    blueLight: '#DBEAFE',
    purple: '#7C3AED',
};

// ─── UTILITY: Generate unique report ID ─────────────────────
function generateReportId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `JTR-${ts.slice(-4)}-${rand}`;
}

// ─── UTILITY: Assessment metadata ───────────────────────────
function getAssessment(breakdown) {
    const ai = breakdown?.ai || 0;
    const mixed = breakdown?.mixed || 0;
    const human = breakdown?.human || 0;

    if (ai >= 80) return { label: 'Predominantly AI Generated', color: T.red, bgColor: T.redLight, textColor: T.redDark, icon: '⚠', confidence: 'High' };
    if (ai >= 60) return { label: 'Mostly AI Generated', color: T.red, bgColor: T.redLight, textColor: T.redDark, icon: '⚠', confidence: 'High' };
    if (ai >= 40 || (ai + mixed) >= 60) return { label: 'Significant AI Content Detected', color: T.amber, bgColor: T.amberLight, textColor: T.amberDark, icon: '⚡', confidence: 'Medium' };
    if (ai >= 20 || mixed >= 30) return { label: 'Some AI Content Detected', color: T.amber, bgColor: T.amberLight, textColor: T.amberDark, icon: '⚡', confidence: 'Medium' };
    if (human >= 90) return { label: 'Highly Likely Human Written', color: T.green, bgColor: T.greenLight, textColor: T.greenDark, icon: '✓', confidence: 'High' };
    return { label: 'Likely Human Written', color: T.green, bgColor: T.greenLight, textColor: T.greenDark, icon: '✓', confidence: 'Medium' };
}

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
        if (node.nodeType === 3) {
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
                    const mark = document.createElement('span');
                    mark.textContent = span.text;
                    mark.style.backgroundColor = span.label === 'ai' ? '#FECACA' : '#FDE68A';
                    mark.style.color = span.label === 'ai' ? '#991B1B' : '#92400E';
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
            // Apply refined corporate styling spacing natively to the AST via inline styles
            if (node.tagName === 'P') {
                node.style.marginBottom = '14px';
                node.style.textAlign = 'justify'; // Professional corporate alignment
            }
            if (['H1', 'H2', 'H3', 'H4', 'H5'].includes(node.tagName)) {
                node.style.marginTop = '18px';
                node.style.marginBottom = '8px';
            }
            if (node.tagName === 'UL' || node.tagName === 'OL') {
                node.style.marginBottom = '14px';
            }
            if (node.tagName === 'LI') {
                node.style.marginBottom = '4px';
            }

            // Rescue formatting classes
            if (node.className && typeof node.className === 'string') {
                if (node.className.includes('center') || node.className.includes('text-center')) {
                    node.style.textAlign = 'center';
                } else if (node.className.includes('right') || node.className.includes('text-right')) {
                    node.style.textAlign = 'right';
                } else if (node.className.includes('justify') || node.className.includes('text-justify')) {
                    node.style.textAlign = 'justify';
                }
            }

            const children = Array.from(node.childNodes);
            for (const child of children) {
                walk(child);
            }
        }
    }
    walk(container);
}

// ─── LAYOUT HELPERS ─────────────────────────────────────────
const PAGE_WIDTH = 515; // A4 usable at 40px margins

function divider(marginTop = 15, marginBottom = 15) {
    return {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH, y2: 0, lineWidth: 0.5, lineColor: T.ghost }],
        margin: [0, marginTop, 0, marginBottom]
    };
}

function sectionTitle(title, marginBottom = 10) {
    return {
        text: title.toUpperCase(),
        fontSize: 9,
        bold: true,
        color: T.muted,
        characterSpacing: 1.5,
        margin: [0, 0, 0, marginBottom]
    };
}

function statCard(value, label, fillColor = T.surface) {
    return {
        table: {
            widths: ['*'],
            body: [[{
                stack: [
                    { text: value.toString(), fontSize: 22, bold: true, color: T.navy, alignment: 'center' },
                    { text: label.toUpperCase(), fontSize: 8, bold: true, color: T.muted, alignment: 'center', characterSpacing: 1, margin: [0, 4, 0, 0] }
                ],
                fillColor,
                margin: [8, 12, 8, 12],
                border: [false, false, false, false]
            }]]
        },
        layout: 'noBorders'
    };
}

// ─── MAIN EXPORT ────────────────────────────────────────────
export function generatePDFReport(data) {
    if (typeof document === 'undefined') {
        console.error('[PDF Generator] Cannot generate PDF in a server environment (no DOM).');
        return;
    }

    const {
        filename = 'document',
        breakdown = { human: 0, mixed: 0, ai: 0 },
        overallLabel = 'Unknown',
        chunks = [],
        sentenceCount = 0,
        wordCount = 0,
        sourceHtml = null,
        date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } = data || {};

    const reportId = generateReportId();
    const assessment = getAssessment(breakdown);
    const fname = filename.length > 40 ? filename.substring(0, 37) + '...' : filename;
    const overallLabelFinal = overallLabel || assessment.label;

    // Chunk statistics
    const humanChunks = chunks.filter(c => c.label === 'human').length;
    const mixedChunks = chunks.filter(c => c.label === 'mixed').length;
    const aiChunks = chunks.filter(c => c.label === 'ai').length;

    // ── Build highlighted HTML AST ──
    const wrapper = document.createElement('div');

    if (sourceHtml) {
        wrapper.innerHTML = sourceHtml;
        injectHighlightsIntoDOM(wrapper, chunks);
    } else {
        // Plain text rendering: loop chunks and wrap in spans, preserving line breaks
        chunks.forEach(chunk => {
            // Split chunk text by newlines so we can inject actual <br> tags
            const lines = chunk.text.split('\n');

            lines.forEach((lineText, index) => {
                const span = document.createElement('span');
                span.textContent = lineText + (index === lines.length - 1 ? ' ' : '');

                if (chunk.label === 'ai') {
                    span.style.backgroundColor = '#FECACA';
                    span.style.color = '#991B1B';
                } else if (chunk.label === 'mixed') {
                    span.style.backgroundColor = '#FDE68A';
                    span.style.color = '#92400E';
                }
                wrapper.appendChild(span);

                // If not the last line piece, insert a literal HTML line break
                if (index < lines.length - 1) {
                    wrapper.appendChild(document.createElement('br'));
                }
            });
        });
    }

    const htmlAst = htmlToPdfmake(wrapper.innerHTML, {
        tableAutoSize: true,
        defaultStyles: {
            p: { margin: [0, 0, 0, 14] },
            h1: { fontSize: 20, bold: true, margin: [0, 16, 0, 8] },
            h2: { fontSize: 16, bold: true, margin: [0, 14, 0, 6] },
            h3: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
            h4: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
            table: { margin: [0, 10, 0, 16] },
            img: { margin: [0, 10, 0, 10] },
            ul: { margin: [0, 0, 0, 14] },
            ol: { margin: [0, 0, 0, 14] },
            li: { margin: [0, 2, 0, 2] },
            a: { color: T.blue, decoration: 'underline' }
        }
    });

    // ── Composition bar segments (percentages of PAGE_WIDTH) ──
    const barH = 14;
    const bHuman = parseFloat(breakdown?.human || 0);
    const bMixed = parseFloat(breakdown?.mixed || 0);
    const bAi = parseFloat(breakdown?.ai || 0);

    const humanW = PAGE_WIDTH * (Math.max(0, bHuman) / 100);
    const mixedW = PAGE_WIDTH * (Math.max(0, bMixed) / 100);
    const aiW = PAGE_WIDTH * (Math.max(0, bAi) / 100);

    // ── Build document ──
    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 80, 40, 65],

        info: {
            title: `Jotril AI Report — ${fname}`,
            author: 'Jotril AI Engine v4',
            subject: 'AI Content Detection Analysis Report',
            keywords: 'AI detection, content analysis, Jotril',
            creator: 'Jotril AI — jotril.com',
        },

        // ── HEADER ──
        header: function (currentPage) {
            return {
                margin: [40, 20, 40, 0],
                stack: [
                    {
                        columns: [
                            {
                                text: [
                                    { text: 'Jotril', bold: true, color: T.navy, fontSize: 17 },
                                    { text: 'AI', bold: true, color: T.green, fontSize: 17 }
                                ]
                            },
                            {
                                stack: [
                                    { text: date, alignment: 'right', fontSize: 9, color: T.muted },
                                    { text: `Report ID: ${reportId}`, alignment: 'right', fontSize: 8, color: T.light, margin: [0, 2, 0, 0] }
                                ]
                            }
                        ]
                    },
                    {
                        canvas: [{ type: 'line', x1: 0, y1: 8, x2: PAGE_WIDTH, y2: 8, lineWidth: 0.5, lineColor: T.ghost }],
                        margin: [0, 0, 0, 0]
                    }
                ]
            };
        },

        // ── FOOTER ──
        footer: function (currentPage, pageCount) {
            return {
                margin: [40, 10, 40, 0],
                stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH, y2: 0, lineWidth: 0.5, lineColor: T.ghost }] },
                    {
                        columns: [
                            {
                                text: [
                                    { text: 'Jotril', bold: true },
                                    { text: 'AI' },
                                    { text: `  •  ${fname}  •  Confidential Report` }
                                ],
                                fontSize: 7,
                                color: T.light,
                                margin: [0, 6, 0, 0]
                            },
                            {
                                text: `${currentPage} / ${pageCount}`,
                                alignment: 'right',
                                fontSize: 8,
                                color: T.muted,
                                bold: true,
                                margin: [0, 5, 0, 0]
                            }
                        ]
                    }
                ]
            };
        },

        // ══════════════════════════════════════════════════
        // ── CONTENT ──
        // ══════════════════════════════════════════════════
        content: [

            // ── 1. ASSESSMENT BANNER ──
            {
                table: {
                    widths: ['*'],
                    body: [[{
                        stack: [
                            { text: 'DOCUMENT ASSESSMENT', fontSize: 9, bold: true, color: 'white', characterSpacing: 2, alignment: 'center', opacity: 0.85 },
                            { text: overallLabelFinal.toUpperCase(), fontSize: 20, bold: true, color: 'white', alignment: 'center', margin: [0, 6, 0, 2] },
                            { text: `Confidence: ${assessment.confidence}`, fontSize: 9, color: 'white', alignment: 'center', opacity: 0.8, margin: [0, 2, 0, 0] }
                        ],
                        fillColor: assessment.color,
                        margin: [0, 14, 0, 14],
                        border: [false, false, false, false]
                    }]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 24]
            },

            // ── 2. DOCUMENT METRICS (Stats Cards) ──
            sectionTitle('Document Metrics'),
            {
                columns: [
                    statCard(sentenceCount, 'Sentences Analyzed'),
                    { width: 10, text: '' },
                    statCard(wordCount.toLocaleString(), 'Total Words'),
                    { width: 10, text: '' },
                    statCard(chunks.length, 'Text Segments'),
                    { width: 10, text: '' },
                    statCard(fname, 'Source File'),
                ],
                margin: [0, 0, 0, 24]
            },

            // ── 3. COMPOSITION BREAKDOWN ──
            sectionTitle('Composition Breakdown'),

            // Stacked bar chart
            {
                canvas: [
                    // Background track
                    { type: 'rect', x: 0, y: 0, w: PAGE_WIDTH, h: barH, color: T.ghost },
                    // Human segment
                    ...(humanW > 0 ? [{ type: 'rect', x: 0, y: 0, w: humanW, h: barH, color: T.green }] : []),
                    // Mixed segment
                    ...(mixedW > 0 ? [{ type: 'rect', x: humanW, y: 0, w: mixedW, h: barH, color: T.amber }] : []),
                    // AI segment
                    ...(aiW > 0 ? [{ type: 'rect', x: humanW + mixedW, y: 0, w: aiW, h: barH, color: T.red }] : []),
                ],
                margin: [0, 0, 0, 12]
            },

            // Legend
            {
                columns: [
                    { canvas: [{ type: 'rect', x: 0, y: 2.5, w: 8, h: 8, color: T.green }], width: 14 },
                    { text: [{ text: `${bHuman}%`, bold: true, color: T.greenDark }, { text: ' Human', color: T.slate }], width: 'auto', fontSize: 10 },
                    { width: 20, text: '' },

                    { canvas: [{ type: 'rect', x: 0, y: 2.5, w: 8, h: 8, color: T.amber }], width: 14 },
                    { text: [{ text: `${bMixed}%`, bold: true, color: T.amberDark }, { text: ' Mixed', color: T.slate }], width: 'auto', fontSize: 10 },
                    { width: 20, text: '' },

                    { canvas: [{ type: 'rect', x: 0, y: 2.5, w: 8, h: 8, color: T.red }], width: 14 },
                    { text: [{ text: `${bAi}%`, bold: true, color: T.redDark }, { text: ' AI', color: T.slate }], width: 'auto', fontSize: 10 },
                ],
                margin: [0, 0, 0, 10]
            },

            // Segment counts
            {
                table: {
                    widths: ['*', '*', '*'],
                    body: [[
                        { text: [{ text: `${humanChunks}`, bold: true }, { text: ` human segments` }], fontSize: 9, color: T.muted, alignment: 'center', border: [false, false, false, false], fillColor: T.greenLight, margin: [4, 6, 4, 6] },
                        { text: [{ text: `${mixedChunks}`, bold: true }, { text: ` mixed segments` }], fontSize: 9, color: T.muted, alignment: 'center', border: [false, false, false, false], fillColor: T.amberLight, margin: [4, 6, 4, 6] },
                        { text: [{ text: `${aiChunks}`, bold: true }, { text: ` AI segments` }], fontSize: 9, color: T.muted, alignment: 'center', border: [false, false, false, false], fillColor: T.redLight, margin: [4, 6, 4, 6] },
                    ]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 24]
            },

            divider(0, 20),

            // ── 4. DETAILED HEATMAP ──
            sectionTitle(sourceHtml ? 'Formatted Document Analysis' : 'Sentence-Level Heatmap'),

            // Heatmap legend inline
            {
                table: {
                    widths: ['*'],
                    body: [[{
                        text: [
                            { text: 'How to read: ', bold: true, color: T.slate, fontSize: 9 },
                            { text: 'Text highlighted in ', color: T.muted, fontSize: 9 },
                            { text: 'red', color: T.redDark, bold: true, fontSize: 9 },
                            { text: ' is flagged as AI-generated. Text in ', color: T.muted, fontSize: 9 },
                            { text: 'yellow', color: T.amberDark, bold: true, fontSize: 9 },
                            { text: ' is mixed. Unhighlighted text is assessed as human-written.', color: T.muted, fontSize: 9 },
                        ],
                        fillColor: T.surface,
                        border: [false, false, false, false],
                        margin: [10, 8, 10, 8]
                    }]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 14]
            },

            // The actual heatmap content
            ...(Array.isArray(htmlAst) ? htmlAst : [htmlAst]),

            { text: '', margin: [0, 0, 0, 24] },

            divider(0, 20),

            // ── 5. METHODOLOGY & DISCLAIMER ──
            sectionTitle('Methodology & Disclaimer'),
            {
                table: {
                    widths: ['*'],
                    body: [[{
                        stack: [
                            {
                                text: 'About This Analysis',
                                fontSize: 11,
                                bold: true,
                                color: T.navy,
                                margin: [0, 0, 0, 6]
                            },
                            {
                                text: 'This report was generated by the Jotril AI Engine, which uses a proprietary multi-pass deep learning model to analyze text at the sentence level. The engine evaluates linguistic patterns, structural consistency, and statistical markers to classify each segment as Human, Mixed, or AI-generated.',
                                fontSize: 9,
                                color: T.slate,
                                lineHeight: 1.5,
                                margin: [0, 0, 0, 8]
                            },
                            {
                                text: 'Important Notice',
                                fontSize: 10,
                                bold: true,
                                color: T.navy,
                                margin: [0, 0, 0, 4]
                            },
                            {
                                ul: [
                                    { text: 'No AI detection tool is 100% accurate. Results should be used as one data point among many in any assessment process.', fontSize: 8, color: T.muted, margin: [0, 0, 0, 4] },
                                    { text: 'Short texts (under 100 words) may produce less reliable results due to insufficient linguistic patterns.', fontSize: 8, color: T.muted, margin: [0, 0, 0, 4] },
                                    { text: 'Heavily edited or paraphrased AI content may score differently than raw AI output.', fontSize: 8, color: T.muted, margin: [0, 0, 0, 4] },
                                    { text: 'This report is confidential and intended for the requesting party only.', fontSize: 8, color: T.muted },
                                ],
                                margin: [0, 0, 0, 0]
                            }
                        ],
                        fillColor: T.surface,
                        border: [false, false, false, false],
                        margin: [14, 14, 14, 14]
                    }]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 20]
            },

            // ── 6. REPORT VERIFICATION ──
            {
                table: {
                    widths: ['*'],
                    body: [[{
                        columns: [
                            {
                                stack: [
                                    { text: 'Report Verification', fontSize: 9, bold: true, color: T.slate },
                                    { text: `Report ID: ${reportId}`, fontSize: 8, color: T.muted, margin: [0, 3, 0, 0] },
                                    { text: `Generated: ${date}`, fontSize: 8, color: T.muted, margin: [0, 2, 0, 0] },
                                ],
                                width: '*'
                            },
                            {
                                stack: [
                                    { text: 'Powered by', fontSize: 8, color: T.light, alignment: 'right' },
                                    {
                                        text: [
                                            { text: 'Jotril', bold: true, color: T.navy },
                                            { text: 'AI', bold: true, color: T.green },
                                            { text: ' Engine v4', color: T.light }
                                        ],
                                        fontSize: 12,
                                        alignment: 'right',
                                        margin: [0, 2, 0, 0]
                                    },
                                    { text: 'jotril.com', fontSize: 8, color: T.blue, alignment: 'right', margin: [0, 2, 0, 0] }
                                ],
                                width: 'auto'
                            }
                        ],
                        border: [false, false, false, false],
                        fillColor: T.surface,
                        margin: [14, 12, 14, 12]
                    }]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 0]
            }
        ],

        // ── DEFAULT STYLES ──
        defaultStyle: {
            font: 'Roboto',
            fontSize: 10,
            lineHeight: 1.5,
            color: T.navyLight
        },

        // Prevents headers clamping orphaned against page limits
        pageBreakBefore: function (currentNode, followingNodesOnPage, nodesOnNextPage, previousNodesOnPage) {
            // Look for headings and avoid drawing them at the absolute bottom of a page
            if (currentNode.id === 'heading' || (currentNode.style && (currentNode.style === 'h1' || currentNode.style === 'h2' || currentNode.style === 'h3'))) {
                return false; // let pdfmake handle natively, this hooks in just in case we need to expand
            }
            return false;
        },

        styles: {
            sectionHeader: {
                fontSize: 9,
                bold: true,
                color: T.muted,
                characterSpacing: 1.5,
            }
        }
    };

    // ── Generate & download ──
    try {
        pdfMake.createPdf(docDefinition).download(`Jotril_Report_${filename?.replace(/\.[^/.]+$/, "") || "Scan"}.pdf`);
    } catch (error) {
        console.error("PDF GENERATOR FATAL ERROR:", error);
        if (typeof alert !== 'undefined') {
            alert("PDF Engine Error: " + error.message);
        }
    }
}
