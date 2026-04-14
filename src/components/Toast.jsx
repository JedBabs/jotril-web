"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

let toastId = 0;

const listeners = new Set();
let toasts = [];

function notify() {
    listeners.forEach(fn => fn([...toasts]));
}

export function showToast(message, type = "info", duration = 4000) {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type, duration }];
    notify();

    if (duration > 0) {
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id);
            notify();
        }, duration);
    }

    return id;
}

export function dismissToast(id) {
    toasts = toasts.filter(t => t.id !== id);
    notify();
}

const typeStyles = {
    success: "border-l-score-human bg-score-human/5",
    error: "border-l-score-ai bg-score-ai/5",
    warning: "border-l-score-mixed bg-score-mixed/5",
    info: "border-l-accent-blue bg-accent-blue/5",
};

const typeIcons = {
    success: (
        <svg className="w-5 h-5 text-score-human" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    ),
    error: (
        <svg className="w-5 h-5 text-score-ai" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
    warning: (
        <svg className="w-5 h-5 text-score-mixed" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9.66 16.5H2.34L12 3z" />
        </svg>
    ),
    info: (
        <svg className="w-5 h-5 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
        </svg>
    ),
};

export default function ToastContainer() {
    const [currentToasts, setCurrentToasts] = useState([]);

    useEffect(() => {
        listeners.add(setCurrentToasts);
        return () => listeners.delete(setCurrentToasts);
    }, []);

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm">
            <AnimatePresence>
                {currentToasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 80, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border-l-4 glass-card ${typeStyles[toast.type] || typeStyles.info}`}
                    >
                        <span className="mt-0.5 flex-shrink-0">
                            {typeIcons[toast.type] || typeIcons.info}
                        </span>
                        <p className="text-sm font-medium flex-1 text-navy">{toast.message}</p>
                        <button
                            onClick={() => dismissToast(toast.id)}
                            className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity text-ash"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
