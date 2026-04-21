import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

/**
 * Premium PDF Report Generator for Jotril AI — V2 Formatting Engine
 * 
 * Two rendering paths:
 * A) HTML Path (DOCX): Parses sourceHtml DOM tree, walks elements, renders with
 *    proper fonts/sizes/indentation/tables + overlays chunk highlight colors.
 * B) Plain Text Fallback: Enhanced flat renderer with paragraph/bullet/heading detection.
 */

// ─── COLORS ─────────────────────────────────────────────────
const COLORS = {
    navy: [15, 23, 42],
    ash: [100, 116, 139],
    human: [16, 185, 129],
    mixed: [245, 158, 11],
    ai: [239, 68, 68],
    bgLight: [248, 250, 252],
    silver: [226, 232, 240],
    white: [255, 255, 255],
};

function blendHighlight(rgb, alpha) {
    return [
        Math.round(255 * (1 - alpha) + rgb[0] * alpha),
        Math.round(255 * (1 - alpha) + rgb[1] * alpha),
        Math.round(255 * (1 - alpha) + rgb[2] * alpha),
    ];
}

function getLabelColor(label) {
    if (label === 'ai') return COLORS.ai;
    if (label === 'mixed') return COLORS.mixed;
    return null; // human gets no highlight
}

// ─── CHUNK-TO-CHARACTER MAP ─────────────────────────────────
// Maps every character position in the full text to a chunk label.
function buildChunkMap(chunks) {
    const map = [];
    for (const chunk of chunks) {
        const text = chunk.text;
        for (let i = 0; i < text.length; i++) {
            map.push(chunk.label);
        }
    }
    return map;
}

// Fuzzy-forward match: walks through targetText and chunkMap simultaneously,
// skipping whitespace mismatches to find the label for each character in targetText.
function matchTextToChunkMap(targetText, fullAnalysisText, chunkMap) {
    const result = []; // label per char of targetText
    let aPtr = 0; // pointer into fullAnalysisText / chunkMap

    for (let t = 0; t < targetText.length; t++) {
        const tChar = targetText[t];

        // Skip whitespace differences in analysis text
        while (aPtr < fullAnalysisText.length && /\s/.test(fullAnalysisText[aPtr]) && !(/\s/.test(tChar))) {
            aPtr++;
        }
        // Skip whitespace in target that doesn't have a match
        if (/\s/.test(tChar) && aPtr < fullAnalysisText.length && !(/\s/.test(fullAnalysisText[aPtr]))) {
            result.push(chunkMap[Math.max(0, aPtr - 1)] || 'human');
            continue;
        }

        if (aPtr < chunkMap.length) {
            result.push(chunkMap[aPtr]);
            aPtr++;
        } else {
            result.push('human');
        }
    }
    return result;
}

