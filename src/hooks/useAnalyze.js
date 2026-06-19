"use client";

import { useState, useCallback, useEffect } from "react";
import { useProcess } from "@/components/ProcessContext";
import { showToast } from "@/components/Toast";

/**
 * Shared scan state optimized for Global Queue background decoupling.
 */
export function useAnalyze({ deviceHash, onAfterComplete } = {}) {
    const { isActive, openProcess, updateProcess, closeProcess } = useProcess();

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

    const processFinalResults = useCallback((finalResults, html = null, file = null) => {
        setScannedFile(file);
        setSourceHtml(html);

        // Map heatmap colors securely
        const computedResults = finalResults.map(r => {
            if (!r) return { text: "Error", label: "human", bgColor: "transparent" };
            return {
                text: r.text,
                label: r.label,
                confidence: r.confidence,
                bgColor: r.label === "ai" ? "rgba(239, 68, 68, 0.45)" :
                    r.label === "mixed" ? "rgba(245, 158, 11, 0.35)" : "transparent"
            }
        });

        const humanCount = computedResults.filter(r => r.label === "human").length;
        const aiCount = computedResults.filter(r => r.label === "ai").length;
        const mixedCount = computedResults.filter(r => r.label === "mixed").length;
        const total = computedResults.length;

        const pAI = ((aiCount / total) * 100).toFixed(1);
        const pMixed = ((mixedCount / total) * 100).toFixed(1);
        const pHuman = ((humanCount / total) * 100).toFixed(1);

        setBreakdown({ human: pHuman, mixed: pMixed, ai: pAI });

        if (aiCount > 0 && aiCount >= mixedCount) setOverallLabel("AI Generated");
        else if (aiCount > 0 || mixedCount > 0) setOverallLabel("Mixed Content");
        else setOverallLabel("Human Authored");

        setResults(computedResults);

        if (onAfterComplete) onAfterComplete();
    }, [onAfterComplete]);

    const handleAnalyze = useCallback(async (text, file = null, userTier = 1) => {
        if ((!text || text.trim() === "") && !file) {
            showToast("Please enter text or upload a file first.", "warning");
            return;
        }

        if (text?.trim()) setLastText(text);

        openProcess("analyze", "Parsing Document", "Extracting textual semantics locally...");

        try {
            const formData = new FormData();
            if (text?.trim()) formData.append("text", text);
            if (file) formData.append("file", file);
            if (deviceHash) formData.append("hardwareFootprint", JSON.stringify(deviceHash));

            // 1. Offload Heavy Chunking directly to Edge Route Server
            const res = await fetch("/api/analyze", { method: "POST", body: formData });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || "Analysis engine failure.", "error");
                closeProcess();
                return;
            }

            const data = await res.json();
            const { chunks, sourceHtml: html, chunkCount } = data;

            // Optional Security: Map HF_TOKEN explicitly into safe proxy
            // No prediction loops on server anymore.

            updateProcess(10, `Queueing ${chunkCount} chunks...`);

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

            // Bind Global Queue Lifecycle Execution Event
            QueueManager.enqueueJob(file || { name: 'Pasted Text' }, chunks.map(c => ({ text: c })), userTier, (finalResults) => {
                if (!isBackgroundHandled) closeProcess();
                else showToast(`Background Verification Complete for ${file ? file.name : 'Pasting'}`, 'success');

                processFinalResults(finalResults, html, file);
            });

        } catch (error) {
            console.error(error);
            showToast("Networking Failure fetching pipeline chunks.", "error");
            closeProcess();
        }
    }, [openProcess, updateProcess, closeProcess, deviceHash, processFinalResults]);

    return {
        results, breakdown, overallLabel, handleAnalyze,
        isActive, resetResults, scannedFile, sourceHtml, lastText
    };
}
