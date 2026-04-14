'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function GlobalError({ error, reset }) {
    useEffect(() => {
        console.error("Error Boundary:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white text-navy p-6 text-center font-sans aurora-bg relative">
            <div className="aurora-accent top-[30%] left-[40%]" />
            <div className="floating-orb w-3 h-3 bg-score-ai/20 top-[20%] left-[15%]" style={{ animationDelay: '0s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-purple/15 bottom-[25%] right-[25%]" style={{ animationDelay: '3s' }} />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="relative z-10 glass-card rounded-2xl p-10 max-w-lg space-y-6"
            >
                {/* Animated error icon */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.15 }}
                    className="w-16 h-16 mx-auto rounded-full bg-score-ai/10 flex items-center justify-center"
                >
                    <motion.svg
                        animate={{ rotate: [0, -5, 5, -5, 0] }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="w-8 h-8 text-score-ai" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9.66 16.5H2.34L12 3z" />
                    </motion.svg>
                </motion.div>

                <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl font-black text-navy"
                >
                    Something Went Wrong
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-ash text-sm leading-relaxed"
                >
                    An unexpected error occurred. This has been logged automatically.
                </motion.p>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="text-xs font-mono text-ash-light bg-surface rounded-lg p-3 max-h-20 overflow-hidden border border-silver"
                >
                    {error.message || "Unknown error"}
                </motion.p>

                <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => reset()}
                    className="btn-shimmer bg-accent-blue hover:bg-accent-blue-light text-white font-bold text-sm py-3 px-8 rounded-full transition-colors shadow-[0_4px_14px_rgba(37,99,235,0.25)]"
                >
                    Try Again
                </motion.button>
            </motion.div>
        </div>
    );
}
