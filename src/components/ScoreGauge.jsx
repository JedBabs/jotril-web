"use client";
import { motion } from "framer-motion";

const SCORE = { human: "#10B981", mixed: "#F59E0B", ai: "#EF4444" };

function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function getTone(ai, mixed) {
    if (ai >= 60) return { color: SCORE.ai, key: "ai", glow: "rgba(239,68,68,0.22)" };
    if (ai >= 30 || mixed >= 40) return { color: SCORE.mixed, key: "mixed", glow: "rgba(245,158,11,0.22)" };
    return { color: SCORE.human, key: "human", glow: "rgba(16,185,129,0.22)" };
}

function fmtPct(v) {
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
}

/** Composition donut — three arcs on a track, AI% called out in the centre. */
function Donut({ human, mixed, ai, size = 188, stroke = 24 }) {
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;
    const total = Math.max(human + mixed + ai, 0.0001);
    const segs = [
        { v: human, c: SCORE.human },
        { v: mixed, c: SCORE.mixed },
        { v: ai, c: SCORE.ai },
    ].filter((s) => s.v > 0);

    let acc = 0;
    const arcs = segs.map((s, i) => {
        const dash = (s.v / total) * C;
        const node = (
            <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.c}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${C - dash}`}
                initial={{ strokeDashoffset: -acc - dash }}
                animate={{ strokeDashoffset: -acc }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 + i * 0.12 }}
            />
        );
        acc += dash;
        return node;
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
            <g transform={`rotate(-90 ${cx} ${cy})`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--dyn-silver)" strokeWidth={stroke} opacity="0.6" />
                {arcs}
            </g>
            <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontWeight: 800, fontSize: 36, fill: "var(--dyn-text-navy)" }}>
                {fmtPct(ai)}%
            </text>
            <text x={cx} y={cy + 22} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 2, fill: "var(--dyn-ash)" }}>
                AI CONTENT
            </text>
        </svg>
    );
}

export default function ScoreGauge({ breakdown = {}, overallLabel = "", sentenceCount = 0, wordCount = 0 }) {
    const human = toNum(breakdown.human);
    const mixed = toNum(breakdown.mixed);
    const ai = toNum(breakdown.ai);
    const tone = getTone(ai, mixed);

    const dominant = Math.max(human, mixed, ai);
    const confidence = dominant >= 75 ? "High" : dominant >= 50 ? "Medium" : "Moderate";

    const legend = [
        { name: "Human", value: human, color: SCORE.human },
        { name: "Mixed", value: mixed, color: SCORE.mixed },
        { name: "AI", value: ai, color: SCORE.ai },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-[24px] p-8 relative overflow-hidden"
        >
            <div
                className="absolute -top-24 -right-20 w-72 h-72 rounded-full blur-3xl pointer-events-none opacity-50"
                style={{ background: tone.glow }}
            />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-10">
                <Donut human={human} mixed={mixed} ai={ai} />

                <div className="flex-1 w-full space-y-6">
                    {/* Verdict */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black text-ash uppercase tracking-[0.18em] mb-1.5">Document Assessment</p>
                            <h3 className="text-2xl font-black tracking-tight" style={{ color: tone.color }}>{overallLabel}</h3>
                        </div>
                        <div
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full self-start"
                            style={{ background: `${tone.color}1A` }}
                        >
                            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: tone.color }} />
                            <span className="text-xs font-bold" style={{ color: tone.color }}>Confidence: {confidence}</span>
                        </div>
                    </div>

                    {/* Segmented bar */}
                    <div className="flex h-3 rounded-full overflow-hidden bg-silver/40">
                        {legend.map((l) =>
                            l.value > 0 ? (
                                <motion.div
                                    key={l.name}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${l.value}%` }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    style={{ background: l.color }}
                                    className="h-full"
                                />
                            ) : null
                        )}
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-3 gap-3">
                        {legend.map((l) => (
                            <div key={l.name} className="flex items-center gap-2.5">
                                <span className="w-3 h-3 rounded-md shrink-0" style={{ background: l.color }} />
                                <div className="leading-none">
                                    <div className="text-lg font-black text-navy">{fmtPct(l.value)}%</div>
                                    <div className="text-[11px] text-ash font-semibold mt-0.5">{l.name}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Meta tiles */}
                    <div className="grid grid-cols-3 gap-3 pt-5 border-t border-silver/60">
                        {[
                            { v: sentenceCount.toLocaleString(), l: "Sentences" },
                            { v: wordCount.toLocaleString(), l: "Words" },
                            { v: confidence, l: "Confidence" },
                        ].map((t) => (
                            <div key={t.l} className="text-center sm:text-left">
                                <div className="text-xl font-black text-navy tracking-tight">{t.v}</div>
                                <div className="text-[10px] text-ash font-bold uppercase tracking-wider mt-1">{t.l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
