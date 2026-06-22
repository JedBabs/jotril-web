import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';

// Use a stable CDN for the PDF.js worker to avoid Next.js local worker bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extracts raw page text and item coordinates from a PDF file.
 */
async function extractPDFLayout(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        const items = textContent.items.map(item => {
            // Transform maps [scaleX, skewY, skewX, scaleY, translateX, translateY]
            const x = item.transform[4];
            const y = item.transform[5];
            const width = item.width;
            const height = item.height;
            return {
                text: item.str,
                x,
                y, // PDF coordinate (origin at bottom left)
                width,
                height,
                pageIndex: i - 1,
                pageHeight: viewport.height
            };
        });

        // Sort items spatially (top-to-bottom, then left-to-right) natively matching document flow
        items.sort((a, b) => {
            const yDiff = Math.abs(a.y - b.y);
            if (yDiff < 4) return a.x - b.x; // same line
            return b.y - a.y; // top to bottom
        });

        pages.push(items);
    }
    return pages;
}

/**
 * Maps Jotril AI sentence chunks to PDF spatial items via resyncing WORD-level
 * alignment, then labels each item by majority vote (so highlights are
 * word/item-atomic — never half a word).
 *
 * Word-level (not char-level) matching is what makes this robust: the chunk
 * pointer advances only when a whole PDF word matches the chunk word stream, so
 * stray letters can't spuriously resync. Any PDF text NOT in the analysed
 * chunks — table cells (exempt from scoring), page numbers, repeated
 * headers/footers LibreOffice emits — fails to match, is labelled 'human'
 * (unhighlighted), and does NOT consume chunk positions, so prose after a table
 * stays in sync. A bounded window absorbs occasional dropped/extra words.
 */
function mapChunksToItems(pagesItems, chunks) {
    const flatItems = pagesItems.flat();
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/gi, '');

    // Chunk word stream (prose only), each word carrying its sentence's label.
    const cWords = [];
    for (const chunk of chunks) {
        const label = chunk.label || 'human';
        for (const raw of String(chunk.text || '').split(/\s+/)) {
            const w = norm(raw);
            if (w) cWords.push({ w, label });
        }
    }
    const N = cWords.length;
    const RESYNC_WINDOW = 12;

    let wp = 0;
    const labelWord = (pw) => {
        if (!pw) return null; // punctuation-only token — doesn't vote
        if (wp < N && cWords[wp].w === pw) { const l = cWords[wp].label; wp++; return l; }
        const maxK = Math.min(RESYNC_WINDOW, N - wp);
        for (let k = 1; k < maxK; k++) {
            if (cWords[wp + k].w === pw) { const l = cWords[wp + k].label; wp += k + 1; return l; }
        }
        return 'human'; // PDF-only word (table cell / header / page number)
    };

    for (const item of flatItems) {
        let h = 0, mx = 0, ai = 0, voted = 0;
        for (const raw of String(item.text || '').split(/\s+/)) {
            const l = labelWord(norm(raw));
            if (l === null) continue;
            voted++;
            if (l === 'ai') ai++; else if (l === 'mixed') mx++; else h++;
        }
        item.label = voted === 0 ? 'human'
            : (ai >= mx && ai >= h && ai > 0) ? 'ai'
            : (mx >= h && mx > 0) ? 'mixed'
            : 'human';
    }

    return flatItems;
}

/**
 * Fetch a single-page branded cover from the server report engine so the
 * overlaid original gets a proper Jotril scorecard up front. Returns the PDF
 * bytes, or null if it can't be produced (cover is optional).
 */
async function fetchCoverPdf(meta, chunks) {
    try {
        const res = await fetch('/api/report?cover=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: meta?.filename,
                breakdown: meta?.breakdown,
                overallLabel: meta?.overallLabel,
                sentenceCount: meta?.sentenceCount,
                wordCount: meta?.wordCount,
                // labels only — the cover needs segment counts, not full text
                chunks: Array.isArray(chunks) ? chunks.map(c => ({ label: c.label })) : [],
            }),
        });
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
    } catch {
        return null;
    }
}

/**
 * Native Overlay Entry Point. Highlights the ORIGINAL PDF in-place (perfect
 * fidelity) and prepends a branded Jotril cover page.
 */
export async function overlayPDFReport({ file, chunks, meta = {} }) {
    try {
        const arrayBuffer = await file.arrayBuffer();

        // 1. Extract structural layout math
        const pagesLayout = await extractPDFLayout(new Uint8Array(arrayBuffer));

        // 2. Map AI classifications onto textual layout boxes
        const mappedItems = mapChunksToItems(pagesLayout, chunks);

        // 3. Inject overlays via pdf-lib
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();

        for (const item of mappedItems) {
            if (item.label !== 'ai' && item.label !== 'mixed') continue;

            const page = pages[item.pageIndex];
            if (!page) continue;

            const color = item.label === 'ai'
                ? rgb(0.99, 0.8, 0.8) // T.redLight equivalent
                : rgb(0.99, 0.9, 0.54); // T.amberLight equivalent

            page.drawRectangle({
                x: item.x - 1,
                y: item.y - 2, // Slight padding baseline correction
                width: item.width + 2,
                height: item.height + 4,
                color: color,
                opacity: 0.45 // Blend seamlessly over text without absolute masking
            });
        }

        // 4. Prepend the branded Jotril cover/scorecard (optional — skip on failure).
        try {
            const coverBytes = await fetchCoverPdf(meta, chunks);
            if (coverBytes) {
                const coverDoc = await PDFDocument.load(coverBytes);
                const coverPages = await pdfDoc.copyPages(coverDoc, coverDoc.getPageIndices());
                // insert in reverse so the original cover-page order is preserved at the front
                coverPages.reverse().forEach((p) => pdfDoc.insertPage(0, p));
            }
        } catch (coverErr) {
            console.warn('[PDF Overlay] Cover page skipped:', coverErr?.message || coverErr);
        }

        const modifiedPdfBytes = await pdfDoc.save();

        // Trigger generic secure download
        const blob = new Blob([modifiedPdfBytes], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Jotril_Report_Overlay_${file.name.replace(/\.[^/.]+$/, "")}.pdf`;
        link.click();

        return true;
    } catch (e) {
        console.error("PDF Overlay Generation Hard Failure:", e);
        return false; // Tells pipeline to try the existing fallback PDF builder
    }
}
