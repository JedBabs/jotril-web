"use client";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Premium Smart Process Overlay
 * Dynamically changes design based on the variant: 'analyze', 'upload', 'download'
 */
export default function ProcessOverlay({ isActive, variant, progress, title, stepText }) {
    // ─── Design Configurations based on Variant ───
    const configs = {
        analyze: {
            themeColor: "var(--dyn-accent-purple)",
            bgGradient: "radial-gradient(circle at center, rgba(157,113,247,0.15) 0%, rgba(15,23,42,0.95) 100%)",
            coreClasses: "border-t-[var(--dyn-accent-blue)] border-b-[var(--dyn-accent-pink)]",
            Visual: () => (
                <div className="relative w-48 h-48 flex items-center justify-center">
                    {/* Ring 1 - Outer */}
                    <div className="absolute inset-0 rounded-full border-[2px] border-transparent border-t-accent-blue/80 border-r-accent-blue/20" style={{ animation: "spin 3s linear infinite" }} />
                    {/* Ring 2 - Middle Reverse */}
                    <div className="absolute inset-2 rounded-full border-[2px] border-transparent border-b-accent-pink/80 border-l-accent-purple/40" style={{ animation: "spin 2s linear infinite reverse" }} />
                    {/* Ring 3 - Inner Pulsating Core */}
                    <div className="absolute inset-6 rounded-full border-[3px] border-transparent border-t-accent-purple border-b-accent-blue" style={{ animation: "spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite" }} />

                    {/* Core Glow */}
                    <div className="absolute w-20 h-20 bg-accent-purple/30 rounded-full blur-2xl animate-pulse" />

                    {/* AI Icon */}
                    <svg className="w-8 h-8 text-white relative z-10 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                </div>
            )
        },
        upload: {
            themeColor: "var(--dyn-accent-blue)",
            bgGradient: "radial-gradient(circle at bottom, rgba(37,99,235,0.15) 0%, rgba(15,23,42,0.95) 100%)",
            coreClasses: "border-t-[var(--dyn-accent-blue)] border-b-transparent",
            Visual: () => (
                <div className="relative w-48 h-48 flex items-center justify-center overflow-hidden rounded-full border border-silver/20 bg-navy/50 shadow-[0_0_40px_rgba(37,99,235,0.2)]">
                    {/* Upward flowing data streams */}
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: -100, opacity: [0, 1, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute w-1 h-32 bg-gradient-to-t from-transparent via-accent-blue to-white blur-[1px] left-1/3"
                    />
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: -100, opacity: [0, 1, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.5 }}
                        className="absolute w-1 h-20 bg-gradient-to-t from-transparent via-accent-cyan to-white blur-[1px] right-1/3"
                    />

                    {/* Upload Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/30 backdrop-blur-md relative z-10">
                        <svg className="w-8 h-8 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </div>
                </div>
            )
        },
        download: {
            themeColor: "var(--dyn-score-human)",
            bgGradient: "radial-gradient(circle at top, rgba(16,185,129,0.15) 0%, rgba(15,23,42,0.95) 100%)",
            coreClasses: "border-b-[var(--dyn-score-human)] border-t-transparent",
            Visual: () => (
                <div className="relative w-48 h-48 flex items-center justify-center overflow-hidden rounded-3xl border border-silver/20 bg-navy/50 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                    {/* Downward compiling blocks */}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-score-human/20 to-transparent animate-pulse" />

                    {/* Compiling lines */}
                    <div className="absolute inset-0 flex flex-col justify-end p-4 gap-2 opacity-50">
                        <motion.div className="h-1 bg-score-human/60 rounded-full" animate={{ width: ['0%', '100%'] }} transition={{ duration: 1, repeat: Infinity }} />
                        <motion.div className="h-1 bg-score-human/40 rounded-full" animate={{ width: ['0%', '80%'] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} />
                        <motion.div className="h-1 bg-score-human/20 rounded-full" animate={{ width: ['0%', '60%'] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }} />
                    </div>

                    {/* Download Icon */}
                    <div className="w-16 h-16 rounded-full bg-score-human/10 flex items-center justify-center relative z-10 ring-2 ring-score-human/30">
                        <svg className="w-8 h-8 text-score-human" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </div>
                </div>
            )
        }
    };

    const config = configs[variant] || configs.analyze;
    const VisualComponent = config.Visual;

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                    animate={{ opacity: 1, backdropFilter: "blur(24px)" }}
                    exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
                    style={{ background: config.bgGradient }}
                >
                    {/* Floating ambient particles */}
                    <div className="absolute inset-0 pointer-events-none noise-overlay opacity-30" />

                    <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-6">

                        {/* Interactive Visual Centerpiece */}
                        <motion.div
                            initial={{ scale: 0.8, y: 30 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        >
                            <VisualComponent />
                        </motion.div>

                        {/* Title & Percentage Context */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-center mt-12 w-full"
                        >
                            <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
                                {title}
                            </h2>

                            {/* Hex/Tech Sub-Progress Container */}
                            <div className="mt-8 relative w-full h-1.5 bg-navy border border-silver/20 rounded-full overflow-hidden">
                                <motion.div
                                    className="absolute top-0 left-0 bottom-0 rounded-full"
                                    style={{ background: config.themeColor }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: "easeInOut", duration: 0.3 }}
                                />
                                {/* Sparkle on the tip of the progress bar */}
                                <motion.div
                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white blur-[4px] mix-blend-overlay"
                                    initial={{ left: 0 }}
                                    animate={{ left: `calc(${progress}% - 8px)` }}
                                    transition={{ ease: "easeInOut", duration: 0.3 }}
                                />
                            </div>

                            {/* Status Readout */}
                            <div className="mt-4 flex items-center justify-between font-mono text-sm uppercase tracking-widest font-bold">
                                <span className="text-ash truncate max-w-[70%]">
                                    <span className="text-white opacity-40 mr-2">&gt;</span>
                                    {stepText}
                                </span>
                                <span style={{ color: config.themeColor }}>
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
