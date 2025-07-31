"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePPP } from "@/hooks/usePPP";

/**
 * SignUpNudge — Contextual conversion banner.
 * - Guest variant:   Push to create account
 * - Free-tier variant: Push to upgrade to Pro
 *
 * Props:
 *   variant: "guest" | "free"
 */
export default function SignUpNudge({ variant = "guest" }) {
    const [dismissed, setDismissed] = useState(false);
    const { premiumPricing } = usePPP();

    useEffect(() => {
        const key = `jotril_nudge_${variant}_dismissed`;
        if (sessionStorage.getItem(key)) setDismissed(true);
    }, [variant]);

    const handleDismiss = () => {
        sessionStorage.setItem(`jotril_nudge_${variant}_dismissed`, "1");
        setDismissed(true);
    };

    if (dismissed) return null;

    const isGuest = variant === "guest";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="relative mt-8 glow-border rounded-2xl"
            >
                <div className="glass-card rounded-2xl p-6 sm:p-8">
                    {/* Dismiss button */}
                    <button
                        onClick={handleDismiss}
                        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-silver/30 text-ash hover:text-navy hover:bg-silver/60 transition-all"
                        aria-label="Dismiss"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ${isGuest
                            ? "bg-accent-blue/10"
                            : "bg-gradient-to-br from-accent-blue via-accent-purple to-accent-pink"
                            }`}>
                            {isGuest ? (
                                <svg className="w-7 h-7 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            ) : (
                                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            )}
                        </div>

                        {/* Copy */}
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-black text-navy tracking-tight">
                                {isGuest
                                    ? "Create Your Free Account"
                                    : "Unlock Pro Power"}
                            </h3>
                            <p className="text-sm text-ash mt-1 leading-relaxed">
                                {isGuest
                                    ? "Track your scan history, get 2× the daily points, and access your personal dashboard — completely free."
                                    : `6× daily point budget, developer API access, 20MB uploads, and priority engine access. Starting at ${premiumPricing.currency}${premiumPricing.price}/mo.`}
                            </p>
                        </div>

                        {/* CTA */}
                        <a
                            href={isGuest ? "/auth/signup" : "#pricing"}
                            className={`flex-shrink-0 btn-shimmer font-bold text-sm py-3 px-7 rounded-full transition-all active:scale-95 ${isGuest
                                ? "bg-accent-blue hover:bg-accent-blue-light text-white shadow-[0_4px_20px_rgba(37,99,235,0.3)]"
                                : "bg-gradient-to-r from-accent-blue via-accent-purple to-accent-pink text-white shadow-[0_4px_20px_rgba(124,58,237,0.3)]"
                                }`}
                        >
                            {isGuest ? "Sign Up Free →" : "View Pro Plans →"}
                        </a>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
