"use client";
import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import { useSession, signOut } from "next-auth/react";

const InteractiveBackground = dynamic(() => import("@/components/InteractiveBackground"), {
    ssr: false,
    loading: () => null,
});

// ─── Product Cards Data ──────────────────────────────────
const products = [
    {
        id: "text",
        title: "Text Scanner",
        subtitle: "AI-Generated Text Detection",
        description: "Paste or upload any document and get sentence-level analysis showing exactly where AI was used. Powered by the Jotril V2 multi-scale detection engine.",
        icon: (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        status: "live",
        href: "https://textscanner.ai.jotril.com",
        gradient: "from-[var(--dyn-accent-blue)] to-[#06B6D4]",
        glowColor: "rgba(37, 99, 235, 0.3)",
        accentColor: "var(--dyn-accent-blue)",
    },
    {
        id: "image",
        title: "Image Scanner",
        subtitle: "AI-Generated Image Detection",
        description: "Detect AI-generated images from DALL·E, Midjourney, Stable Diffusion, and more. Pixel-level forensic analysis.",
        icon: (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
        status: "coming",
        gradient: "from-[var(--dyn-accent-purple)] to-[var(--dyn-accent-pink)]",
        glowColor: "rgba(124, 58, 237, 0.3)",
        accentColor: "var(--dyn-accent-purple)",
    },
    {
        id: "video",
        title: "Video Scanner",
        subtitle: "AI-Generated Video Detection",
        description: "Analyze video content for deepfakes and AI-generated footage. Frame-by-frame temporal analysis.",
        icon: (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
        ),
        status: "coming",
        gradient: "from-[var(--dyn-accent-pink)] to-[#F97316]",
        glowColor: "rgba(236, 72, 153, 0.3)",
        accentColor: "var(--dyn-accent-pink)",
    },
    {
        id: "audio",
        title: "Audio Scanner",
        subtitle: "AI-Generated Audio Detection",
        description: "Identify AI-cloned voices, synthetic speech, and AI-generated music. Waveform-level forensic detection.",
        icon: (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
        ),
        status: "coming",
        gradient: "from-[#06B6D4] to-[#10B981]",
        glowColor: "rgba(6, 182, 212, 0.3)",
        accentColor: "#06B6D4",
    },
];

// ─── Framer motion variants ──────────────────────────────
const sectionVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const wordVariants = {
    hidden: { clipPath: "inset(0 100% 0 0)", opacity: 0 },
    visible: (i) => ({
        clipPath: "inset(0 0% 0 0)",
        opacity: 1,
        transition: { delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    }),
};

// ─── Bento Product Card ──────────────────────────────────
function ProductCard({ product, index }) {
    const ref = useRef(null);
    const isLive = product.status === "live";

    const handleMouseMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        el.style.setProperty("--bento-x", `${x}%`);
        el.style.setProperty("--bento-y", `${y}%`);
    };

    const CardContent = (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`bento-spotlight glass-card rounded-3xl p-8 relative group overflow-hidden cursor-pointer h-full flex flex-col transition-transform duration-300 ease-out ${isLive ? "ring-2 ring-[var(--dyn-accent-blue)]/30 hover:scale-[1.02] hover:-translate-y-2" : "hover:-translate-y-1"}`}
        >
            {/* Glow backdrop */}
            <div
                className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[80px] opacity-0 group-hover:opacity-60 transition-opacity duration-700"
                style={{ background: product.glowColor }}
            />

            {/* Status badge */}
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div
                    className="p-3.5 rounded-2xl border transition-all duration-500 group-hover:scale-110"
                    style={{
                        borderColor: isLive ? product.accentColor : "var(--dyn-glass-border)",
                        color: product.accentColor,
                        background: isLive
                            ? `linear-gradient(135deg, ${product.glowColor}, transparent)`
                            : "var(--dyn-glass-bg)",
                    }}
                >
                    {product.icon}
                </div>
                {isLive ? (
                    <span
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full border"
                        style={{
                            color: "#10B981",
                            background: "rgba(16, 185, 129, 0.1)",
                            borderColor: "rgba(16, 185, 129, 0.3)",
                        }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                        Live
                    </span>
                ) : (
                    <span
                        className="text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full border"
                        style={{
                            color: "var(--dyn-ash)",
                            background: "var(--dyn-glass-bg)",
                            borderColor: "var(--dyn-glass-border)",
                        }}
                    >
                        Coming Soon
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col">
                <h3 className="text-2xl font-black tracking-tight mb-1" style={{ color: "var(--dyn-text-navy)" }}>
                    {product.title}
                </h3>
                <p className="text-xs font-bold uppercase tracking-[0.14em] mb-4" style={{ color: product.accentColor }}>
                    {product.subtitle}
                </p>
                <p className="text-[15px] leading-relaxed mb-6 flex-1" style={{ color: "var(--dyn-ash)" }}>
                    {product.description}
                </p>

                {/* CTA */}
                {isLive ? (
                    <div
                        className={`btn-shimmer inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-white bg-gradient-to-r ${product.gradient} shadow-lg transition-all group-hover:shadow-xl`}
                    >
                        Launch Scanner
                        <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </div>
                ) : (
                    <div
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm border transition-all"
                        style={{
                            color: "var(--dyn-ash)",
                            borderColor: "var(--dyn-glass-border)",
                            background: "var(--dyn-glass-bg)",
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        Notify Me
                    </div>
                )}
            </div>
        </motion.div>
    );

    if (isLive) {
        return (
            <a href={product.href} className="block h-full">
                {CardContent}
            </a>
        );
    }
    return CardContent;
}

// ─── Main Landing Page ───────────────────────────────────
const heroWords = ["The", "AI", "Detection"];

export default function BrandLanding() {
    const { data: session } = useSession();
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const springX = useSpring(mouseX, { stiffness: 40, damping: 25 });
    const springY = useSpring(mouseY, { stiffness: 40, damping: 25 });
    const springX2 = useSpring(mouseX, { stiffness: 20, damping: 20 });
    const springY2 = useSpring(mouseY, { stiffness: 20, damping: 20 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            mouseX.set((e.clientX / window.innerWidth - 0.5) * 80);
            mouseY.set((e.clientY / window.innerHeight - 0.5) * 60);
        };
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [mouseX, mouseY]);

    return (
        <main
            className="min-h-screen overflow-x-hidden"
            style={{ background: "var(--dyn-bg-white)", color: "var(--dyn-text-navy)", fontFamily: "var(--font-sans)" }}
        >
            <InteractiveBackground />
            <Navbar session={session} onSignOut={() => signOut()} />

            {/* ══════════════════════════════════════════════
                HERO — Cinematic Fullscreen
            ══════════════════════════════════════════════ */}
            <section
                className="relative min-h-screen flex flex-col items-center justify-center aurora-bg overflow-hidden"
                style={{ paddingTop: "80px" }}
            >
                <div className="aurora-accent" style={{ top: "15%", left: "42%" }} />

                {/* Mouse-parallax orbs */}
                <motion.div
                    style={{
                        x: springX, y: springY,
                        position: "absolute", top: "12%", right: "8%",
                        width: "560px", height: "560px", borderRadius: "50%",
                        background: "var(--dyn-aurora-1)", filter: "blur(70px)",
                        pointerEvents: "none", zIndex: 1,
                    }}
                />
                <motion.div
                    style={{
                        x: springX2, y: springY2,
                        position: "absolute", bottom: "8%", left: "5%",
                        width: "460px", height: "460px", borderRadius: "50%",
                        background: "var(--dyn-aurora-2)", filter: "blur(80px)",
                        pointerEvents: "none", zIndex: 1,
                    }}
                />
                <motion.div
                    style={{
                        x: springX, y: springY2,
                        position: "absolute", top: "45%", left: "30%",
                        width: "340px", height: "340px", borderRadius: "50%",
                        background: "var(--dyn-aurora-3)", filter: "blur(90px)",
                        pointerEvents: "none", zIndex: 1,
                    }}
                />

                {/* Floating micro-orbs */}
                <div className="floating-orb w-3 h-3 top-[22%] left-[14%] z-10 opacity-60"
                    style={{ background: "var(--dyn-accent-blue)", animationDelay: "0s" }} />
                <div className="floating-orb w-2 h-2 top-[62%] right-[18%] z-10 opacity-50"
                    style={{ background: "var(--dyn-accent-purple)", animationDelay: "3s" }} />
                <div className="floating-orb w-4 h-4 top-[38%] left-[72%] z-10 opacity-40"
                    style={{ background: "var(--dyn-accent-pink)", animationDelay: "6s" }} />

                {/* Hero content */}
                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center space-y-8">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                        className="inline-flex items-center gap-2.5 px-5 py-2 glass-card rounded-full breathe"
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--dyn-accent-blue)" }} />
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--dyn-accent-blue)" }}>
                            Multi-Modal AI Detection Platform
                        </span>
                    </motion.div>

                    {/* Headline */}
                    <div className="space-y-4 relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-accent-blue/10 via-accent-purple/10 to-accent-pink/10 blur-[100px] -z-10 rounded-full mix-blend-screen pointer-events-none" />
                        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight leading-[1.1] pb-2">
                            {heroWords.map((word, i) => (
                                <motion.span
                                    key={word}
                                    custom={i}
                                    initial="hidden"
                                    animate="visible"
                                    variants={wordVariants}
                                    className="inline-block mr-[0.25em]"
                                    style={{ color: "var(--dyn-text-navy)" }}
                                >
                                    {word}
                                </motion.span>
                            ))}
                            <br />
                            <motion.span
                                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                                transition={{ delay: 0.32, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                                className="gradient-text-vivid inline-block tracking-tighter"
                                style={{ textShadow: "0 0 40px var(--dyn-glow-color)" }}
                            >
                                Super Platform.
                            </motion.span>
                        </h1>
                    </div>

                    {/* Subheading */}
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.45, duration: 0.6 }}
                        className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium"
                        style={{ color: "var(--dyn-ash)" }}
                    >
                        One platform to detect AI-generated content across text, images, video, and audio. Enterprise-grade precision for the AI era.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.58, duration: 0.6 }}
                        className="flex flex-col sm:flex-row gap-4 justify-center items-center"
                    >
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="btn-shimmer hover:scale-[1.06] hover:-translate-y-1 active:scale-95 duration-300 transition-transform relative font-bold text-base py-4 px-10 rounded-full text-white overflow-hidden"
                            style={{
                                background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple), var(--dyn-accent-pink))",
                                backgroundSize: "200% 200%",
                                animation: "border-flow 5s ease infinite",
                                boxShadow: "0 6px 30px var(--dyn-glow-color), inset 0 1px 0 rgba(255,255,255,0.2)",
                            }}
                        >
                            Explore Our Tools →
                        </button>
                        <a
                            href="https://textscanner.ai.jotril.com"
                            className="hover:scale-105 active:scale-95 duration-300 transition-transform font-bold text-base py-4 px-10 rounded-full border-2 backdrop-blur-sm"
                            style={{
                                borderColor: "var(--dyn-silver-dark)",
                                color: "var(--dyn-text-navy)",
                                background: "var(--dyn-glass-bg)",
                            }}
                        >
                            Try Text Scanner Free
                        </a>
                    </motion.div>

                    {/* Scroll indicator */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, y: [0, 10, 0] }}
                        transition={{ delay: 1.2, y: { repeat: Infinity, duration: 2.2, ease: "easeInOut" } }}
                        className="pt-8 flex justify-center"
                    >
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="transition-colors" style={{ color: "var(--dyn-ash-light)" }}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════
                PRODUCTS GRID
            ══════════════════════════════════════════════ */}
            <section id="products" className="py-28 relative" style={{ background: "var(--dyn-bg-surface)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="max-w-6xl mx-auto px-6"
                >
                    <div className="text-center mb-16">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                            Detection Suite
                        </p>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                            AI Detection for Everything
                        </h2>
                        <p className="mt-4 max-w-xl mx-auto text-base" style={{ color: "var(--dyn-ash)" }}>
                            From essays to deepfakes — catch what others miss.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {products.map((product, i) => (
                            <ProductCard key={product.id} product={product} index={i} />
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                TECHNOLOGY SECTION
            ══════════════════════════════════════════════ */}
            <section className="relative py-28 overflow-hidden" style={{ background: "var(--dyn-bg-white)" }}>
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        background: "conic-gradient(from 0deg at 50% 50%, var(--dyn-accent-blue) 0%, var(--dyn-accent-purple) 33%, var(--dyn-accent-pink) 66%, var(--dyn-accent-blue) 100%)",
                        filter: "blur(80px)",
                        animation: "spin-slow 18s linear infinite",
                        transformOrigin: "center",
                    }}
                />
                <div className="absolute inset-0" style={{ background: "var(--dyn-bg-white)", opacity: 0.7 }} />

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="relative z-10 max-w-5xl mx-auto px-6 text-center"
                >
                    <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                        Why Jotril
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6" style={{ color: "var(--dyn-text-navy)" }}>
                        Built for the AI Era
                    </h2>
                    <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-16" style={{ color: "var(--dyn-ash)" }}>
                        As AI-generated content floods every medium, you need detection that keeps pace. Jotril uses proprietary deep-learning models trained on millions of samples — continuously updated to stay ahead.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {[
                            { icon: "🧠", title: "Multi-Modal", desc: "One platform for text, image, video, and audio detection." },
                            { icon: "⚡", title: "Enterprise Speed", desc: "Sub-5-second scans with no accuracy compromises." },
                            { icon: "🔬", title: "Forensic Precision", desc: "Sentence-level, pixel-level, frame-level analysis." },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15 }}
                                className="glass-card rounded-2xl p-8 hover-lift text-center"
                            >
                                <div className="text-4xl mb-4">{item.icon}</div>
                                <h3 className="font-bold text-lg mb-2" style={{ color: "var(--dyn-text-navy)" }}>{item.title}</h3>
                                <p className="text-sm leading-relaxed" style={{ color: "var(--dyn-ash)" }}>{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                CTA BANNER
            ══════════════════════════════════════════════ */}
            <section className="py-24" style={{ background: "var(--dyn-bg-surface)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={sectionVariants}
                    className="max-w-4xl mx-auto px-6 text-center"
                >
                    <div className="glass-card rounded-3xl p-12 md:p-16 relative overflow-hidden">
                        {/* Background glow */}
                        <div
                            className="absolute inset-0 opacity-30"
                            style={{
                                background: "radial-gradient(ellipse at 50% 0%, var(--dyn-glow-color) 0%, transparent 70%)",
                            }}
                        />

                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4" style={{ color: "var(--dyn-text-navy)" }}>
                                Start Detecting AI Content Today
                            </h2>
                            <p className="text-base md:text-lg mb-8 max-w-lg mx-auto" style={{ color: "var(--dyn-ash)" }}>
                                Try our Text Scanner for free — no sign-up required for basic scans.
                            </p>
                            <a
                                href="https://textscanner.ai.jotril.com"
                                className="btn-shimmer inline-flex items-center gap-2 hover:scale-[1.06] hover:-translate-y-1 active:scale-95 transition-transform duration-300 font-bold text-base py-4 px-10 rounded-full text-white"
                                style={{
                                    background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                                    boxShadow: "0 6px 30px var(--dyn-glow-color)",
                                }}
                            >
                                Launch Text Scanner
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                FOOTER
            ══════════════════════════════════════════════ */}
            <footer className="py-12 border-t" style={{ borderColor: "var(--dyn-glass-border)", background: "var(--dyn-bg-white)" }}>
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-1">
                        <span className="text-lg font-black" style={{ color: "var(--dyn-text-navy)" }}>Jotril</span>
                        <span className="text-lg font-black" style={{ color: "var(--dyn-accent-blue)" }}>AI.</span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--dyn-ash)" }}>
                        © {new Date().getFullYear()} Jotril AI. All rights reserved.
                    </p>
                    <div className="flex gap-6">
                        <a href="https://textscanner.ai.jotril.com" className="text-sm font-medium transition-colors hover:text-[var(--dyn-accent-blue)]" style={{ color: "var(--dyn-ash)" }}>
                            Text Scanner
                        </a>
                    </div>
                </div>
            </footer>
        </main>
    );
}
