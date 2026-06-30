"use client";

import { useState, useCallback, useRef } from "react";
import { useProcess } from "@/components/ProcessContext";
import { showToast } from "@/components/Toast";
import { resilientFetch } from "@/lib/resilient-fetch";

const isDocxFile = (file) => !!file && (/\.docx?$/i.test(file.name || "") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword");

/**
 * Shared scan state optimized for Global Queue background decoupling.
 */
export function useAnalyze({ deviceHash, onAfterComplete } = {}) {
    const { isActive, openProcess, updateProcess, closeProcess } = useProcess();

    // Cancellation plumbing for the in-flight analysis: an AbortController for the
    // /api/analyze + /api/attribute fetches, the queue jobId so we can stop the
    // window querying, and a flag so a late queue callback can't paint stale results.
    const abortRef = useRef(null);
    const jobIdRef = useRef(null);
    const cancelledRef = useRef(false);
    // Holds { estimate, monthKey } for the budget the server reserved in /api/analyze.
    // The reservation is released exactly once: by /api/attribute on success (we then
    // null this), or by reconcileBudget() on any abandonment path. Prevents the reserve
    // from leaking into UsageBudget.used when a scan never reaches /api/attribute.
    const budgetRef = useRef(null);

    /**
     * One-shot release of the up-front budget reservation when a scan is abandoned
     * (cancel / attribution failure). Best-effort + idempotent: the first caller wins
     * (we null budgetRef immediately), so multiple abort paths can't double-refund, and
     * it no-ops once the success path has cleared the reservation. keepalive lets it
     * survive a navigation/unmount.
     */
    const reconcileBudget = useCallback((actualInvocations = 0) => {
        const b = budgetRef.current;
        if (!b || !b.monthKey || typeof b.estimate !== 'number') return;
        budgetRef.current = null;
        try {
            fetch('/api/budget/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthKey: b.monthKey, estimate: b.estimate, actualInvocations }),
                keepalive: true,
            }).catch(() => { /* best-effort — the server pool is authoritative */ });
        } catch { /* ignore */ }
    }, []);

    const cancelAnalysis = useCallback(() => {
        cancelledRef.current = true;
        try { abortRef.current?.abort(); } catch { /* already settled */ }
        const jobId = jobIdRef.current;
        jobIdRef.current = null;
        if (jobId) {
            import('@/lib/queue-manager')
                .then(({ QueueManager }) => {
                    // cancelJob returns the proxy calls already spent — refund the rest.
                    const spent = QueueManager.cancelJob(jobId);
                    reconcileBudget(typeof spent === 'number' ? spent : 0);
                })
                .catch(() => reconcileBudget(0)); // module load race — nothing ran
        } else {
            // Cancelled before the queue started (during /api/analyze, or right after) —
            // nothing has been spent, so refund the whole reservation.
            reconcileBudget(0);
        }
        showToast("Analysis cancelled.", "info");
    }, [reconcileBudget]);

    const [results, setResults] = useState(null);
    const [breakdown, setBreakdown] = useState(null);
    const [overallLabel, setOverallLabel] = useState("");
    const [scannedFile, setScannedFile] = useState(null);
    const [sourceHtml, setSourceHtml] = useState(null);
    const [lastText, setLastText] = useState("");
    // Persisted scan id (set after the scan is saved) — lets the download button
    // hit the GCS-cached high-fidelity report instead of re-rendering inline.
    const [lastScanId, setLastScanId] = useState(null);

    const resetResults = useCallback(() => {
        setResults(null);
        setBreakdown(null);
        setOverallLabel("");
        setScannedFile(null);
        setSourceHtml(null);
        setLastScanId(null);
    }, []);

    const processFinalResults = useCallback((finalChunks, html = null, file = null) => {
        setScannedFile(file);
        setSourceHtml(html);

        // finalChunks come pre-classified from /api/attribute (the server ran the full
        // engine: attribution → smoothing → threshold banding). We just paint colors.
        const computedResults = (finalChunks || []).map(r => {
            if (!r) return { text: "Error", label: "human", bgColor: "transparent", para: 0 };
            const label = r.label || "human";
            return {
                text: r.text,
                label,
                score: r.score,
                para: r.para ?? 0, // source paragraph index — preserves original spacing in the heatmap
                bgColor: label === "ai" ? "rgba(239, 68, 68, 0.45)" :
                    label === "mixed" ? "rgba(245, 158, 11, 0.35)" : "transparent"
            }
        });

        const humanCount = computedResults.filter(r => r.label === "human").length;
        const aiCount = computedResults.filter(r => r.label === "ai").length;
        const mixedCount = computedResults.filter(r => r.label === "mixed").length;
        const total = computedResults.length;

        const pAI = ((aiCount / total) * 100).toFixed(1);
        const pMixed = ((mixedCount / total) * 100).toFixed(1);
        const pHuman = ((humanCount / total) * 100).toFixed(1);

        const breakdown = { human: pHuman, mixed: pMixed, ai: pAI };
        setBreakdown(breakdown);

        const ovl = (aiCount > 0 && aiCount >= mixedCount) ? "AI Generated"
            : (aiCount > 0 || mixedCount > 0) ? "Mixed Content"
            : "Human Authored";
        setOverallLabel(ovl);

        setResults(computedResults);

        // Persist the scan (history + PDF download), then prewarm the high-fidelity
        // report in the background. Best-effort: guests get a silent 401 and any
        // failure never blocks the UI.
        (async () => {
            try {
                const wordCount = computedResults.reduce((n, r) => n + (r.text ? r.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
                const saveRes = await resilientFetch("/api/scan-results", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: file?.name || "Pasted Text",
                        type: file ? "DOCUMENT" : "TEXT",
                        wordCount,
                        sentenceCount: computedResults.length,
                        overallLabel: ovl,
                        breakdown,
                        chunks: computedResults.map(r => ({ text: r.text, label: r.label, score: r.score, para: r.para })),
                        sourceHtml: html || null, // reproduced document HTML (DOCX) → high-fidelity past-scan PDFs
                    }),
                    retry: true, // history save is best-effort; retry survives a brief drop
                    timeoutMs: 15000,
                });
                if (!saveRes?.ok) return;
                const saved = await saveRes.json().catch(() => null);
                const scanId = saved?.id;
                if (scanId) setLastScanId(scanId);

                // Phase B of the prewarm: highlight + cover + final cache. The
                // slow DOCX→PDF conversion was already kicked off at upload (Phase
                // A in handleAnalyze) and is reused here by file hash, so this is
                // usually just the fast overlay + upload. Fire-and-forget.
                if (scanId && isDocxFile(file)) {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("scanId", scanId);
                    fetch("/api/report/prewarm", { method: "POST", body: fd })
                        .then(r => { if (!r.ok) console.warn("[Prewarm] HTTP", r.status); })
                        .catch(e => console.warn("[Prewarm] failed:", e.message));
                }
            } catch { /* offline / guest / prewarm failure — ignore */ }
        })();

        if (onAfterComplete) onAfterComplete();
    }, [onAfterComplete]);

    const handleAnalyze = useCallback(async (text, file = null) => {
        if ((!text || text.trim() === "") && !file) {
            showToast("Please enter text or upload a file first.", "warning");
            return;
        }

        if (text?.trim()) setLastText(text);

        // Arm a fresh cancellation context for this run.
        cancelledRef.current = false;
        jobIdRef.current = null;
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        openProcess("analyze", "Parsing Document", "Extracting textual semantics locally...", cancelAnalysis);

        // Phase A of the high-fidelity prewarm: kick off the Gotenberg DOCX→PDF
        // conversion NOW, in parallel with the scan, so its Cloud Run cold start
        // is absorbed while the HF queries run instead of being serialized after
        // them. The result is cached by file hash; the scan-complete prewarm
        // (Phase B in processFinalResults) reuses it and skips Gotenberg. No
        // scanId yet — that's the whole point. Fire-and-forget; guests 401.
        if (isDocxFile(file)) {
            const convFd = new FormData();
            convFd.append("file", file);
            fetch("/api/report/prewarm", { method: "POST", body: convFd })
                .then(r => { if (!r.ok) console.warn("[Prewarm] parallel convert HTTP", r.status); })
                .catch(e => console.warn("[Prewarm] parallel convert failed:", e.message));
        }

        try {
            const formData = new FormData();
            if (text?.trim()) formData.append("text", text);
            if (file) formData.append("file", file);
            if (deviceHash) formData.append("hardwareFootprint", JSON.stringify(deviceHash));

            // 1. Offload Heavy Chunking directly to Edge Route Server.
            // resilientFetch retries on transient 5xx/network errors with jittered
            // backoff and applies a per-attempt timeout — bad networks no longer
            // turn a flaky upload into "Networking Failure" toast spam.
            const res = await resilientFetch("/api/analyze", {
                method: "POST",
                body: formData,
                signal,
                retry: true, // analyze is idempotent enough — same input → same scenarios
                timeoutMs: 45000, // file parsing can be slow on big PDFs
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || "Analysis engine failure.", "error");
                closeProcess();
                return;
            }

            const data = await res.json();
            const { scenarios, sentences, sourceHtml: html, chunkCount, depth, estimate, monthKey, callsPerQuery } = data;

            // Record the reservation the server just made so it can be released if this
            // scan is abandoned before /api/attribute reconciles it.
            if (monthKey && typeof estimate === 'number') {
                budgetRef.current = { estimate, monthKey };
            }

            // The full engine queries multi-scale WINDOWS (scenarios), not raw sentences.
            // uniqueTexts are already deduped server-side (scenarios carry unique texts).
            const uniqueTexts = scenarios.map(s => s.text);

            updateProcess(10, `Queueing ${chunkCount} windows (${depth} depth)...`);

            // ETA Optimization logic
            const timePerChunk = 1000; // Match QueueManager.safeSwitchTPS statically
            const etaMs = chunkCount * timePerChunk;

            const { QueueManager } = await import('@/lib/queue-manager');
            const totalQueueETA = QueueManager.calculateJobETA("future") + etaMs;

            const isBackgroundHandled = totalQueueETA > 60000; // > 60 seconds triggers side-bar mapping

            if (isBackgroundHandled) {
                showToast(`Heavy Document detoured to background. ETA: ${Math.round(totalQueueETA / 1000)}s`, "info");
                closeProcess(); // Minimizes loading screen so user can roam!
            } else {
                updateProcess(15, `Scanning with expected delay: ${Math.round(etaMs / 1000)}s...`);
            }

            // If the user cancelled while /api/analyze was in flight, stop before queueing.
            if (cancelledRef.current) return;

            // Bind Global Queue Lifecycle Execution Event. Results are parallel to
            // uniqueTexts (== scenarios), so scores map straight back by index.
            jobIdRef.current = QueueManager.enqueueJob(file || { name: 'Pasted Text' }, uniqueTexts.map(t => ({ text: t })), async (windowResults, meta) => {
                // The job completed normally — clear the handle so a later cancel is a no-op.
                jobIdRef.current = null;
                if (cancelledRef.current) return; // cancelled mid-scan — discard results
                try {
                    if (!isBackgroundHandled) updateProcess(85, "Attributing sentence scores...");

                    const scores = windowResults.map(r => (r && typeof r.aiProbability === 'number') ? r.aiProbability : null);
                    const executedQueries = scores.filter(s => s != null).length;
                    // TRUE proxy round-trips the queue made for this scan (submit + polls +
                    // retries). Lets the server reconcile the real invocation cost instead of
                    // assuming submit+poll per window (which undercounts retry-heavy scans).
                    const actualInvocations = (meta && typeof meta.proxyCalls === 'number') ? meta.proxyCalls : undefined;

                    // Run the full attribution engine server-side (needs EngineConfig/Prisma).
                    // retry:true so a transient blip after the (expensive) HF scan still lands
                    // the results. Caveat: the budget reconcile inside /api/attribute is a
                    // non-idempotent counter adjustment, so a retry that re-runs after a
                    // lost-but-successful response re-applies a small delta — bounded, rare,
                    // and safe-biased (the authoritative pool is server-side in UsageBudget).
                    // A fully idempotent reconcile would need a per-scan ledger.
                    const attrRes = await resilientFetch("/api/attribute", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sentences, scenarios, scores, estimate, monthKey, callsPerQuery, executedQueries, actualInvocations }),
                        signal,
                        retry: true,
                        timeoutMs: 30000,
                    });

                    if (cancelledRef.current) return; // cancelled during attribution

                    if (!attrRes.ok) {
                        const err = await attrRes.json().catch(() => ({}));
                        throw new Error(err.error || `Attribution failed (${attrRes.status})`);
                    }

                    const { chunks } = await attrRes.json();
                    // /api/attribute reconciled the reservation server-side — clear it so
                    // a later cancel/unmount can't fire a second (refunding) reconcile.
                    budgetRef.current = null;

                    if (!isBackgroundHandled) closeProcess();
                    else showToast(`Background Verification Complete for ${file ? file.name : 'Pasting'}`, 'success');

                    processFinalResults(chunks, html, file);
                } catch (e) {
                    if (cancelledRef.current || e?.name === "AbortError") return; // user cancelled (cancelAnalysis reconciles)
                    console.error("Attribution stage failed:", e);
                    // Attribution never reconciled the reservation — release the unused
                    // portion (the queue's real proxy-call count) so it doesn't leak.
                    reconcileBudget((meta && typeof meta.proxyCalls === 'number') ? meta.proxyCalls : 0);
                    showToast("Scoring engine failed to attribute results.", "error");
                    closeProcess();
                }
            });

        } catch (error) {
            if (cancelledRef.current || error?.name === "AbortError") return; // user cancelled
            console.error(error);
            showToast("Networking Failure fetching pipeline chunks.", "error");
            closeProcess();
        }
    }, [openProcess, updateProcess, closeProcess, deviceHash, processFinalResults, cancelAnalysis, reconcileBudget]);

    return {
        results, breakdown, overallLabel, handleAnalyze,
        isActive, resetResults, scannedFile, sourceHtml, lastText, lastScanId
    };
}
