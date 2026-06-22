"use client";
/**
 * Jotril Report — Client Download Orchestrator
 * ------------------------------------------------------------------
 * Single entry point for the "Download PDF" buttons. Routes by source type
 * for the best possible fidelity:
 *
 *   • PDF upload (File in hand) → overlay highlights on the ORIGINAL PDF
 *     in-place (pdf-lib) — literally perfect reproduction. Falls back to the
 *     server renderer if the overlay fails.
 *   • Everything else (DOCX, pasted text, past scans) → POST /api/report,
 *     which renders the branded HTML report via headless Chrome.
 *
 * Errors are surfaced as toasts; returns true on success, false otherwise.
 */
import { showToast } from "@/components/Toast";

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function baseName(filename) {
    return (
        String(filename || "Scan")
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-z0-9_-]+/gi, "_")
            .slice(0, 60)
    ) || "Scan";
}

export async function downloadReport(opts = {}) {
    const {
        file = null,
        scanId = null,
        filename,
        breakdown,
        overallLabel,
        chunks,
        sentenceCount,
        wordCount,
        sourceHtml,
        signal = null,
    } = opts;

    try {
        // PDF upload → highlight the original in-place (perfect fidelity).
        const isPdf = !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
        if (isPdf && Array.isArray(chunks) && chunks.length) {
            const { overlayPDFReport } = await import("@/lib/pdf-overlay");
            const ok = await overlayPDFReport({
                file,
                chunks,
                meta: { filename, breakdown, overallLabel, sentenceCount, wordCount },
            });
            if (ok) return true;
            showToast("Couldn't overlay the original PDF — generating a standard report instead.", "info");
            // fall through to the server renderer
        }

        // DOCX (fresh scan, original file in hand) + fidelity engine enabled →
        // convert to PDF via Gotenberg/LibreOffice, then overlay highlights
        // in-place like an uploaded PDF (native charts/tables/formatting kept).
        // Server-only Gotenberg config; the public flag just gates the attempt.
        // Any failure falls through to the standard /api/report renderer.
        const isDocx = !!file && (/\.docx?$/i.test(file.name || "") ||
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.type === "application/msword");
        if (
            isDocx && Array.isArray(chunks) && chunks.length &&
            process.env.NEXT_PUBLIC_REPORT_FIDELITY_ENGINE === "gotenberg"
        ) {
            try {
                const fd = new FormData();
                fd.append("file", file);
                const conv = await fetch("/api/report/convert", { method: "POST", body: fd, signal });
                if (conv.ok) {
                    const pdfBlob = await conv.blob();
                    const pdfName = (file.name || "document").replace(/\.[^/.]+$/, "") + ".pdf";
                    const pdfFile = new File([pdfBlob], pdfName, { type: "application/pdf" });
                    const { overlayPDFReport } = await import("@/lib/pdf-overlay");
                    const ok = await overlayPDFReport({
                        file: pdfFile,
                        chunks,
                        meta: { filename, breakdown, overallLabel, sentenceCount, wordCount },
                    });
                    if (ok) return true;
                }
                // convert disabled (501) / failed, or overlay failed → standard path
                showToast("High-fidelity render unavailable — generating a standard report.", "info");
            } catch (e) {
                if (e?.name === "AbortError") throw e; // user cancelled — don't fall through
                console.warn("[downloadReport] fidelity path failed, falling back:", e);
            }
            // fall through to the server-rendered report
        }

        // DOCX / text / past scan → server-rendered HTML report.
        const res = await fetch("/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                scanId
                    ? { scanId }
                    : { filename, breakdown, overallLabel, chunks, sentenceCount, wordCount, sourceHtml }
            ),
            signal,
        });

        if (!res.ok) {
            let msg = "Failed to generate report.";
            try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* non-JSON */ }
            throw new Error(msg);
        }

        const blob = await res.blob();
        saveBlob(blob, `Jotril_Report_${baseName(filename)}.pdf`);
        return true;
    } catch (e) {
        if (e?.name === "AbortError") return false; // user cancelled — handled by caller
        console.error("[downloadReport]", e);
        showToast(e?.message || "Failed to generate report.", "error");
        return false;
    }
}