// ─── REPORT HEADER & SUMMARY ────────────────────────────────
function renderReportHeader(doc, data, margin, pageWidth) {
    let y = 25;

    // Brand
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...COLORS.navy);
    doc.text("Jotril", margin, y);
    const jw = doc.getTextWidth("Jotril");
    doc.setTextColor(...COLORS.human);
    doc.text("AI", margin + jw + 1, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.ash);
    doc.text("Premium AI Detection Report", margin, y + 8);
    doc.text(`Date: ${data.date || new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: 'right' });
    y += 20;

    // Divider
    doc.setDrawColor(...COLORS.silver);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Document Assessment Banner
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.navy);
    doc.text("Document Assessment", margin, y);
    y += 10;

    const { breakdown, overallLabel } = data;
    const assessmentColor = breakdown.ai >= 60 ? COLORS.ai :
        (breakdown.ai >= 30 || breakdown.mixed >= 40) ? COLORS.mixed : COLORS.human;

    const contentWidth = pageWidth - (margin * 2);
    doc.setFillColor(...assessmentColor);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(overallLabel.toUpperCase(), margin + (contentWidth / 2), y + 7.5, { align: 'center' });
    y += 22;

    // Stats
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.ash);
    doc.text("STATISTICS", margin, y);
    y += 8;

    const colWidth = contentWidth / 3;
    const drawStat = (label, value, x) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...COLORS.navy);
        doc.text(String(value), x, y + 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.ash);
        doc.text(label.toUpperCase(), x, y + 16);
    };

    const fname = data.filename.length > 20 ? data.filename.substring(0, 17) + "..." : data.filename;
    drawStat("Sentences", data.sentenceCount, margin);
    drawStat("Words", data.wordCount, margin + colWidth);
    drawStat("File", fname, margin + (colWidth * 2));
    y += 30;

    // Composition Breakdown Bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.ash);
    doc.text("COMPOSITION BREAKDOWN", margin, y);
    y += 6;

    let currentX = margin;
    const drawPart = (pct, color) => {
        if (pct <= 0) return;
        const w = (pct / 100) * contentWidth;
        doc.setFillColor(...color);
        doc.rect(currentX, y, w, 6, 'F');
        currentX += w;
    };
    drawPart(breakdown.human, COLORS.human);
    drawPart(breakdown.mixed, COLORS.mixed);
    drawPart(breakdown.ai, COLORS.ai);
    y += 12;

    const drawLegend = (label, value, color, x) => {
        doc.setFillColor(...color);
        doc.rect(x, y, 3, 3, 'F');
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.navy);
        doc.text(`${value}%`, x + 5, y + 2.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.ash);
        doc.text(label, x + 14, y + 2.5);
    };
    drawLegend("Human", breakdown.human, COLORS.human, margin);
    drawLegend("Mixed", breakdown.mixed, COLORS.mixed, margin + colWidth);
    drawLegend("AI", breakdown.ai, COLORS.ai, margin + (colWidth * 2));
    y += 20;

    return y;
}

// ─── PAGE MANAGEMENT ────────────────────────────────────────
function ensureSpace(doc, y, needed, pageHeight, margin, filename) {
    if (y + needed > pageHeight - 20) {
        doc.addPage();
        // Mini header on continuation pages
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.ash);
        doc.text(`Jotril AI Report — ${filename}`, margin, 12);
        doc.setDrawColor(...COLORS.silver);
        doc.line(margin, 14, doc.internal.pageSize.getWidth() - margin, 14);
        return 22;
    }
    return y;
}

// ─── RENDER HIGHLIGHTED WORDS (INLINE) ──────────────────────
// Renders a piece of text word-by-word with highlight backgrounds.
// charLabels is an array of labels per character.
function renderHighlightedText(doc, text, charLabels, startState) {
    let { x, y, margin, maxX, lineHeight, pageHeight, filename, fontStyle, fontSize } = startState;

    doc.setFont("helvetica", fontStyle || "normal");
    doc.setFontSize(fontSize || 10);
    doc.setTextColor(...COLORS.navy);

    const spaceW = doc.getTextWidth(" ");

    // Split into words and render each
    const words = text.split(/(\s+)/);
    let charIdx = 0;

    for (const segment of words) {
        if (segment.length === 0) continue;

        // Pure whitespace segment
        if (/^\s+$/.test(segment)) {
            // Count newlines
            const newlines = (segment.match(/\n/g) || []).length;
            if (newlines > 0) {
                x = margin;
                y += lineHeight * newlines;
                y = ensureSpace(doc, y, lineHeight, pageHeight, margin, filename);
            } else {
                x += spaceW;
            }
            charIdx += segment.length;
            continue;
        }

        const wordWidth = doc.getTextWidth(segment);

        // Wrap to next line if needed
        if (x + wordWidth > maxX && x > margin) {
            x = margin;
            y += lineHeight;
            y = ensureSpace(doc, y, lineHeight, pageHeight, margin, filename);
        }

        // Determine the dominant label for this word
        const wordLabels = charLabels.slice(charIdx, charIdx + segment.length);
        const labelCounts = {};
        for (const l of wordLabels) {
            labelCounts[l] = (labelCounts[l] || 0) + 1;
        }
        let dominantLabel = 'human';
        let maxCount = 0;
        for (const [lbl, cnt] of Object.entries(labelCounts)) {
            if (cnt > maxCount) { maxCount = cnt; dominantLabel = lbl; }
        }

        // Draw highlight background
        const labelColor = getLabelColor(dominantLabel);
        if (labelColor) {
            const alpha = dominantLabel === 'ai' ? 0.18 : 0.14;
            const bg = blendHighlight(labelColor, alpha);
            doc.setFillColor(...bg);
            doc.rect(x, y - 3.5, wordWidth + 0.5, lineHeight - 0.5, 'F');
        }

        doc.setFont("helvetica", fontStyle || "normal");
        doc.setFontSize(fontSize || 10);
        doc.setTextColor(...COLORS.navy);
        doc.text(segment, x, y);
        x += wordWidth + spaceW;
        charIdx += segment.length;
    }

    return { x, y };
}

// ─── HTML DOM WALKER ────────────────────────────────────────
function renderHtmlBody(doc, sourceHtml, chunks, startY, margin, pageWidth, pageHeight, filename) {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(sourceHtml, 'text/html');

    const contentWidth = pageWidth - (margin * 2);
    const maxX = pageWidth - margin;

    // Build full analysis text and chunk map
    const fullText = chunks.map(c => c.text).join('');
    const chunkMap = buildChunkMap(chunks);

    // Extract full text from HTML for fuzzy matching
    const htmlText = htmlDoc.body.textContent || '';
    const charLabels = matchTextToChunkMap(htmlText, fullText, chunkMap);

    let y = startY;
    let globalCharIdx = 0;
    const lineHeight = 6;

    function walkNode(node, fontStyle = "normal", fontSize = 10, indent = 0) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent;
            if (!text || text.trim() === '') {
                globalCharIdx += text.length;
                return;
            }

            const labels = charLabels.slice(globalCharIdx, globalCharIdx + text.length);
            const xStart = margin + indent;

            const result = renderHighlightedText(doc, text, labels, {
                x: xStart, y, margin: margin + indent, maxX, lineHeight, pageHeight, filename, fontStyle, fontSize
            });
            y = result.y;

            globalCharIdx += text.length;
            return;
        }

        if (node.nodeType !== 1) return; // Only process element nodes

        const tag = node.tagName?.toLowerCase();

        // ─── Headings ───
        if (/^h[1-6]$/.test(tag)) {
            const level = parseInt(tag[1]);
            const hSize = Math.max(10, 20 - (level * 2)); // h1=18, h2=16, h3=14...
            y += 6;
            y = ensureSpace(doc, y, hSize + 6, pageHeight, margin, filename);

            for (const child of node.childNodes) {
                walkNode(child, "bold", hSize, indent);
            }
            y += 8;
            return;
        }

        // ─── Paragraphs ───
        if (tag === 'p') {
            y = ensureSpace(doc, y, lineHeight + 4, pageHeight, margin, filename);
            for (const child of node.childNodes) {
                walkNode(child, fontStyle, fontSize, indent);
            }
            y += 5;
            return;
        }

        // ─── Unordered List ───
        if (tag === 'ul') {
            y += 2;
            for (const child of node.childNodes) {
                walkNode(child, fontStyle, fontSize, indent);
            }
            y += 2;
            return;
        }

        // ─── Ordered List ───
        if (tag === 'ol') {
            y += 2;
            let counter = 1;
            for (const child of node.childNodes) {
                if (child.tagName?.toLowerCase() === 'li') {
                    child._olIndex = counter++;
                }
                walkNode(child, fontStyle, fontSize, indent);
            }
            y += 2;
            return;
        }

        // ─── List Items ───
        if (tag === 'li') {
            y = ensureSpace(doc, y, lineHeight + 2, pageHeight, margin, filename);
            const bulletIndent = indent + 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(fontSize);
            doc.setTextColor(...COLORS.navy);

            if (node._olIndex) {
                doc.text(`${node._olIndex}.`, margin + indent, y);
            } else {
                doc.text("•", margin + indent + 1, y);
            }

            for (const child of node.childNodes) {
                walkNode(child, fontStyle, fontSize, bulletIndent);
            }
            y += 3;
            return;
        }

        // ─── Tables ───
        if (tag === 'table') {
            y = ensureSpace(doc, y, 20, pageHeight, margin, filename);
            const tableData = [];
            const rows = node.querySelectorAll('tr');

            for (const row of rows) {
                const cells = row.querySelectorAll('td, th');
                const rowData = [];
                for (const cell of cells) {
                    const cellText = cell.textContent.trim();
                    // Find label for this cell's text
                    const cellLabels = charLabels.slice(globalCharIdx, globalCharIdx + cellText.length);
                    // Count dominant label
                    const counts = {};
                    for (const l of cellLabels) counts[l] = (counts[l] || 0) + 1;
                    let dominant = 'human';
                    let max = 0;
                    for (const [lbl, c] of Object.entries(counts)) {
                        if (c > max) { max = c; dominant = lbl; }
                    }
                    rowData.push({ content: cellText, label: dominant });
                    globalCharIdx += cell.textContent.length;
                }
                tableData.push(rowData);
            }

            if (tableData.length > 0) {
                const isHeader = rows[0]?.querySelector('th') !== null;
                const head = isHeader ? [tableData[0].map(c => c.content)] : [];
                const body = (isHeader ? tableData.slice(1) : tableData).map(r => r.map(c => c.content));

                // Build cell styles for highlighting
                const bodyCellStyles = {};
                const bodyRows = isHeader ? tableData.slice(1) : tableData;
                bodyRows.forEach((row, ri) => {
                    row.forEach((cell, ci) => {
                        const color = getLabelColor(cell.label);
                        if (color) {
                            const alpha = cell.label === 'ai' ? 0.15 : 0.12;
                            const bg = blendHighlight(color, alpha);
                            if (!bodyCellStyles[ri]) bodyCellStyles[ri] = {};
                            bodyCellStyles[ri][ci] = { fillColor: bg };
                        }
                    });
                });

                doc.autoTable({
                    head: head,
                    body: body,
                    startY: y,
                    margin: { left: margin, right: margin },
                    styles: {
                        font: 'helvetica',
                        fontSize: 9,
                        textColor: COLORS.navy,
                        lineColor: COLORS.silver,
                        lineWidth: 0.3,
                    },
                    headStyles: {
                        fillColor: COLORS.navy,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                    },
                    bodyStyles: {
                        fillColor: COLORS.white,
                    },
                    columnStyles: {},
                    didParseCell: function (data) {
                        if (data.section === 'body') {
                            const style = bodyCellStyles[data.row.index]?.[data.column.index];
                            if (style) {
                                data.cell.styles.fillColor = style.fillColor;
                            }
                        }
                    },
                });

                y = doc.lastAutoTable.finalY + 8;
            }
            return;
        }

        // ─── Bold / Italic ───
        if (tag === 'strong' || tag === 'b') {
            for (const child of node.childNodes) {
                walkNode(child, "bold", fontSize, indent);
            }
            return;
        }
        if (tag === 'em' || tag === 'i') {
            for (const child of node.childNodes) {
                walkNode(child, "italic", fontSize, indent);
            }
            return;
        }

        // ─── Line break ───
        if (tag === 'br') {
            y += lineHeight;
            y = ensureSpace(doc, y, lineHeight, pageHeight, margin, filename);
            return;
        }

        // ─── Default: recurse into children ───
        for (const child of node.childNodes) {
            walkNode(child, fontStyle, fontSize, indent);
        }
    }

    // Walk all body children
    for (const child of htmlDoc.body.childNodes) {
        walkNode(child);
    }

    return y;
}

// ─── PLAIN TEXT FALLBACK RENDERER ───────────────────────────
function renderPlainTextBody(doc, chunks, startY, margin, pageWidth, pageHeight, filename) {
    const lineHeight = 7;
    const maxX = pageWidth - margin;
    let y = startY;
    let currentLineX = margin;

    for (const chunk of chunks) {
        const text = chunk.text.trim();
        if (!text) continue;

        const lines = text.split('\n');

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];

            // Detect structural patterns in plain text
            const isBullet = /^[\-•\*]\s/.test(line);
            const isNumbered = /^\d+\.\s/.test(line);
            const isHeading = (line === line.toUpperCase() && line.length < 80 && line.length > 2) || /^#{1,3}\s/.test(line);
            const isEmpty = line.trim() === '';

            if (isEmpty) {
                y += 4;
                currentLineX = margin;
                continue;
            }

            y = ensureSpace(doc, y, lineHeight + 2, pageHeight, margin, filename);

            let indent = 0;
            let prefix = '';

            if (isBullet) {
                indent = 6;
                prefix = '•  ';
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(...COLORS.navy);
                doc.text(prefix, margin, y);
            } else if (isNumbered) {
                indent = 8;
                const numMatch = line.match(/^(\d+\.)\s/);
                prefix = numMatch ? numMatch[1] + ' ' : '';
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(...COLORS.navy);
                doc.text(prefix, margin, y);
            }

            const cleanLine = isBullet ? line.replace(/^[\-•\*]\s/, '') :
                isNumbered ? line.replace(/^\d+\.\s/, '') :
                    isHeading ? line.replace(/^#{1,3}\s/, '') : line;

            const fontStyle = isHeading ? "bold" : "normal";
            const fontSize = isHeading ? 13 : 10;

            doc.setFont("helvetica", fontStyle);
            doc.setFontSize(fontSize);
            doc.setTextColor(...COLORS.navy);

            currentLineX = margin + indent;

            const words = cleanLine.split(/\s+/);
            for (const word of words) {
                if (!word) continue;
                const wordWidth = doc.getTextWidth(word + " ");

                if (currentLineX + wordWidth > maxX && currentLineX > margin + indent) {
                    currentLineX = margin + indent;
                    y += lineHeight;
                    y = ensureSpace(doc, y, lineHeight, pageHeight, margin, filename);
                }

                // Highlight
                const labelColor = getLabelColor(chunk.label);
                if (labelColor) {
                    const alpha = chunk.label === 'ai' ? 0.18 : 0.14;
                    const bg = blendHighlight(labelColor, alpha);
                    doc.setFillColor(...bg);
                    doc.rect(currentLineX, y - 3.5, wordWidth, lineHeight - 0.5, 'F');
                }

                doc.setFont("helvetica", fontStyle);
                doc.setFontSize(fontSize);
                doc.setTextColor(...COLORS.navy);
                doc.text(word, currentLineX, y);
                currentLineX += wordWidth;
            }

            y += lineHeight;
            currentLineX = margin;

            if (isHeading) y += 3;
        }
    }

    return y;
}

// ─── MAIN EXPORT ────────────────────────────────────────────
export async function generatePDFReport(data) {
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

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // ── Render branded header & summary ──
    let y = renderReportHeader(doc, { filename, breakdown, overallLabel, sentenceCount, wordCount, date }, margin, pageWidth);

    // ── Section title ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.navy);
    doc.text(sourceHtml ? "Formatted Document Analysis" : "Sentence-Level Heatmap", margin, y);
    y += 10;

    // ── Render body ──
    if (sourceHtml) {
        y = renderHtmlBody(doc, sourceHtml, chunks, y, margin, pageWidth, pageHeight, filename);
    } else {
        y = renderPlainTextBody(doc, chunks, y, margin, pageWidth, pageHeight, filename);
    }

    // ── Footer on all pages ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.ash);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text("Verification powered by Jotril V2 Engine", margin, pageHeight - 10);
    }

    doc.save(`Jotril_Report_${filename.replace(/\.[^/.]+$/, "")}.pdf`);
}
