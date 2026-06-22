"use client";

import { useState, useCallback, useRef } from "react";
import { useProcess } from "@/components/ProcessContext";
import { showToast } from "@/components/Toast";

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

    const cancelAnalysis = useCallback(() => {
        cancelledRef.current = true;
        try { abortRef.current?.abort(); } catch { /* already settled */ }
        if (jobIdRef.current) {
            import('@/lib/queue-manager')
                .then(({ QueueManager }) => QueueManager.cancelJob(jobIdRef.current))
                .catch(() => { /* module load race — nothing to cancel */ });
            jobIdRef.current = null;
        }
        showToast("Analysis cancelled.", "info");
    }, []);

    const [results, setResults] = useState(null);
    const [breakdown, setBreakdown] = useState(null);
    const [overallLabel, setOverallLabel] = useState("");
    const [scannedFile, setScannedFile] = useState(null);
    const [sourceHtml, setSourceHtml] = useState(null);
    const [lastText, setLastText] = useState("");

    const resetResults = useCallback(() => {
        setResults(null);
        setBreakdown(null);
        setOverallLabel("");
        setScannedFile(null);
        setSourceHtml(null);
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

        // Persist the scan for logged-in users (history + PDF download). Best-effort and
        // fire-and-forget: guests get a silent 401, and a save failure never blocks the UI.
        try {
            const wordCount = computedResults.reduce((n, r) => n + (r.text ? r.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
            fetch("/api/scan-results", {
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
                })
            }).catch(() => { /* offline / guest — ignore */ });
        } catch { /* ignore persistence errors */ }

        if (onAfterComplete) onAfterComplete();
    }, [onAfterComplete]);

    const handleAnalyze = useCallback(async (text, file = null, userTier = 1) => {
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

        try {
            const formData = new FormData();
            if (text?.trim()) formData.append("text", text);
            if (file) formData.append("file", file);
            if (deviceHash) formData.append("hardwareFootprint", JSON.stringify(deviceHash));

            // 1. Offload Heavy Chunking directly to Edge Route Server
            const res = await fetch("/api/analyze", { method: "POST", body: formData, signal });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || "Analysis engine failure.", "error");
                closeProcess();
                return;
            }

            const data = await res.json();
            const { scenarios, sentences, sourceHtml: html, chunkCount, depth, estimate, monthKey, callsPerQuery } = data;

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
            jobIdRef.current = QueueManager.enqueueJob(file || { name: 'Pasted Text' }, uniqueTexts.map(t => ({ text: t })), userTier, async (windowResults) => {
                // The job completed normally — clear the handle so a later cancel is a no-op.
                jobIdRef.current = null;
                if (cancelledRef.current) return; // cancelled mid-scan — discard results
                try {
                    if (!isBackgroundHandled) updateProcess(85, "Attributing sentence scores...");

                    const scores = windowResults.map(r => (r && typeof r.aiProbability === 'number') ? r.aiProbability : null);
                    const executedQueries = scores.filter(s => s != null).length;

                    // Run the full attribution engine server-side (needs EngineConfig/Prisma).
                    const attrRes = await fetch("/api/attribute", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sentences, scenarios, scores, estimate, monthKey, callsPerQuery, executedQueries }),
                        signal
                    });

                    if (cancelledRef.current) return; // cancelled during attribution

                    if (!attrRes.ok) {
                        const err = await attrRes.json().catch(() => ({}));
                        throw new Error(err.error || `Attribution failed (${attrRes.status})`);
                    }

                    const { chunks } = await attrRes.json();

                    if (!isBackgroundHandled) closeProcess();
                    else showToast(`Background Verification Complete for ${file ? file.name : 'Pasting'}`, 'success');

                    processFinalResults(chunks, html, file);
                } catch (e) {
                    if (cancelledRef.current || e?.name === "AbortError") return; // user cancelled
                    console.error("Attribution stage failed:", e);
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
    }, [openProcess, updateProcess, closeProcess, deviceHash, processFinalResults, cancelAnalysis]);

    return {
        results, breakdown, overallLabel, handleAnalyze,
        isActive, resetResults, scannedFile, sourceHtml, lastText
    };
}
