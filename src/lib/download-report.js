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
import { resilientFetch } from "@/lib/resilient-fetch";

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

        // Persisted scan (fresh-with-id or history) → IDM-proof download.
        // Trigger a real browser download via <a download> navigation to a GET
        // endpoint instead of fetch+blob. Download-manager extensions (IDM/FDM)
        // and the browser handle the bytes directly, so JS never reads the
        // response and can't be intercepted into a 0-byte file. The endpoint
        // serves the GCS-cached high-fidelity report (Gotenberg + highlights +
        // cover) or renders on the fly. A HEAD preflight surfaces auth/missing
        // errors without downloading a junk file.
        if (scanId) {
            const url = `/api/report/download?scanId=${encodeURIComponent(scanId)}`;
            try {
                const head = await fetch(url, { method: "HEAD", credentials: "same-origin", signal });
                if (!head.ok) {
                    let msg = "Failed to generate report.";
                    if (head.status === 401) msg = "Please sign in to download this report.";
                    else if (head.status === 404) msg = "This scan could not be found.";
                    throw new Error(msg);
                }
            } catch (e) {
                if (e?.name === "AbortError") return false;
                showToast(e?.message || "Failed to generate report.", "error");
                return false;
            }
            const a = document.createElement("a");
            a.href = url;
            a.download = `Jotril_Report_${baseName(filename)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            return true;
        }

        // Inline (text scan, or fresh scan before it's persisted) → POST render.
        // resilientFetch retries transient 5xx/network with backoff; the report
        // job is deterministic so retrying is safe.
        const res = await resilientFetch("/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, breakdown, overallLabel, chunks, sentenceCount, wordCount, sourceHtml }),
            signal,
            retry: true,
            timeoutMs: 60000, // headless Chrome render can be slow on big docs
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
