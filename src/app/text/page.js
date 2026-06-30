"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import FileUploader from "@/components/FileUploader";
import { showToast } from "@/components/Toast";
import { usePPP } from "@/hooks/usePPP";
import { useAnalyze } from "@/hooks/useAnalyze";
import QuotaBar from "@/components/QuotaBar";
import { generateHardwareVector } from "@/lib/fingerprint";
import { useProcess } from "@/components/ProcessContext";

// Below-the-fold / conditional components — split out of the initial bundle.
// On slow networks the hero + scanner CTA paint sooner; these only download
// when they're actually needed (after a scan completes / on cold start /
// when the canvas background mounts client-side).
const HeatmapViewer = dynamic(() => import("@/components/HeatmapViewer"), {
    loading: () => null,
});
const ScoreGauge = dynamic(() => import("@/components/ScoreGauge"), {
    loading: () => null,
});
const ColdStartOverlay = dynamic(() => import("@/components/ColdStartOverlay"), {
    ssr: false,
    loading: () => null,
});
const SignUpNudge = dynamic(() => import("@/components/SignUpNudge"), {
    loading: () => null,
});
// Canvas-only visual; never SSR'd. Skipping SSR also avoids hydration cost
// on slow CPUs.
const InteractiveBackground = dynamic(() => import("@/components/InteractiveBackground"), {
    ssr: false,
    loading: () => null,
});

// ─── FAQ data ───────────────────────────────────────────────
const faqs = [
    { q: "How does Jotril AI work?", a: "Jotril uses a proprietary deep-learning model trained on millions of documents. It goes far beyond simple pattern matching — our engine understands the subtle differences between how humans and AI construct language." },
    { q: "Which AI models can Jotril detect?", a: "Jotril detects content from all major AI writing tools including ChatGPT, Claude, Gemini, Llama, and more. Our model is continuously updated to stay ahead of new AI systems as they emerge." },
    { q: "How accurate is the detection?", a: "Jotril consistently outperforms standard single-pass detectors, especially on mixed documents where only parts of the text are AI-generated. For best results, we recommend providing at least 100 words." },
    { q: "What file formats are supported?", a: "You can paste text directly or upload PDF, DOCX, and TXT files up to 5MB." },
    { q: "Can I integrate Jotril into my own platform?", a: "Yes — our Developer API lets you integrate AI detection directly into your applications, LMS, or publishing workflow. Available on the Pro plan." },
];

// ─── SVG Icons for Capabilities ──────────────────────────────
const BrainIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);
const DocIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-purple transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const HeatmapIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-pink transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);
const ZapIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-color-accent-cyan transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);
const ApiIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);
const TargetIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-pink transition-all group-hover:scale-110 duration-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

// ─── Capability cards ────────────────────────────────────────
const capabilities = [
    { icon: <BrainIcon />, title: "Deep Analysis", desc: "Goes beyond pattern matching to understand the nuances that separate human writing from AI — delivering results at a sentence level.", large: true },
    { icon: <DocIcon />, title: "Document Upload", desc: "Drop in a PDF, Word doc, or text file and get instant results." },
    { icon: <HeatmapIcon />, title: "Heatmap View", desc: "See exactly which sentences were AI-written with a color-coded heatmap." },
    { icon: <ZapIcon />, title: "Fast & Reliable", desc: "Sub-5-second scans without sacrificing accuracy." },
    { icon: <ApiIcon />, title: "Developer API", desc: "REST API for integrating detection into your apps, LMS, or workflow." },
    { icon: <TargetIcon />, title: "Mixed Content", desc: "Catches documents where only a few sentences are AI-generated — the hardest problem in detection." },
];

// ─── Framer variants ─────────────────────────────────────────
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

