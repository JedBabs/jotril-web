"use client";
import { motion } from "framer-motion";

export default function ColdStartOverlay({ onRetry }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 space-y-8"
        >
            {/* Animated engine icon */}
            <div className="relative w-28 h-28">
                <div className="absolute inset-0 rounded-full border-4 border-silver animate-spin" style={{ borderTopColor: "var(--color-accent-blue)" }} />
                <div className="absolute inset-3 rounded-full border-4 border-silver animate-[spin_2s_reverse_infinite]" style={{ borderBottomColor: "var(--color-accent-cyan)" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-accent-blue animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
            </div>

            <div className="text-center space-y-3 max-w-md">
                <h3 className="text-xl font-bold text-navy">
                    Warming Up the Jotril Engine
                </h3>
                <p className="text-ash text-sm leading-relaxed">
                    The analysis model is starting up. This usually takes 30-60 seconds on the first request. 
                    The engine stays warm for subsequent scans.
                </p>
            </div>

            {/* Progress indication */}
            <div className="w-64">
                <div className="h-1.5 bg-silver rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-accent-blue to-accent-cyan rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 30, ease: "linear" }}
                    />
                </div>
                <p className="text-xs text-ash-light mt-2 text-center font-mono">Estimated ~30 seconds</p>
            </div>

            <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onRetry}
                className="bg-accent-blue hover:bg-accent-blue-light text-white font-bold text-sm py-3 px-8 rounded-full transition-colors shadow-[0_2px_12px_rgba(37,99,235,0.25)]"
            >
                Retry Analysis
            </motion.button>
        </motion.div>
    );
}
