"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

// Human text is left unmarked (matches the PDF report); only AI / mixed are
// highlighted so the eye goes straight to the flagged passages.
const labelConfig = {
    human: { mark: false, dot: "bg-score-human", text: "Human Written" },
    mixed: {
        mark: true, dot: "bg-score-mixed", text: "Mixed Signals",
        style: { backgroundColor: "rgba(245,158,11,0.22)", color: "var(--dyn-text-navy)" },
        hover: "rgba(245,158,11,0.40)",
    },
    ai: {
        mark: true, dot: "bg-score-ai", text: "AI Generated",
        style: { backgroundColor: "rgba(239,68,68,0.20)", color: "var(--dyn-text-navy)" },
        hover: "rgba(239,68,68,0.38)",
    },
};

export default function HeatmapViewer({ chunks, devMode = false, previewLimit = 100, previewSentences = 40 }) {
    const [hoveredChunk, setHoveredChunk] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e, chunk) => {
        setHoveredChunk(chunk);
        const rect = e.currentTarget.closest(".heatmap-container")?.getBoundingClientRect();
        if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    if (!chunks || chunks.length === 0) return null;

    const humanCount = chunks.filter((c) => c.label === "human").length;
    const mixedCount = chunks.filter((c) => c.label === "mixed").length;
    const aiCount = chunks.filter((c) => c.label === "ai").length;

    // Long documents: render a leading preview inline; the full heatmap lives in the PDF.
    const truncated = chunks.length > previewLimit;
    const visibleChunks = truncated ? chunks.slice(0, previewSentences) : chunks;

    // Group consecutive sentences by source paragraph to preserve spacing.
    const paragraphs = [];
    let currentPara = null;
    visibleChunks.forEach((chunk, i) => {
        const p = chunk.para ?? 0;
        if (!currentPara || currentPara.para !== p) {
            currentPara = { para: p, items: [] };
            paragraphs.push(currentPara);
        }
        currentPara.items.push({ chunk, i });
    });

    return (
        <div className="space-y-5">
            {/* Header + legend */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 glass-card !rounded-2xl">
                <h4 className="text-sm font-black text-navy tracking-tight">Sentence-Level Heatmap</h4>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {[
                        { color: "bg-score-human", label: "Human", count: humanCount },
                        { color: "bg-score-mixed", label: "Mixed", count: mixedCount },
                        { color: "bg-score-ai", label: "AI", count: aiCount },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-md ${item.color}`} />
                            <span className="text-xs font-semibold text-ash">
                                {item.label} <span className="text-navy font-bold">({item.count})</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Heatmap body — grouped into paragraphs to preserve original spacing */}
            <div className="relative heatmap-container p-6 md:p-9 glass-card !rounded-2xl leading-[2.1] text-[15px] text-navy">
                {paragraphs.map((para, pi) => (
                    <p key={pi} className="mb-4 last:mb-0">
                        {para.items.map(({ chunk, i }) => {
                            const config = labelConfig[chunk.label] || labelConfig.mixed;
                            const isHovered = hoveredChunk === chunk;
                            if (!config.mark) {
                                // Human — plain, but still hoverable for the tooltip.
                                return (
                                    <span
                                        key={i}
                                        className="cursor-default transition-colors duration-150"
                                        style={isHovered ? { backgroundColor: "rgba(37,99,235,0.12)", borderRadius: 6 } : undefined}
                                        onMouseMove={(e) => handleMouseMove(e, chunk)}
                                        onMouseLeave={() => setHoveredChunk(null)}
                                    >
                                        {chunk.text}{" "}
                                    </span>
                                );
                            }
                            return (
                                <motion.span
                                    key={i}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: Math.min(i * 0.015, 0.8) }}
                                    className="px-1 py-0.5 mx-px rounded-md cursor-pointer transition-all duration-150 inline ring-1 ring-transparent"
                                    style={isHovered
                                        ? { backgroundColor: config.hover, boxShadow: "0 0 0 1px rgba(37,99,235,0.25)" }
                                        : config.style}
                                    onMouseMove={(e) => handleMouseMove(e, chunk)}
                                    onMouseLeave={() => setHoveredChunk(null)}
                                >
                                    {chunk.text}
                                </motion.span>
                            );
                        })}
                    </p>
                ))}

                {/* Glassmorphism tooltip */}
                <AnimatePresence>
                    {hoveredChunk && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.1 }}
                            className="absolute pointer-events-none z-50 glass-card !rounded-xl px-4 py-3"
                            style={{ top: tooltipPos.y - 55, left: Math.min(Math.max(tooltipPos.x - 40, 10), 300) }}
                        >
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${labelConfig[hoveredChunk.label]?.dot || "bg-score-mixed"} animate-pulse`} />
                                    <span className="text-sm font-bold text-navy">
                                        {labelConfig[hoveredChunk.label]?.text || "Mixed"}
                                    </span>
                                    {typeof hoveredChunk.score === "number" && (
                                        <span className="text-xs font-bold text-ash ml-auto">{Math.round(hoveredChunk.score)}% AI</span>
                                    )}
                                </div>
                                {devMode && hoveredChunk.devMetrics && (
                                    <div className="pt-2 mt-1 border-t border-silver/50 space-y-1 min-w-[140px]">
                                        <p className="text-[10px] font-bold text-ash uppercase tracking-wider mb-1">Admin Dev Mode</p>
                                        <p className="text-xs text-navy flex justify-between"><span className="font-semibold text-ash">Direct/Anchor:</span> {hoveredChunk.devMetrics.direct} | {hoveredChunk.devMetrics.anchor}</p>
                                        <p className="text-xs text-navy flex justify-between"><span className="font-semibold text-ash">Differential:</span> {hoveredChunk.devMetrics.differential}</p>
                                        <p className="text-xs text-navy flex justify-between"><span className="font-semibold text-ash">Burst Nudge:</span> -{hoveredChunk.devMetrics.burstinessNudge}</p>
                                        <p className="text-xs text-navy flex justify-between"><span className="font-semibold text-ash">Pre-smooth:</span> {hoveredChunk.devMetrics.smoothedFrom}%</p>
                                        <p className="text-xs font-bold text-navy flex justify-between pt-1 mt-1 border-t border-silver/30"><span className="text-ash">Final:</span> {hoveredChunk.devMetrics.smoothedTo}%</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Long-document notice — full heatmap lives in the PDF report */}
            {truncated && (
                <div className="flex items-start gap-3 px-5 py-4 glass-card !rounded-xl border border-accent-blue/30">
                    <svg className="w-5 h-5 mt-0.5 shrink-0 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-navy">
                        This document has <span className="font-bold">{chunks.length}</span> sentences — showing the first{" "}
                        <span className="font-bold">{visibleChunks.length}</span> here for readability. Use the{" "}
                        <span className="font-bold">Download PDF Report</span> button above for the complete,
                        formatted sentence-by-sentence analysis.
                    </p>
                </div>
            )}

            {/* Accuracy disclaimer — shown with every result */}
            <p className="text-xs px-5 leading-relaxed" style={{ color: "var(--dyn-ash)" }}>
                These results are a <span className="font-semibold">probabilistic estimate</span> and may be inaccurate
                (both false positives and false negatives are possible). They are not proof of authorship and should not
                be the sole basis for any academic or disciplinary decision. Always apply human judgement.
            </p>
        </div>
    );
}
