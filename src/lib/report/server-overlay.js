/**
 * Server-side highlight overlay for the cached high-fidelity report path.
 * Mirrors the client `pdf-overlay.js` logic in Node: extract text layout from
 * the Gotenberg-converted PDF (pdf.js), map analysed chunk labels onto the text
 * items (word-level resyncing alignment), draw AI/mixed rectangles (pdf-lib),
 * and prepend the branded cover.
 *
 * Server-only. pdf.js + pdf-lib must be in serverExternalPackages.
 */
import { PDFDocument, rgb } from 'pdf-lib';

// pdf.js legacy build runs in Node (it require()s "canvas" only for rendering,
// which we never do — getTextContent needs no canvas).
async function loadPdfjs() {
    return await import('pdfjs-dist/legacy/build/pdf.js');
}

async function extractLayout(pdfBytes) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true, isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const items = tc.items.map((it) => ({
            text: it.str || '',
            x: it.transform[4],
            y: it.transform[5],
            width: it.width || 0,
            height: it.height || 9,
            pageIndex: i - 1,
        }));
        pages.push(items);
    }
    return pages;
}

// Word-level resyncing alignment — identical logic to pdf-overlay.js so table
// cells / page numbers (absent from chunks) stay unhighlighted and never desync.
function mapChunksToItems(pages, chunks) {
    const flat = pages.flat();
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/gi, '');
    const cWords = [];
    for (const c of chunks) {
        const label = (c && c.label) || 'human';
        for (const raw of String((c && c.text) || '').split(/\s+/)) {
            const w = norm(raw);
            if (w) cWords.push({ w, label });
        }
    }
    const N = cWords.length;
    const RESYNC = 12;
    let wp = 0;
    const labelWord = (pw) => {
        if (!pw) return null;
        if (wp < N && cWords[wp].w === pw) { const l = cWords[wp].label; wp++; return l; }
        const maxK = Math.min(RESYNC, N - wp);
        for (let k = 1; k < maxK; k++) {
            if (cWords[wp + k].w === pw) { const l = cWords[wp + k].label; wp += k + 1; return l; }
        }
        return 'human';
    };
    for (const item of flat) {
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
    return flat;
}

/**
 * Produce the final highlighted report PDF.
 * @param {Buffer} convertedPdf  Gotenberg LibreOffice output (faithful render)
 * @param {Array}  chunks        analysed [{text,label,...}]
 * @param {Buffer|null} coverPdf  optional branded cover to prepend
 * @returns {Promise<Buffer>}
 */
export async function buildHighlightedReport(convertedPdf, chunks, coverPdf = null) {
    const pages = await extractLayout(convertedPdf);
    const items = mapChunksToItems(pages, Array.isArray(chunks) ? chunks : []);

    const pdfDoc = await PDFDocument.load(convertedPdf);
    const pdfPages = pdfDoc.getPages();
    for (const item of items) {
        if (item.label !== 'ai' && item.label !== 'mixed') continue;
        const page = pdfPages[item.pageIndex];
        if (!page) continue;
        page.drawRectangle({
            x: item.x - 1,
            y: item.y - 2,
            width: item.width + 2,
            height: item.height + 4,
            color: item.label === 'ai' ? rgb(0.99, 0.8, 0.8) : rgb(0.99, 0.9, 0.54),
            opacity: 0.45,
        });
    }

    if (coverPdf) {
        try {
            const coverDoc = await PDFDocument.load(coverPdf);
            const copied = await pdfDoc.copyPages(coverDoc, coverDoc.getPageIndices());
            copied.reverse().forEach((p) => pdfDoc.insertPage(0, p));
        } catch { /* cover optional */ }
    }

    const out = await pdfDoc.save();
    return Buffer.from(out);
}
