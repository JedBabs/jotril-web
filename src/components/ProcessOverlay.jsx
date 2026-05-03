"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   JOTRIL — HOLOGRAPHIC PROCESS OVERLAY
   A cinematic 3D interstitial with rotating tesseract geometry,
   orbiting particle rings, and volumetric scan lines.
   ═══════════════════════════════════════════════════════════════ */

// ─── Floating Particle Field ────────────────────────────────
function ParticleField({ count = 40, hue }) {
    const particles = useMemo(() =>
        Array.from({ length: count }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 1 + Math.random() * 3,
            delay: Math.random() * 8,
            duration: 4 + Math.random() * 6,
            opacity: 0.15 + Math.random() * 0.5,
        })), [count]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full"
                    style={{
                        width: p.size,
                        height: p.size,
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        background: `hsla(${hue}, 80%, 70%, ${p.opacity})`,
                        boxShadow: `0 0 ${p.size * 3}px hsla(${hue}, 80%, 70%, 0.3)`,
                    }}
                    animate={{
                        y: [0, -30, 0],
                        opacity: [p.opacity, p.opacity * 0.3, p.opacity],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}

// ─── 3D Rotating Tesseract / Sacred Geometry ─────────────────
function HolographicCore({ variant }) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const iv = setInterval(() => setTick(t => (t + 1) % 360), 30);
        return () => clearInterval(iv);
    }, []);

    const configs = {
        analyze: { hue: 265, accent: "rgba(157,113,247,0.6)", glow: "rgba(157,113,247,0.2)" },
        upload: { hue: 220, accent: "rgba(59,130,246,0.6)", glow: "rgba(59,130,246,0.2)" },
        download: { hue: 160, accent: "rgba(16,185,129,0.6)", glow: "rgba(16,185,129,0.2)" },
    };
    const cfg = configs[variant] || configs.analyze;

    return (
        <div className="relative w-56 h-56 flex items-center justify-center" style={{ perspective: "800px" }}>
            {/* Outer volumetric glow */}
            <div
                className="absolute w-40 h-40 rounded-full blur-3xl animate-pulse"
                style={{ background: cfg.glow }}
            />

            {/* Ring 1 — Large orbit */}
            <div
                className="absolute w-56 h-56"
                style={{
                    transform: `rotateX(${70 + Math.sin(tick * 0.015) * 10}deg) rotateZ(${tick}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                <div
                    className="w-full h-full rounded-full border-[1.5px]"
                    style={{
                        borderColor: `hsla(${cfg.hue}, 80%, 70%, 0.3)`,
                        boxShadow: `0 0 20px hsla(${cfg.hue}, 80%, 70%, 0.15)`,
                    }}
                />
                {/* Orbital dot */}
                <div
                    className="absolute w-3 h-3 rounded-full"
                    style={{
                        top: -6,
                        left: "calc(50% - 6px)",
                        background: cfg.accent,
                        boxShadow: `0 0 12px ${cfg.accent}, 0 0 30px ${cfg.glow}`,
                    }}
                />
            </div>

            {/* Ring 2 — Tilted counter-orbit */}
            <div
                className="absolute w-48 h-48"
                style={{
                    transform: `rotateX(${55 + Math.cos(tick * 0.02) * 15}deg) rotateY(${25}deg) rotateZ(${-tick * 0.7}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                <div
                    className="w-full h-full rounded-full border-[1px]"
                    style={{
                        borderColor: `hsla(${cfg.hue + 40}, 70%, 65%, 0.25)`,
                        boxShadow: `0 0 15px hsla(${cfg.hue + 40}, 70%, 65%, 0.1)`,
                    }}
                />
                <div
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                        bottom: -4,
                        left: "calc(50% - 4px)",
                        background: `hsla(${cfg.hue + 40}, 70%, 70%, 0.6)`,
                        boxShadow: `0 0 8px hsla(${cfg.hue + 40}, 70%, 70%, 0.4)`,
                    }}
                />
            </div>

            {/* Ring 3 — Fast inner orbit */}
            <div
                className="absolute w-36 h-36"
                style={{
                    transform: `rotateX(${80}deg) rotateZ(${tick * 1.5}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                <div
                    className="w-full h-full rounded-full border-[1.5px] border-dashed"
                    style={{ borderColor: `hsla(${cfg.hue}, 90%, 80%, 0.2)` }}
                />
            </div>

            {/* 3D Tesseract Core — 6 faces forming a hollow cube */}
            <div
                className="absolute w-20 h-20"
                style={{
                    transform: `rotateX(${tick * 0.8}deg) rotateY(${tick * 1.2}deg) rotateZ(${tick * 0.4}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                {/* Front */}
                <CubeFace
                    translate="translateZ(40px)"
                    hue={cfg.hue} opacity={0.15}
                />
                {/* Back */}
                <CubeFace
                    translate="translateZ(-40px) rotateY(180deg)"
                    hue={cfg.hue} opacity={0.12}
                />
                {/* Left */}
                <CubeFace
                    translate="translateX(-40px) rotateY(-90deg)"
                    hue={cfg.hue + 20} opacity={0.12}
                />
                {/* Right */}
                <CubeFace
                    translate="translateX(40px) rotateY(90deg)"
                    hue={cfg.hue + 20} opacity={0.1}
                />
                {/* Top */}
                <CubeFace
                    translate="translateY(-40px) rotateX(90deg)"
                    hue={cfg.hue + 40} opacity={0.08}
                />
                {/* Bottom */}
                <CubeFace
                    translate="translateY(40px) rotateX(-90deg)"
                    hue={cfg.hue + 40} opacity={0.08}
                />
            </div>

            {/* Inner nested cube (smaller, faster) */}
            <div
                className="absolute w-12 h-12"
                style={{
                    transform: `rotateX(${-tick * 1.5}deg) rotateY(${-tick * 1}deg)`,
                    transformStyle: "preserve-3d",
                }}
            >
                <CubeFace translate="translateZ(24px)" hue={cfg.hue} opacity={0.3} />
                <CubeFace translate="translateZ(-24px) rotateY(180deg)" hue={cfg.hue} opacity={0.25} />
                <CubeFace translate="translateX(-24px) rotateY(-90deg)" hue={cfg.hue} opacity={0.2} />
                <CubeFace translate="translateX(24px) rotateY(90deg)" hue={cfg.hue} opacity={0.2} />
                <CubeFace translate="translateY(-24px) rotateX(90deg)" hue={cfg.hue} opacity={0.15} />
                <CubeFace translate="translateY(24px) rotateX(-90deg)" hue={cfg.hue} opacity={0.15} />
            </div>

            {/* Central pulsing sphere */}
            <div
                className="absolute w-6 h-6 rounded-full animate-pulse"
                style={{
                    background: `radial-gradient(circle, hsla(${cfg.hue}, 90%, 80%, 0.8) 0%, hsla(${cfg.hue}, 90%, 60%, 0.2) 70%, transparent 100%)`,
                    boxShadow: `0 0 30px hsla(${cfg.hue}, 90%, 70%, 0.4), 0 0 60px hsla(${cfg.hue}, 90%, 70%, 0.15)`,
                }}
            />
        </div>
    );
}

function CubeFace({ translate, hue, opacity }) {
    return (
        <div
            className="absolute inset-0"
            style={{
                transform: translate,
                backfaceVisibility: "visible",
                border: `1px solid hsla(${hue}, 80%, 70%, ${opacity + 0.15})`,
                background: `hsla(${hue}, 70%, 60%, ${opacity * 0.3})`,
                boxShadow: `inset 0 0 20px hsla(${hue}, 80%, 70%, ${opacity * 0.5})`,
            }}
        />
    );
}

// ─── Scan Line Effect ────────────────────────────────────────
function ScanLine({ hue }) {
    return (
        <motion.div
            className="absolute left-0 right-0 h-[2px] pointer-events-none z-20"
            style={{
                background: `linear-gradient(90deg, transparent, hsla(${hue}, 80%, 70%, 0.4), transparent)`,
                boxShadow: `0 0 20px hsla(${hue}, 80%, 70%, 0.2)`,
            }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
    );
}

// ─── Variant-Specific Icon ──────────────────────────────────
function VariantIcon({ variant }) {
    const icons = {
        analyze: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
        ),
        upload: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
        ),
        download: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
    };
    return icons[variant] || icons.analyze;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ProcessOverlay({ isActive, variant, progress, title, stepText }) {
    const hueMap = { analyze: 265, upload: 220, download: 160 };
    const hue = hueMap[variant] || 265;

    const accentMap = {
        analyze: "hsla(265, 80%, 70%, 1)",
        upload: "hsla(220, 85%, 60%, 1)",
        download: "hsla(160, 75%, 50%, 1)",
    };
    const accent = accentMap[variant] || accentMap.analyze;

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
                    style={{
                        background: `radial-gradient(ellipse at 50% 40%, hsla(${hue}, 40%, 12%, 0.98) 0%, hsla(${hue}, 50%, 5%, 0.99) 100%)`,
                    }}
                >
                    {/* Volumetric scan line */}
                    <ScanLine hue={hue} />

                    {/* Ambient particle field */}
                    <ParticleField count={50} hue={hue} />

                    {/* Grid floor effect */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-[45%] pointer-events-none"
                        style={{
                            background: `linear-gradient(180deg, transparent 0%, hsla(${hue}, 30%, 8%, 0.8) 100%)`,
                            maskImage: "linear-gradient(180deg, transparent 0%, black 40%)",
                            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 40%)",
                        }}
                    >
                        <div
                            className="w-full h-full"
                            style={{
                                backgroundImage: `
                                    linear-gradient(hsla(${hue}, 60%, 50%, 0.06) 1px, transparent 1px),
                                    linear-gradient(90deg, hsla(${hue}, 60%, 50%, 0.06) 1px, transparent 1px)`,
                                backgroundSize: "40px 40px",
                                transform: "perspective(500px) rotateX(60deg)",
                                transformOrigin: "bottom",
                            }}
                        />
                    </div>

                    {/* Main content */}
                    <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-6">

                        {/* 3D Holographic Core */}
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0, rotateY: -90 }}
                            animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                            transition={{ type: "spring", stiffness: 120, damping: 15 }}
                        >
                            <HolographicCore variant={variant} />
                        </motion.div>

                        {/* Title Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                            className="text-center mt-14 w-full"
                        >
                            {/* Icon badge */}
                            <div className="flex items-center justify-center gap-2 mb-4">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{
                                        background: `hsla(${hue}, 70%, 60%, 0.15)`,
                                        border: `1px solid hsla(${hue}, 70%, 60%, 0.2)`,
                                        color: accent,
                                    }}
                                >
                                    <VariantIcon variant={variant} />
                                </div>
                                <span
                                    className="text-[10px] font-bold uppercase tracking-[0.3em]"
                                    style={{ color: `hsla(${hue}, 70%, 70%, 0.7)` }}
                                >
                                    {variant === "analyze" ? "Neural Engine" : variant === "upload" ? "Secure Transit" : "Compiling Report"}
                                </span>
                            </div>

                            <h2
                                className="text-3xl font-black tracking-tight leading-tight"
                                style={{
                                    color: "white",
                                    textShadow: `0 0 40px hsla(${hue}, 80%, 70%, 0.15)`,
                                }}
                            >
                                {title}
                            </h2>

                            {/* Progress track */}
                            <div className="mt-10 relative w-full">
                                {/* Track background */}
                                <div
                                    className="w-full h-1 rounded-full overflow-hidden"
                                    style={{
                                        background: `hsla(${hue}, 30%, 20%, 0.5)`,
                                        border: `1px solid hsla(${hue}, 40%, 30%, 0.3)`,
                                    }}
                                >
                                    {/* Fill */}
                                    <motion.div
                                        className="h-full rounded-full relative"
                                        style={{
                                            background: `linear-gradient(90deg, hsla(${hue}, 80%, 60%, 0.8), ${accent})`,
                                            boxShadow: `0 0 20px hsla(${hue}, 80%, 70%, 0.4)`,
                                        }}
                                        initial={{ width: "0%" }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ ease: "easeOut", duration: 0.4 }}
                                    />
                                </div>
                                {/* Glowing tip marker */}
                                <motion.div
                                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                                    style={{
                                        background: accent,
                                        boxShadow: `0 0 10px ${accent}, 0 0 25px hsla(${hue}, 80%, 70%, 0.3)`,
                                    }}
                                    initial={{ left: 0 }}
                                    animate={{ left: `calc(${progress}% - 6px)` }}
                                    transition={{ ease: "easeOut", duration: 0.4 }}
                                />
                            </div>

                            {/* Status readout */}
                            <div className="mt-5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <motion.div
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: accent }}
                                        animate={{ opacity: [1, 0.3, 1] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                    />
                                    <span
                                        className="text-xs font-mono font-medium tracking-wide truncate max-w-[250px]"
                                        style={{ color: `hsla(${hue}, 20%, 60%, 0.8)` }}
                                    >
                                        {stepText}
                                    </span>
                                </div>
                                <span
                                    className="text-sm font-mono font-black tabular-nums"
                                    style={{ color: accent }}
                                >
                                    {Math.round(progress)}%
                                </span>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