// ─── 3D Tilt Card ────────────────────────────────────────────
function TiltCard({ children, className, style }) {
    const ref = useRef(null);

    const handleMouseMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const rx = ((e.clientY - cy) / (rect.height / 2)) * -12;
        const ry = ((e.clientX - cx) / (rect.width / 2)) * 12;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
    };

    const handleMouseLeave = () => {
        if (ref.current) ref.current.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
    };

    return (
        <div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`tilt-card ${className}`}
            style={{ transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)", ...style }}
        >
            {children}
        </div>
    );
}

// ─── Bento Spotlight Card ─────────────────────────────────────
function BentoCard({ icon, title, desc, large }) {
    const ref = useRef(null);

    const handleMouseMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        el.style.setProperty("--bento-x", `${x}%`);
        el.style.setProperty("--bento-y", `${y}%`);
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`bento-spotlight glass-card rounded-2xl p-7 hover-lift relative group overflow-hidden ${large ? "md:col-span-2 md:row-span-2" : ""}`}
        >
            <div className="relative z-10 flex flex-col h-full">
                <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/0 border border-white/5 inline-flex self-start">
                    {icon}
                </div>
                <h3
                    className="font-bold text-lg mb-2 group-hover:text-[var(--dyn-accent-blue)] transition-colors"
                    style={{ color: "var(--dyn-text-navy)" }}
                >
                    {title}
                </h3>
                <p className="text-[15px] leading-relaxed" style={{ color: "var(--dyn-ash)" }}>{desc}</p>
            </div>
        </motion.div>
    );
}

// ─── Animated Counter ─────────────────────────────────────────
function CountUp({ to, suffix = "" }) {
    const [val, setVal] = useState(0);
    const ref = useRef(null);
    const observed = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !observed.current) {
                    observed.current = true;
                    const target = parseFloat(to);
                    const duration = 1400;
                    const start = performance.now();
                    const tick = (now) => {
                        const p = Math.min((now - start) / duration, 1);
                        const ease = 1 - Math.pow(1 - p, 3);
                        setVal(Math.round(ease * target));
                        if (p < 1) requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                }
            },
            { threshold: 0.1 } // Lowered threshold so it runs reliably
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [to]);

    return (
        <span ref={ref} className="num-rise inline-block tabular-nums">
            {val}{suffix}
        </span>
    );
}

// ─── Main Page ────────────────────────────────────────────────
const heroWords = ["Detect", "AI-Generated", "Text"];

