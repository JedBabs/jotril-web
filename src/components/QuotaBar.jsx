"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * SegmentBar — 10-block progress meter, far more visually striking than a plain bar.
 */
function SegmentBar({ used, max, color }) {
    const filled = max ? Math.round(Math.min(10, (used / max) * 10)) : 0;
    return (
        <div className="flex gap-[3px]">
            {Array.from({ length: 10 }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.04, duration: 0.28, ease: "easeOut" }}
                    className="flex-1 h-2 rounded-sm"
                    style={{
                        background: i < filled ? color : "var(--dyn-silver)",
                        opacity: i < filled ? 1 : 0.45,
                        transformOrigin: "bottom",
                    }}
                />
            ))}
        </div>
    );
}

export default function QuotaBar({ deviceHash, refreshKey = 0, session }) {
    const [quota, setQuota] = useState(null);
    const [loading, setLoading] = useState(true);

    const isLoggedIn = !!session?.user;

    useEffect(() => {
        if (!isLoggedIn) { setLoading(false); return; }

        async function fetchQuota() {
            try {
                const params = deviceHash ? `?fp=${encodeURIComponent(JSON.stringify(deviceHash))}` : "";
                const res = await fetch(`/api/quota${params}`);
                if (res.ok) setQuota(await res.json());
            } catch (e) {
                console.error("[QuotaBar] Failed to fetch quota:", e);
            } finally {
                setLoading(false);
            }
        }
        fetchQuota();
    }, [deviceHash, refreshKey, isLoggedIn]);

    if (!isLoggedIn || loading || !quota) return null;

    const { tier, points, text, document: doc } = quota;

    const getBarColor = (used, max) => {
        if (!max) return "var(--dyn-accent-blue)";
        const pct = used / max;
        if (pct >= 0.9) return "#EF4444";
        if (pct >= 0.75) return "#F59E0B";
        return "#10B981";
    };

    const getTextColor = (used, max) => {
        if (!max) return "var(--dyn-accent-blue)";
        const pct = used / max;
        if (pct >= 0.9) return "#EF4444";
        if (pct >= 0.75) return "#F59E0B";
        return "var(--dyn-ash)";
    };

    const tierConfig = {
        UNAUTHENTICATED: { bg: "rgba(100,116,139,0.12)", color: "var(--dyn-ash)", glow: "rgba(100,116,139,0.2)" },
        FREE: { bg: "rgba(37,99,235,0.12)", color: "var(--dyn-accent-blue)", glow: "var(--dyn-glow-color)" },
        PRO: { bg: "rgba(6,182,212,0.12)", color: "#06B6D4", glow: "rgba(6,182,212,0.2)" },
        ULTRA: { bg: "rgba(245,158,11,0.12)", color: "#F59E0B", glow: "rgba(245,158,11,0.2)" },
        ADMIN: { bg: "rgba(16,185,129,0.12)", color: "#10B981", glow: "rgba(16,185,129,0.2)" },
    };
    const tc = tierConfig[tier] || tierConfig.FREE;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 glass-card rounded-xl p-4"
        >
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    {/* Tier badge with pulsing glow ring */}
                    <span
                        className="relative text-[10px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full"
                        style={{ background: tc.bg, color: tc.color }}
                    >
                        <span
                            className="absolute inset-0 rounded-full animate-pulse"
                            style={{ boxShadow: `0 0 8px ${tc.glow}` }}
                        />
                        <span className="relative">{tier === "UNAUTHENTICATED" ? "Guest" : tier}</span>
                    </span>
                    {points.resetsIn && (
                        <span className="text-[10px]" style={{ color: "var(--dyn-ash)" }}>
                            Resets in {points.resetsIn}
                        </span>
                    )}
                </div>
                {(tier === "UNAUTHENTICATED" || tier === "FREE") && (
                    <a
                        href="/auth/signup"
                        className="text-[10px] font-bold transition-colors"
                        style={{ color: "var(--dyn-accent-blue)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--dyn-accent-blue-light)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dyn-accent-blue)")}
                    >
                        Upgrade →
                    </a>
                )}
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {points.daily && (
                    <div>
                        <div className="flex justify-between items-baseline mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dyn-ash)" }}>
                                Points
                            </span>
                            <span
                                className="text-[11px] font-bold font-mono"
                                style={{ color: getTextColor(points.used, points.daily) }}
                            >
                                {points.remaining} left
                            </span>
                        </div>
                        <SegmentBar used={points.used} max={points.daily} color={getBarColor(points.used, points.daily)} />
                    </div>
                )}

                {text.ceiling && (
                    <div>
                        <div className="flex justify-between items-baseline mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dyn-ash)" }}>
                                Text Scans
                            </span>
                            <span className="text-[11px] font-bold font-mono" style={{ color: getTextColor(text.used, text.ceiling) }}>
                                {text.used}/{text.ceiling}
                            </span>
                        </div>
                        <SegmentBar used={text.used} max={text.ceiling} color={getBarColor(text.used, text.ceiling)} />
                    </div>
                )}

                {doc.ceiling && (
                    <div>
                        <div className="flex justify-between items-baseline mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dyn-ash)" }}>
                                Doc Scans
                            </span>
                            <span className="text-[11px] font-bold font-mono" style={{ color: getTextColor(doc.used, doc.ceiling) }}>
                                {doc.used}/{doc.ceiling}
                            </span>
                        </div>
                        <SegmentBar used={doc.used} max={doc.ceiling} color={getBarColor(doc.used, doc.ceiling)} />
                    </div>
                )}
            </div>

            {points.purchased > 0 && (
                <div className="mt-3 text-[10px]" style={{ color: "var(--dyn-ash)" }}>
                    + {points.purchased} purchased points available
                </div>
            )}
        </motion.div>
    );
}
