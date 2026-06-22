/**
 * DEPRECATED — replaced by the headless-Chrome report engine.
 *
 * The old pdfmake + html-to-pdfmake generator lost images, tables, spacing,
 * and page breaks. It has been superseded by:
 *   • src/lib/download-report.js   — client entry point ("Download PDF")
 *   • src/app/api/report/route.js  — server render endpoint
 *   • src/lib/report/*             — HTML template + headless-Chrome renderer
 *   • src/lib/pdf-overlay.js       — in-place highlighting for PDF uploads
 *
 * Kept only as a thin shim so any stray import fails loudly instead of
 * silently producing a broken report.
 */
export function generatePDFReport() {
    throw new Error(
        "generatePDFReport is deprecated. Use downloadReport() from '@/lib/download-report' instead."
    );
}
