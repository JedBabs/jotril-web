"use client";

import { useState, useCallback } from "react";
import { useProcess } from "@/components/ProcessContext";
import { showToast } from "@/components/Toast";
import { parseAnalysisStream } from "@/lib/parse-analysis-stream";

/**
 * Shared scan state + /api/analyze SSE handling for landing and dashboard.
 */
export function useAnalyze({ deviceHash, onAfterComplete } = {}) {
    const { isActive, openProcess, updateProcess, closeProcess } = useProcess();

    const [results, setResults] = useState(null);
    const [breakdown, setBreakdown] = useState(null);
    const [overallLabel, setOverallLabel] = useState("");
    const [coldStart, setColdStart] = useState(false);
    const [scannedFile, setScannedFile] = useState(null);
    const [sourceHtml, setSourceHtml] = useState(null);
    const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
    const [lastText, setLastText] = useState("");

    const resetResults = useCallback(() => {
        setResults(null);
        setBreakdown(null);
        setOverallLabel("");
        setScannedFile(null);
        setSourceHtml(null);
    }, []);

    const handleAnalyze = useCallback(async (text, file = null) => {
        if ((!text || text.trim() === "") && !file) {
            showToast("Please enter text or upload a file first.", "warning");
            return;
        }

        if (text?.trim()) {
            setLastText(text);
        }

        setColdStart(false);
        setScannedFile(file || null);
        openProcess("analyze", "Analyzing Scope", "Initializing Jotril Engine...");

        try {
            let res;
            if (file) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("hardwareFootprint", JSON.stringify(deviceHash));
                res = await fetch("/api/analyze", { method: "POST", body: formData });
            } else {
                res = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, hardwareFootprint: deviceHash }),
                });
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.type === "COLD_START") {
                    setColdStart(true);
                    closeProcess();
                    return;
                }
                if (data.limitExceeded) {
                    showToast(data.error || "Quota limit exceeded. Please upgrade your tier.", "error");
                    closeProcess();
                    setQuotaRefreshKey((k) => k + 1);
                    return;
                }
                showToast(data.error || "Analysis engine returned an error.", "error");
                closeProcess();
                return;
            }

            if (!res.body) {
                showToast("Analysis engine returned an empty response.", "error");
                closeProcess();
                return;
            }

            let completed = false;

            await parseAnalysisStream(res.body.getReader(), {
                onProgress: (data) => updateProcess(data.progress, data.step),
                onComplete: async (data) => {
                    completed = true;
                    setResults(data.chunks ?? null);
                    setBreakdown(data.breakdown || {});
                    setOverallLabel(data.overallLabel || "");
                    setSourceHtml(data.sourceHtml || null);

                    if (data.cached) {
                        showToast("Results loaded from cache — 0 points used!", "success");
                    } else {
                        showToast(`Analysis complete! ${data.pointsCost || 0} points used.`, "success");
                    }

                    if (file) {
                        try {
                            const { generatePDFReport } = await import("@/lib/pdf-generator");
                            generatePDFReport({
                                filename: file.name,
                                breakdown: data.breakdown || {},
                                overallLabel: data.overallLabel || "",
                                chunks: data.chunks,
                                sentenceCount: data.chunks?.length || 0,
                                wordCount: (data.chunks || []).reduce(
                                    (sum, chunk) => sum + chunk.text.trim().split(/\s+/).length,
                                    0
                                ),
                                sourceHtml: data.sourceHtml || null,
                            });
                            showToast("PDF report generated successfully", "success");
                        } catch (err) {
                            console.error("Error generating PDF:", err);
                        }
                    }
                },
                onError: (data) => {
                    if (data.type === "COLD_START") {
                        setColdStart(true);
                    } else if (data.limitExceeded) {
                        showToast(data.error || "Quota limit exceeded.", "error");
                    } else {
                        showToast(data.error || "Analysis engine returned an error.", "error");
                    }
                },
                onParseError: (error) => {
                    console.error("Error parsing stream data", error);
                },
            });

            if (!completed) {
                showToast("Analysis finished without results. Please try again.", "error");
            }

            closeProcess();
            setQuotaRefreshKey((k) => k + 1);
            onAfterComplete?.();
        } catch (error) {
            console.error(error);
            showToast("Failed to reach the analysis engine. Please try again.", "error");
            closeProcess();
        }
    }, [closeProcess, deviceHash, onAfterComplete, openProcess, updateProcess]);

    const handleRetry = useCallback(() => {
        setColdStart(false);
        if (lastText) {
            handleAnalyze(lastText);
        }
    }, [handleAnalyze, lastText]);

    return {
        results,
        breakdown,
        overallLabel,
        coldStart,
        scannedFile,
        sourceHtml,
        quotaRefreshKey,
        isActive,
        lastText,
        handleAnalyze,
        handleRetry,
        resetResults,
    };
}
