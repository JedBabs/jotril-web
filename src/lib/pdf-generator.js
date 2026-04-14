import { jsPDF } from 'jspdf';

/**
 * Premium PDF Report Generator for Jotril AI
 * Generates a high-quality, branded report including document metrics and sentence-level heatmap.
 */
export async function generatePDFReport(data) {
    const {
        filename,
        breakdown,
        overallLabel,
        chunks,
        sentenceCount,
        wordCount,
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
    const contentWidth = pageWidth - (margin * 2);

    // --- COLORS ---
    const colors = {
        navy: [15, 23, 42],
        ash: [100, 116, 139],
        human: [16, 185, 129],
        mixed: [245, 158, 11],
        ai: [239, 68, 68],
        bgLight: [248, 250, 252],
        silver: [226, 232, 240]
    };

    let y = 25;

    // --- HEADER ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...colors.navy);
    doc.text("Jotril", margin, y);

    // Brand Accent
    const jotrilWidth = doc.getTextWidth("Jotril");
    doc.setTextColor(...colors.human);
    doc.text("AI", margin + jotrilWidth + 1, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.ash);
    doc.text("Premium AI Detection Report", margin, y + 8);

    doc.text(`Date: ${date}`, pageWidth - margin, y, { align: 'right' });
    y += 20;

    // --- DIVIDER ---
    doc.setDrawColor(...colors.silver);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // --- DOCUMENT SUMMARY ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...colors.navy);
    doc.text("Document Assessment", margin, y);
    y += 10;

    // Assessment Logic (Matches ScoreGauge.jsx)
    const assessmentColor = breakdown.ai >= 60 ? colors.ai :
        (breakdown.ai >= 30 || breakdown.mixed >= 40) ? colors.mixed : colors.human;

    doc.setFillColor(...assessmentColor);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(overallLabel.toUpperCase(), margin + (contentWidth / 2), y + 7.5, { align: 'center' });
    y += 22;

    // --- METRICS GRID ---
    doc.setFontSize(10);
    doc.setTextColor(...colors.ash);
    doc.text("STATISTICS", margin, y);
    y += 8;

    const colWidth = contentWidth / 3;

    // Stats Boxes
    const drawStat = (label, value, x) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...colors.navy);
        doc.text(String(value), x, y + 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...colors.ash);
        doc.text(label.toUpperCase(), x, y + 16);
    };

    drawStat("Sentences", sentenceCount, margin);
    drawStat("Words", wordCount, margin + colWidth);
    drawStat("File", filename.length > 20 ? filename.substring(0, 17) + "..." : filename, margin + (colWidth * 2));

    y += 30;

    // --- BREAKDOWN PILL ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...colors.ash);
    doc.text("COMPOSITION BREAKDOWN", margin, y);
    y += 6;

    const barHeight = 6;
    let currentX = margin;

    const drawBarPart = (percent, color) => {
        if (percent <= 0) return;
        const width = (percent / 100) * contentWidth;
        doc.setFillColor(...color);
        doc.rect(currentX, y, width, barHeight, 'F');
        currentX += width;
    };

    drawBarPart(breakdown.human, colors.human);
    drawBarPart(breakdown.mixed, colors.mixed);
    drawBarPart(breakdown.ai, colors.ai);

    y += 12;

    const drawLegend = (label, value, color, x) => {
        doc.setFillColor(...color);
        doc.rect(x, y, 3, 3, 'F');
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.navy);
        doc.text(`${value}%`, x + 5, y + 2.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.ash);
        doc.text(label, x + 14, y + 2.5);
    };

    drawLegend("Human", breakdown.human, colors.human, margin);
    drawLegend("Mixed", breakdown.mixed, colors.mixed, margin + colWidth);
    drawLegend("AI", breakdown.ai, colors.ai, margin + (colWidth * 2));

    y += 20;

    // --- HEATMAP SECTION ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...colors.navy);
    doc.text("Sentence-Level Heatmap", margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...colors.navy);

    const lineHeight = 7;
    let currentLineX = margin;
    const spaceWidth = doc.getTextWidth(" ");

    for (const chunk of chunks) {
        const text = chunk.text.trim() + " ";
        const words = text.split(" ");

        for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i === words.length - 1 ? "" : " ");
            const wordWidth = doc.getTextWidth(word);

            // Check if we need a new page
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 25;
                currentLineX = margin;
                // Add tiny footer indicator on new pages
                doc.setFontSize(8);
                doc.setTextColor(...colors.ash);
                doc.text(`Jotril AI Report - ${filename}`, margin, 15);
                doc.setFontSize(10);
                doc.setTextColor(...colors.navy);
            }

            // Check if word fits on current line
            if (currentLineX + wordWidth > pageWidth - margin) {
                currentLineX = margin;
                y += lineHeight;
            }

            // Draw Highlight for AI/Mixed
            if (chunk.label === 'ai' || chunk.label === 'mixed') {
                const rgba = chunk.label === 'ai' ? colors.ai : colors.mixed;
                doc.setFillColor(...rgba);
                // Draw lighter highlight (manually adjust "opacity" by blending with white)
                const alpha = chunk.label === 'ai' ? 0.15 : 0.12;
                const r = Math.round(255 * (1 - alpha) + rgba[0] * alpha);
                const g = Math.round(255 * (1 - alpha) + rgba[1] * alpha);
                const b = Math.round(255 * (1 - alpha) + rgba[2] * alpha);
                doc.setFillColor(r, g, b);
                doc.rect(currentLineX, y - 4, wordWidth, lineHeight - 1, 'F');
            }

            doc.text(word, currentLineX, y);
            currentLineX += wordWidth;
        }
    }

    // --- FOOTER ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...colors.ash);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text("Verification powered by Jotril V2 Engine", margin, pageHeight - 10);
    }

    doc.save(`Jotril_Report_${filename.replace(/\.[^/.]+$/, "")}.pdf`);
}
