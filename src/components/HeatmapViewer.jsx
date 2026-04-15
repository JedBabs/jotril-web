"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const labelConfig = {
    human: { bg: "bg-score-human/10", hover: "hover:bg-score-human/20", dot: "bg-score-human", text: "Human Written", glow: "shadow-[0_0_12px_rgba(16,185,129,0.3)]" },
    mixed: { bg: "bg-score-mixed/10", hover: "hover:bg-score-mixed/20", dot: "bg-score-mixed", text: "Mixed", glow: "shadow-[0_0_12px_rgba(245,158,11,0.3)]" },
    ai: { bg: "bg-score-ai/15", hover: "hover:bg-score-ai/25", dot: "bg-score-ai", text: "AI Generated", glow: "shadow-[0_0_12px_rgba(239,68,68,0.3)]" },
};

export default function HeatmapViewer({ chunks, devMode = false }) {
    const [hoveredChunk, setHoveredChunk] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e, chunk) => {
        setHoveredChunk(chunk);
        const rect = e.currentTarget.closest('.heatmap-container')?.getBoundingClientRect();
        if (rect) {
            setTooltipPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    if (!chunks || chunks.length === 0) return null;

    const humanCount = chunks.filter(c => c.label === 'human').length;
    const mixedCount = chunks.filter(c => c.label === 'mixed').length;
    const aiCount = chunks.filter(c => c.label === 'ai').length;

    return (
        <div className="space-y-5">
            {/* Legend Bar */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 glass-card !rounded-xl">
                <span className="text-xs font-bold text-ash uppercase tracking-widest">Legend</span>
                {[
                    { color: "bg-score-human/30", label: "Human", count: humanCount },
                    { color: "bg-score-mixed/30", label: "Mixed", count: mixedCount },
                    { color: "bg-score-ai/30", label: "AI", count: aiCount },
                ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                        <span className="text-xs text-ash font-medium">{item.label} ({item.count})</span>
                    </div>
                ))}
            </div>

            {/* Heatmap Text Body */}
            <div className="relative heatmap-container p-6 md:p-8 glass-card !rounded-2xl leading-[2] text-[15px] font-normal text-navy">
                {chunks.map((chunk, i) => {
                    const config = labelConfig[chunk.label] || labelConfig.mixed;
                    return (
                        <motion.span
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: Math.min(i * 0.02, 1) }}
                            className={`px-0.5 mx-0.5 rounded-md cursor-pointer transition-all duration-150 inline ${hoveredChunk === chunk
                                ? `bg-accent-blue/20 text-navy ring-1 ring-accent-blue/30 ${config.glow}`
                                : `${config.bg} ${config.hover}`
                                }`}
                            onMouseMove={(e) => handleMouseMove(e, chunk)}
                            onMouseLeave={() => setHoveredChunk(null)}
                        >
                            {chunk.text}
                        </motion.span>
                    );
                })}

                {/* Glassmorphism Tooltip */}
                <AnimatePresence>
                    {hoveredChunk && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.1 }}
                            className="absolute pointer-events-none z-50 glass-card !rounded-xl px-4 py-3"
                            style={{
                                top: tooltipPos.y - 55,
                                left: Math.min(Math.max(tooltipPos.x - 40, 10), 300)
                            }}
                        >
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${labelConfig[hoveredChunk.label]?.dot || 'bg-score-mixed'} animate-pulse`} />
                                    <span className="text-sm font-bold text-navy">
                                        {labelConfig[hoveredChunk.label]?.text || 'Mixed'}
                                    </span>
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
        </div>
    );
}
