"use client";
import { motion } from "framer-motion";

function getOverallConfig(breakdown) {
    if (breakdown.ai >= 60) return { color: "#EF4444", bgClass: "bg-score-ai/10", textClass: "text-score-ai", glowColor: "rgba(239, 68, 68, 0.2)" };
    if (breakdown.ai >= 30 || breakdown.mixed >= 40) return { color: "#F59E0B", bgClass: "bg-score-mixed/10", textClass: "text-score-mixed", glowColor: "rgba(245, 158, 11, 0.2)" };
    return { color: "#10B981", bgClass: "bg-score-human/10", textClass: "text-score-human", glowColor: "rgba(16, 185, 129, 0.2)" };
}

export default function ScoreGauge({ breakdown = {}, overallLabel = "", sentenceCount = 0, wordCount = 0 }) {
    const { human = 0, mixed = 0, ai = 0 } = breakdown;
    const config = getOverallConfig(breakdown);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-2xl p-8 space-y-7 relative overflow-hidden"
        >
            {/* Subtle glow behind card */}
            <div
                className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-40"
                style={{ background: config.glowColor }}
            />

            {/* Overall Label */}
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-bold text-ash uppercase tracking-[0.15em] mb-1">Document Assessment</p>
                    <h3 className={`text-2xl font-black ${config.textClass}`}>{overallLabel}</h3>
                </div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${config.bgClass} border border-current/10`}>
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: config.color }} />
                    <span className={`text-sm font-bold ${config.textClass}`}>{overallLabel}</span>
                </div>
            </div>

            {/* Breakdown Bar */}
            <div className="relative z-10 space-y-3">
                <div className="flex h-4 rounded-full overflow-hidden bg-silver/40 relative">
                    {/* Glow behind bar */}
                    <div className="absolute inset-0 rounded-full blur-sm opacity-30" style={{
                        background: `linear-gradient(to right, #10B981 ${human}%, #F59E0B ${human + mixed}%, #EF4444 100%)`
                    }} />
                    {human > 0 && (
                        <motion.div initial={{ width: 0 }} animate={{ width: `${human}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="bg-score-human h-full relative z-10" title={`Human: ${human}%`} />
                    )}
                    {mixed > 0 && (
                        <motion.div initial={{ width: 0 }} animate={{ width: `${mixed}%` }}
                            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                            className="bg-score-mixed h-full relative z-10" title={`Mixed: ${mixed}%`} />
                    )}
                    {ai > 0 && (
                        <motion.div initial={{ width: 0 }} animate={{ width: `${ai}%` }}
                            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                            className="bg-score-ai h-full relative z-10" title={`AI: ${ai}%`} />
                    )}
                </div>

                <div className="flex justify-between items-center">
                    {[
                        { color: "bg-score-human", value: human, label: "Human" },
                        { color: "bg-score-mixed", value: mixed, label: "Mixed" },
                        { color: "bg-score-ai", value: ai, label: "AI" },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                            <span className="text-sm font-bold text-navy">{item.value}%</span>
                            <span className="text-xs text-ash font-medium">{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Meta stats */}
            <div className="relative z-10 flex gap-6 pt-2 border-t border-silver">
                <div>
                    <p className="text-2xl font-bold text-navy">{sentenceCount}</p>
                    <p className="text-xs text-ash font-medium uppercase tracking-wider">Sentences Analyzed</p>
                </div>
                <div className="w-px bg-silver" />
                <div>
                    <p className="text-2xl font-bold text-navy">{wordCount}</p>
                    <p className="text-xs text-ash font-medium uppercase tracking-wider">Words</p>
                </div>
            </div>
        </motion.div>
    );
}