export default function Home() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const { premiumPricing } = usePPP();
    const { openProcess, simulateProgress, closeProcess } = useProcess();
    const [deviceHash, setDeviceHash] = useState(null);
    const [openFaq, setOpenFaq] = useState(null);
    const { data: session } = useSession();
    const [devMode, setDevMode] = useState(false);
    const {
        results,
        breakdown,
        overallLabel,
        coldStart,
        scannedFile,
        sourceHtml,
        quotaRefreshKey,
        isActive,
        lastText,
        lastScanId,
        handleAnalyze,
        handleRetry,
        resetResults,
    } = useAnalyze({ deviceHash });

    // Mouse parallax for hero orbs
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const springX = useSpring(mouseX, { stiffness: 40, damping: 25 });
    const springY = useSpring(mouseY, { stiffness: 40, damping: 25 });
    const springX2 = useSpring(mouseX, { stiffness: 20, damping: 20 });
    const springY2 = useSpring(mouseY, { stiffness: 20, damping: 20 });

    useEffect(() => {
        generateHardwareVector().then((vector) => setDeviceHash(vector));
    }, []);

    useEffect(() => {
        const handleMouseMove = (e) => {
            mouseX.set((e.clientX / window.innerWidth - 0.5) * 80);
            mouseY.set((e.clientY / window.innerHeight - 0.5) * 60);
        };
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [mouseX, mouseY]);

    // Deep-link support: arriving at /text#scanner (from the landing "Try Text Scanner"
    // CTAs) jumps straight to the scanner once the real content is mounted. Native hash
    // scrolling can land at the top when the target sits below the full-screen animated
    // hero, so do it explicitly after `mounted`.
    useEffect(() => {
        if (!mounted) return;
        const id = window.location.hash.slice(1);
        if (!id) return;
        const t = setTimeout(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
        }, 60);
        return () => clearTimeout(t);
    }, [mounted]);

    const isLoggedIn = !!session?.user;
    const userRole = session?.user?.role || "UNAUTHENTICATED";

    return (
        <main
            className="min-h-screen overflow-x-hidden"
            style={{ background: "var(--dyn-bg-white)", color: "var(--dyn-text-navy)", fontFamily: "var(--font-sans)" }}
        >
            {/* Global particle canvas */}
            <InteractiveBackground />

            <Navbar session={session} onSignOut={() => signOut()} />

            {/* ══════════════════════════════════════════════
                HERO — Cinematic Fullscreen
            ══════════════════════════════════════════════ */}
            <section
                className="relative min-h-screen flex flex-col items-center justify-center aurora-bg overflow-hidden"
                style={{ paddingTop: "80px" }}
            >
                {/* Aurora accent */}
                <div className="aurora-accent" style={{ top: "15%", left: "42%" }} />

                {/* Mouse-parallax orbs */}
                <motion.div
                    style={{
                        x: springX,
                        y: springY,
                        position: "absolute",
                        top: "15%",
                        right: "8%",
                        width: "520px",
                        height: "520px",
                        borderRadius: "50%",
                        background: "var(--dyn-aurora-1)",
                        filter: "blur(70px)",
                        pointerEvents: "none",
                        zIndex: 1,
                    }}
                />
                <motion.div
                    style={{
                        x: springX2,
                        y: springY2,
                        position: "absolute",
                        bottom: "10%",
                        left: "5%",
                        width: "420px",
                        height: "420px",
                        borderRadius: "50%",
                        background: "var(--dyn-aurora-2)",
                        filter: "blur(80px)",
                        pointerEvents: "none",
                        zIndex: 1,
                    }}
                />
                <motion.div
                    style={{
                        x: springX,
                        y: springY2,
                        position: "absolute",
                        top: "40%",
                        left: "30%",
                        width: "300px",
                        height: "300px",
                        borderRadius: "50%",
                        background: "var(--dyn-aurora-3)",
                        filter: "blur(90px)",
                        pointerEvents: "none",
                        zIndex: 1,
                    }}
                />

                {/* Floating micro-orbs */}
                <div className="floating-orb w-3 h-3 top-[22%] left-[14%] z-10 opacity-60"
                    style={{ background: "var(--dyn-accent-blue)", animationDelay: "0s" }} />
                <div className="floating-orb w-2 h-2 top-[62%] right-[18%] z-10 opacity-50"
                    style={{ background: "var(--dyn-accent-purple)", animationDelay: "3s" }} />
                <div className="floating-orb w-4 h-4 top-[38%] left-[72%] z-10 opacity-40"
                    style={{ background: "var(--dyn-accent-pink)", animationDelay: "6s" }} />
                <div className="floating-orb w-2 h-2 top-[78%] left-[28%] z-10 opacity-45"
                    style={{ background: "var(--color-accent-cyan)", animationDelay: "2s" }} />

                {/* Hero content */}
                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center space-y-8">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                        className="inline-flex items-center gap-2.5 px-5 py-2 glass-card rounded-full breathe"
                    >
                        <span
                            className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: "var(--dyn-accent-blue)" }}
                        />
                        <span
                            className="text-xs font-bold tracking-widest uppercase"
                            style={{ color: "var(--dyn-accent-blue)" }}
                        >
                            Powered by Jotril V2 Engine
                        </span>
                    </motion.div>

                    {/* Kinetic hero headline */}
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
                                style={{
                                    textShadow: "0 0 40px var(--dyn-glow-color)",
                                }}
                            >
                                with Precision.
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
                        Paste your document, essay, or article and our multi-scale engine pinpoints exactly where AI was used — down to the sentence.
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
                                document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="btn-shimmer hover:scale-[1.06] hover:-translate-y-1 active:scale-95 transition-transform duration-300 relative font-bold text-base py-4 px-10 rounded-full text-white overflow-hidden"
                            style={{
                                background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple), var(--dyn-accent-pink))",
                                backgroundSize: "200% 200%",
                                animation: "border-flow 5s ease infinite",
                                boxShadow: "0 6px 30px var(--dyn-glow-color), inset 0 1px 0 rgba(255,255,255,0.2)",
                            }}
                        >
                            Try It Free →
                        </button>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="hover:scale-[1.04] hover:-translate-y-0.5 active:scale-95 transition-transform duration-300 font-bold text-base py-4 px-10 rounded-full border-2 backdrop-blur-sm"
                            style={{
                                borderColor: "var(--dyn-silver-dark)",
                                color: "var(--dyn-text-navy)",
                                background: "var(--dyn-glass-bg)",
                            }}
                        >
                            See How It Works
                        </button>
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
                                document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth' });
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
                SCANNER / RESULTS
            ══════════════════════════════════════════════ */}
            <section
                id="scanner"
                className="relative z-10 max-w-4xl mx-auto px-6 pb-28"
                style={{ paddingTop: "4rem" }}
            >
                <AnimatePresence mode="wait">
                    {!results && !isActive && !coldStart && (
                        <motion.div
                            key="uploader"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.28 }}
                            className="liquid-card overflow-hidden"
                        >
                            <div
                                className="rounded-[22px]"
                                style={{ background: "var(--dyn-glass-bg)", backdropFilter: "blur(24px)" }}
                            >
                                <FileUploader onAnalyze={handleAnalyze} disabled={isActive} deviceHash={deviceHash} initialText={lastText} isLoggedIn={isLoggedIn} />
                            </div>
                        </motion.div>
                    )}



                    {coldStart && (
                        <motion.div key="coldstart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ColdStartOverlay onRetry={handleRetry} />
                        </motion.div>
                    )}

                    {results && (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0, y: 40, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 180, damping: 22 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-4">
                                <div>
                                    <p
                                        className="text-xs font-bold uppercase tracking-[0.18em]"
                                        style={{ color: "var(--dyn-accent-blue)" }}
                                    >
                                        Scan Complete
                                    </p>
                                    <h2 className="text-2xl font-black tracking-tight mt-1" style={{ color: "var(--dyn-text-navy)" }}>
                                        Results Analysis
                                    </h2>
                                </div>

                                <div className="flex gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.03, y: -2 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={async () => {
                                            const controller = new AbortController();
                                            openProcess("download", "Generating PDF", "Compiling styles & layout...", () => controller.abort());
                                            simulateProgress([
                                                { progress: 30, duration: 300, step: "Extracting Document Hierarchy..." },
                                                { progress: 70, duration: 400, step: "Applying Analytics Markup..." }
                                            ]);
                                            try {
                                                const { downloadReport } = await import("@/lib/download-report");
                                                await downloadReport({
                                                    // Prefer the cached high-fidelity report by id once the scan
                                                    // is persisted; inline fields are the fallback if the user
                                                    // downloads before the save/prewarm completes.
                                                    scanId: lastScanId || undefined,
                                                    file: scannedFile,
                                                    filename: scannedFile ? scannedFile.name : 'Text_Scan',
                                                    breakdown,
                                                    overallLabel,
                                                    chunks: results,
                                                    sentenceCount: results.length,
                                                    wordCount: results.reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0),
                                                    sourceHtml,
                                                    signal: controller.signal
                                                });
                                            } finally {
                                                closeProcess();
                                            }
                                        }}
                                        className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm text-white shadow-lg transition-all"
                                        style={{
                                            background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                                        }}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Download PDF Report
                                    </motion.button>

                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={resetResults}
                                        className="px-6 py-2.5 rounded-full font-bold text-sm bg-silver/30 hover:bg-silver/50 transition-colors"
                                        style={{ color: "var(--dyn-text-navy)" }}
                                    >
                                        New Scan
                                    </motion.button>

                                    {userRole === 'ADMIN' && (
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => setDevMode(!devMode)}
                                            className={`px-4 py-2.5 rounded-full font-bold text-xs shadow-md transition-colors ${devMode ? 'bg-accent-purple text-white shadow-accent-purple/30' : 'bg-silver/20 text-navy hover:bg-silver/40'}`}
                                            title="Toggle developer analytics overlay"
                                        >
                                            🛠 Dev
                                        </motion.button>
                                    )}
                                </div>
                            </div>

                            <ScoreGauge breakdown={breakdown} overallLabel={overallLabel} sentenceCount={results.length} wordCount={results.reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0)} />
                            <HeatmapViewer chunks={results} devMode={devMode} />

                            {!isLoggedIn && <SignUpNudge variant="guest" />}
                            {isLoggedIn && userRole === "FREE" && <SignUpNudge variant="free" />}
                        </motion.div>
                    )}
                </AnimatePresence>

                <QuotaBar deviceHash={deviceHash} refreshKey={quotaRefreshKey} session={session} />
            </section>

            {/* ══════════════════════════════════════════════
                HOW IT WORKS — 3D Tilt Cards
            ══════════════════════════════════════════════ */}
            <section id="how-it-works" className="py-28 relative" style={{ background: "var(--dyn-bg-surface)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="max-w-6xl mx-auto px-6"
                >
                    <div className="text-center mb-20">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                            How It Works
                        </p>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                            Three Simple Steps
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { step: "01", title: "Paste or Upload", desc: "Enter your text directly or drop in a PDF, DOCX, or TXT file. It takes seconds." },
                            { step: "02", title: "AI-Powered Analysis", desc: "Our proprietary engine scans your content through hundreds of detection layers to build a comprehensive confidence profile." },
                            { step: "03", title: "See the Results", desc: "Get an overall AI probability score and a sentence-level heatmap pinpointing exactly which parts were AI-generated." },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15 }}
                            >
                                <TiltCard className="glass-card rounded-2xl p-8 h-full relative group">
                                    {/* Connector line */}
                                    {i < 2 && (
                                        <div
                                            className="hidden md:block absolute top-1/2 -right-4 w-8 h-px"
                                            style={{
                                                background: "linear-gradient(90deg, var(--dyn-silver-dark), transparent)",
                                            }}
                                        />
                                    )}
                                    {/* Outline step number that fills on hover */}
                                    <span
                                        className="block text-6xl md:text-7xl font-black font-mono mb-6 transition-all duration-500 bg-clip-text text-transparent"
                                        style={{
                                            backgroundImage: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                                            opacity: "0.85"
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundImage = "linear-gradient(135deg, var(--dyn-accent-purple), var(--dyn-accent-pink))";
                                            e.currentTarget.style.opacity = "1";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundImage = "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))";
                                            e.currentTarget.style.opacity = "0.85";
                                        }}
                                    >
                                        {item.step}
                                    </span>
                                    <h3 className="text-lg font-bold mb-2 group-hover:text-[var(--dyn-accent-blue)] transition-colors" style={{ color: "var(--dyn-text-navy)" }}>
                                        {item.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed" style={{ color: "var(--dyn-ash)" }}>
                                        {item.desc}
                                    </p>
                                </TiltCard>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                CAPABILITIES — Bento Grid
            ══════════════════════════════════════════════ */}
            <section id="capabilities" className="py-28" style={{ background: "var(--dyn-bg-white)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="max-w-6xl mx-auto px-6"
                >
                    <div className="text-center mb-20">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                            Why Jotril
                        </p>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                            The Detection Engine You Can Trust
                        </h2>
                        <p className="mt-4 max-w-xl mx-auto text-base" style={{ color: "var(--dyn-ash)" }}>
                            Purpose-built to deliver accurate, actionable results — every time.
                        </p>
                    </div>

                    {/* Bento grid: first card is large (2-col, 2-row), rest are normal */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-auto gap-5">
                        {capabilities.map((cap, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.07 }}
                                className={cap.large ? "sm:col-span-2 lg:col-span-2" : ""}
                            >
                                <BentoCard {...cap} />
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                TECHNOLOGY — Cinematic Dark Band
            ══════════════════════════════════════════════ */}
            <section className="relative py-28 overflow-hidden" style={{ background: "var(--dyn-bg-surface)" }}>
                {/* Conic gradient rotating background */}
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        background: `conic-gradient(from 0deg at 50% 50%, var(--dyn-accent-blue) 0%, var(--dyn-accent-purple) 33%, var(--dyn-accent-pink) 66%, var(--dyn-accent-blue) 100%)`,
                        filter: "blur(80px)",
                        animation: "spin-slow 18s linear infinite",
                        transformOrigin: "center",
                    }}
                />
                {/* Deep overlay */}
                <div className="absolute inset-0" style={{ background: "var(--dyn-bg-surface)", opacity: 0.7 }} />

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="relative z-10 max-w-5xl mx-auto px-6 text-center"
                >
                    <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                        Our Engine
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6" style={{ color: "var(--dyn-text-navy)" }}>
                        Built Different
                    </h2>
                    <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-16" style={{ color: "var(--dyn-ash)" }}>
                        Most AI detectors give you a single score and hope for the best. Jotril uses a proprietary detection engine trained to catch what others miss — even in documents where only a few sentences were written by AI.
                    </p>

                    {/* Animated stat counters */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-20">
                        {[
                            { value: 99, suffix: "%", label: "Precision", sub: "On benchmark datasets" },
                            { value: 5, suffix: "s", label: "Avg. Scan Time", sub: "For standard documents" },
                            { value: 2, suffix: "x", label: "Model Version", sub: "Continuously updated" },
                        ].map((stat, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15 }}
                                className="glass-card rounded-2xl p-8 hover-lift"
                            >
                                <p className="text-5xl font-black font-mono tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                                    <CountUp to={stat.value} suffix={stat.suffix} />
                                </p>
                                <p className="font-bold mt-4" style={{ color: "var(--dyn-accent-blue)" }}>{stat.label}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--dyn-ash)" }}>{stat.sub}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Horizontal marquee ticker */}
                    <div
                        className="relative overflow-hidden py-4 rounded-xl border"
                        style={{
                            borderColor: "var(--dyn-glass-border)",
                            background: "var(--dyn-glass-bg)",
                        }}
                    >
                        <div className="marquee-track whitespace-nowrap pointer-events-none select-none">
                            {["ChatGPT", "Claude", "Gemini", "Llama", "Mistral", "GPT-4o", "Copilot", "Perplexity", "ChatGPT", "Claude", "Gemini", "Llama", "Mistral", "GPT-4o", "Copilot", "Perplexity"].map((name, i) => (
                                <span
                                    key={i}
                                    className="inline-block mx-8 text-sm font-bold uppercase tracking-widest"
                                    style={{ color: "var(--dyn-ash)" }}
                                >
                                    {name}
                                    <span className="mx-8 opacity-30" style={{ color: "var(--dyn-accent-blue)" }}>✦</span>
                                </span>
                            ))}
                        </div>
                        {/* Gradient fade edges */}
                        <div
                            className="absolute inset-y-0 left-0 w-16 pointer-events-none"
                            style={{ background: `linear-gradient(90deg, var(--dyn-glass-bg), transparent)` }}
                        />
                        <div
                            className="absolute inset-y-0 right-0 w-16 pointer-events-none"
                            style={{ background: `linear-gradient(-90deg, var(--dyn-glass-bg), transparent)` }}
                        />
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                PRICING — Premium Cards
            ══════════════════════════════════════════════ */}
            <section id="pricing" className="py-28" style={{ background: "var(--dyn-bg-white)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="max-w-5xl mx-auto px-6"
                >
                    <div className="text-center mb-20">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                            Pricing
                        </p>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                            Simple, Transparent Pricing
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                        {/* Free Tier */}
                        <motion.div
                            initial={{ opacity: 0, x: -24 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="glass-card rounded-2xl p-8 hover-lift relative overflow-hidden noise-overlay"
                        >
                            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--dyn-ash)" }}>Free</p>
                            <p className="text-5xl font-black mt-3" style={{ color: "var(--dyn-text-navy)" }}>$0</p>
                            <p className="text-sm mt-2" style={{ color: "var(--dyn-ash)" }}>Perfect for trying out Jotril</p>
                            <div className="my-6 h-px" style={{ background: "var(--dyn-silver)" }} />
                            <ul className="space-y-3">
                                {["5 text scans per day", "400 points daily budget", "Sentence-level heatmap", "PDF & DOCX support"].map((f, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm" style={{ color: "var(--dyn-text-navy)" }}>
                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#10B981">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <a
                                href="/auth/signup"
                                className="mt-8 block text-center font-bold text-sm py-3.5 rounded-full transition-transform duration-300 relative z-10 hover:scale-[1.03] active:scale-97"
                                style={{
                                    background: "var(--dyn-silver)",
                                    color: "var(--dyn-text-navy)",
                                }}
                            >
                                Get Started Free
                            </a>
                        </motion.div>

                        {/* Pro Tier — liquid morphing border */}
                        <motion.div
                            initial={{ opacity: 0, x: 24 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="liquid-card"
                        >
                            <div
                                className="rounded-[22px] p-8 relative overflow-hidden h-full noise-overlay"
                                style={{ background: "var(--dyn-bg-elevated)" }}
                            >
                                {/* Coming soon badge */}
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-1.5 rounded-full text-white text-[10px] font-black tracking-widest uppercase btn-shimmer"
                                    style={{
                                        background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple), var(--dyn-accent-pink))",
                                        boxShadow: "0 4px 20px var(--dyn-glow-color)",
                                    }}
                                >
                                    <span className="glitch-text" data-text="COMING SOON">COMING SOON</span>
                                </motion.div>

                                <p className="text-xs font-bold uppercase tracking-[0.18em] mt-3" style={{ color: "var(--dyn-accent-blue)" }}>Pro</p>
                                <p className="text-5xl font-black mt-3 transition-opacity duration-500" style={{ color: "var(--dyn-text-navy)" }}>
                                    {premiumPricing.currency}{premiumPricing.price}<span className="text-xl font-medium" style={{ color: "var(--dyn-ash)" }}>/mo</span>
                                </p>
                                {premiumPricing.label && (
                                    <p className="text-[10px] font-bold mt-1.5 uppercase tracking-widest" style={{ color: "var(--dyn-ash)" }}>
                                        {premiumPricing.label}
                                    </p>
                                )}
                                <p className="text-sm mt-2" style={{ color: "var(--dyn-ash)" }}>For professionals and teams</p>
                                <div className="my-6 h-px" style={{ background: "var(--dyn-silver)" }} />
                                <ul className="space-y-3">
                                    {["30 text scans per day", "2,500 points daily budget", "Developer API access", "Up to 20MB uploads", "Priority engine access", "Priority support"].map((f, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm" style={{ color: "var(--dyn-text-navy)" }}>
                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--dyn-accent-blue)">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    disabled
                                    className="mt-8 w-full font-bold text-sm py-3.5 rounded-full cursor-not-allowed"
                                    style={{ background: "var(--dyn-silver)", color: "var(--dyn-ash)" }}
                                >
                                    Coming Soon
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                FAQ — Scanline Accordion
            ══════════════════════════════════════════════ */}
            <section id="faq" className="py-28" style={{ background: "var(--dyn-bg-surface)" }}>
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={sectionVariants}
                    className="max-w-3xl mx-auto px-6"
                >
                    <div className="text-center mb-20">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] mb-3" style={{ color: "var(--dyn-accent-blue)" }}>
                            FAQ
                        </p>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: "var(--dyn-text-navy)" }}>
                            Frequently Asked
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.06 }}
                                className="glass-card rounded-xl overflow-hidden"
                                style={{
                                    borderColor: openFaq === i ? "var(--dyn-accent-blue)" : undefined,
                                    transition: "border-color 0.3s ease",
                                }}
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full flex items-center justify-between px-6 py-5 text-left group"
                                >
                                    <span
                                        className="text-sm font-semibold pr-4 transition-colors"
                                        style={{ color: openFaq === i ? "var(--dyn-accent-blue)" : "var(--dyn-text-navy)" }}
                                    >
                                        {faq.q}
                                    </span>
                                    {/* Morphing +/X icon */}
                                    <span
                                        className="flex-shrink-0 w-6 h-6 relative flex items-center justify-center"
                                        style={{ color: "var(--dyn-ash)" }}
                                    >
                                        <span
                                            className="absolute w-3 h-0.5 rounded-full transition-all duration-300"
                                            style={{
                                                background: "var(--dyn-accent-blue)",
                                                opacity: openFaq === i ? 1 : 0.6,
                                            }}
                                        />
                                        <span
                                            className="absolute w-0.5 h-3 rounded-full transition-all duration-300"
                                            style={{
                                                background: "var(--dyn-accent-blue)",
                                                transform: openFaq === i ? "rotate(90deg) scaleY(0)" : "rotate(0deg) scaleY(1)",
                                                opacity: openFaq === i ? 0 : 0.6,
                                            }}
                                        />
                                    </span>
                                </button>

                                <AnimatePresence>
                                    {openFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ type: "spring", stiffness: 280, damping: 28 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="scanline-effect px-6 pb-6">
                                                <p className="text-sm leading-relaxed" style={{ color: "var(--dyn-ash)" }}>
                                                    {faq.a}
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════
                FOOTER — Textured Minimal
            ══════════════════════════════════════════════ */}
            <motion.footer
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="relative border-t noise-overlay"
                style={{ borderColor: "var(--dyn-silver)" }}
            >
                <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                    {/* Logo */}
                    <a href="#" className="flex items-center gap-0.5 group">
                        <span
                            className="text-xl font-black transition-colors"
                            style={{ color: "var(--dyn-text-navy)" }}
                        >
                            Jotril
                        </span>
                        <span className="text-xl font-black" style={{ color: "var(--dyn-accent-blue)" }}>AI</span>
                        <span className="text-2xl font-black leading-none" style={{ color: "var(--dyn-accent-blue)" }}>.</span>
                    </a>

                    {/* Nav links */}
                    <div className="flex gap-8">
                        {["How It Works", "Capabilities", "Pricing", "FAQ"].map((label) => (
                            <a
                                key={label}
                                href={`#${label.toLowerCase().replace(/ /g, "-")}`}
                                className="text-sm font-medium relative group transition-colors"
                                style={{ color: "var(--dyn-ash)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--dyn-text-navy)")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dyn-ash)")}
                            >
                                {label}
                                <span
                                    className="absolute -bottom-1 left-0 w-0 h-px rounded-full transition-all duration-300 group-hover:w-full"
                                    style={{ background: "linear-gradient(90deg, var(--dyn-accent-blue), var(--dyn-accent-purple))" }}
                                />
                            </a>
                        ))}
                    </div>

                    {/* Copyright */}
                    <p className="text-xs" style={{ color: "var(--dyn-ash-light)" }}>
                        © {new Date().getFullYear()} Jotril AI. All rights reserved.
                        <span className="ml-1 animate-pulse">_</span>
                    </p>
                </div>
            </motion.footer>
        </main>
    );
}
