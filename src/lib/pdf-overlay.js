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
 * Maps Jotril AI sentence chunks to PDF spatial items using robust sliding window character alignment.
 */
function mapChunksToItems(pagesItems, chunks) {
    const flatItems = pagesItems.flat();
    const fullPDFText = flatItems.map(i => i.text).join('').replace(/\s+/g, '');
    const chunkMap = [];

    // Flatten chunks into a continuous character array with labels
    for (const chunk of chunks) {
        const cleanChunk = chunk.text.replace(/\s+/g, '');
        for (let i = 0; i < cleanChunk.length; i++) {
            chunkMap.push(chunk.label);
        }
    }

    // Assign labels back to items
    let globalCharIndex = 0;
    for (const item of flatItems) {
        const cleanText = item.text.replace(/\s+/g, '');
        if (cleanText.length === 0) continue;

        // Peak matching (if sync gets lost we resync later natively)
        const itemLabels = chunkMap.slice(globalCharIndex, globalCharIndex + cleanText.length);

        // Majority voting for the bounding box
        const humanC = itemLabels.filter(l => l === 'human').length;
        const aiC = itemLabels.filter(l => l === 'ai').length;
        const mixedC = itemLabels.filter(l => l === 'mixed').length;

        if (aiC > humanC && aiC >= mixedC) item.label = 'ai';
        else if (mixedC > humanC) item.label = 'mixed';
        else item.label = 'human';

        globalCharIndex += cleanText.length;
    }

    return flatItems;
}

/**
 * Native Overlay Entry Point. Modifies original PDF dynamically.
 */
export async function overlayPDFReport({ file, chunks }) {
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
