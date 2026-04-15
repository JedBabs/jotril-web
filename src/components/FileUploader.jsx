"use client";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { showToast } from "./Toast";

export default function FileUploader({ onAnalyze, disabled, deviceHash }) {
    const [isDragging, setIsDragging] = useState(false);
    const [text, setText] = useState("");
    const [isParsing, setIsParsing] = useState(false);
    const [costPreview, setCostPreview] = useState(null);
    const debounceRef = useRef(null);

    const MAX_TEXT_LENGTH = 50000;

    // Debounced cost preview
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!text.trim() || text.trim().length < 20) {
            setCostPreview(null);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch('/api/estimate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        hardwareFootprint: deviceHash || {}
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    setCostPreview(data);
                }
            } catch (e) { /* Silent fail on preview */ }
        }, 800);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [text, deviceHash]);

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = async (e) => {
        if (disabled) return;
        if (e.target.files && e.target.files[0]) {
            await processFile(e.target.files[0]);
        }
    };

    const processFile = async (file) => {
        if (file.size > 20 * 1024 * 1024) {
            return showToast("File too large. Maximum file size for your tier may be lower.", "error");
        }

        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (!allowedTypes.includes(file.type)) {
            if (!file.name.toLowerCase().endsWith('.txt') &&
                !file.name.toLowerCase().endsWith('.pdf') &&
                !file.name.toLowerCase().endsWith('.docx')) {
                return showToast("Only .txt, .pdf, and .docx files are supported.", "error");
            }
        }

        onAnalyze(null, file);
    };

    const handleAnalyze = () => {
        if (!text.trim()) {
            return showToast("Please enter text or upload a file first.", "warning");
        }
        setCostPreview(null);
        onAnalyze(text, null);
    };

    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    return (
        <div id="scanner" className="w-full relative group/scanner">
            {/* Outer Container Glow */}
            <div className="absolute -inset-1.5 bg-gradient-to-r from-accent-blue/30 via-accent-purple/30 to-accent-pink/30 rounded-[38px] blur-2xl opacity-0 group-hover/scanner:opacity-100 transition-opacity duration-1000 pointer-events-none" />

            <div className="relative bg-[var(--dyn-glass-bg)] backdrop-blur-2xl border border-[var(--dyn-glass-border)] rounded-[32px] p-4 sm:p-6 shadow-[var(--dyn-glass-shadow)] flex flex-col gap-4">

                {/* Top Section: Drop Zone */}
                <motion.div
                    animate={{
                        scale: isDragging ? 1.01 : 1,
                        borderColor: isDragging ? "var(--dyn-accent-blue)" : "transparent"
                    }}
                    className={`relative w-full h-36 border-2 border-dashed rounded-3xl flex items-center justify-center transition-all cursor-pointer overflow-hidden ${isDragging ? "bg-accent-blue/5" : "bg-[var(--dyn-bg-surface)] hover:bg-[var(--dyn-slate-50)]"
                        }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('hiddenFileInput').click()}
                >
                    <input type="file" id="hiddenFileInput" className="hidden" accept=".txt,.pdf,.docx" onChange={handleFileSelect} />

                    {/* Minimalist icon and text */}
                    <div className="flex flex-col items-center gap-2 pointer-events-none z-10 transition-transform group-hover/scanner:-translate-y-1">
                        <div className="p-3 bg-[var(--dyn-bg-white)] rounded-full shadow-sm ring-1 ring-[var(--dyn-silver-dark)] text-[var(--dyn-accent-blue)]">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <h3 className="text-[15px] font-bold text-[var(--dyn-text-navy)]">
                                {isParsing ? "Extracting Text..." : "Upload Document"}
                            </h3>
                            <p className="text-[12px] font-medium text-[var(--dyn-ash)] mt-0.5">
                                {isParsing ? "Processing..." : "PDF, DOCX, TXT"}
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Divider */}
                <div className="flex items-center gap-4 px-4 py-1">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--dyn-silver-dark)] to-transparent opacity-40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--dyn-ash-light)]">OR PASTE TEXT</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--dyn-silver-dark)] to-transparent opacity-40" />
                </div>

                {/* Text Area */}
                <div className="relative group/editor h-[240px]">
                    <textarea
                        className="w-full h-full bg-[var(--dyn-bg-white)] border border-[var(--dyn-silver)] hover:border-[var(--dyn-ash-light)] focus:border-[var(--dyn-accent-blue)] focus:ring-4 focus:ring-[var(--dyn-accent-blue)]/10 rounded-3xl p-6 pt-7 text-[16px] text-[var(--dyn-text-navy)] leading-[1.8] transition-all resize-none font-sans placeholder-[var(--dyn-ash-light)] shadow-[inset_0_4px_24px_rgba(0,0,0,0.02)]"
                        placeholder="Paste your essay, article, or content right here..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck="false"
                    />

                    {/* Word Counter Pill */}
                    <div className="absolute bottom-5 right-5 flex items-center gap-3 text-[11px] text-[var(--dyn-text-muted)] font-mono bg-[var(--dyn-bg-surface)] backdrop-blur-md px-4 py-2 rounded-full border border-[var(--dyn-silver-dark)] shadow-sm pointer-events-none transition-opacity">
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--dyn-accent-blue)] animate-pulse" />
                            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
                        </span>
                        <span className="w-px h-3 bg-[var(--dyn-ash-light)]/40" />
                        <span className={charCount > MAX_TEXT_LENGTH ? "text-score-ai font-bold" : ""}>
                            {charCount.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} chars
                        </span>
                    </div>
                </div>

                {/* Bottom Action Row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 px-2">
                    <div className="text-[13px] font-medium min-h-[24px]">
                        {costPreview && (
                            <motion.span
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={costPreview.cached ? "text-score-human flex items-center gap-1.5" : "text-[var(--dyn-ash)]"}
                            >
                                {costPreview.cached ? (
                                    <>
                                        <svg className="w-4 h-4" key="cached" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Previously scanned — 0 points
                                    </>
                                ) : costPreview.allowed ? (
                                    <span key="points">Uses <span className="font-bold text-[var(--dyn-accent-blue)] bg-[var(--dyn-accent-blue)]/10 px-2 py-0.5 rounded-md">{costPreview.pointCost}</span> points</span>
                                ) : (
                                    <span key="error" className="text-score-ai flex items-center gap-1.5">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        {costPreview.reason}
                                    </span>
                                )}
                            </motion.span>
                        )}
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => { setText(""); setCostPreview(null); }}
                            className="bg-transparent text-[var(--dyn-ash)] font-bold text-[14px] px-6 py-3.5 rounded-full hover:bg-[var(--dyn-silver)] hover:text-[var(--dyn-text-navy)] transition-colors"
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleAnalyze}
                            disabled={disabled || isParsing || !text.trim()}
                            className="flex-1 sm:flex-none btn-shimmer relative bg-gradient-to-r from-[var(--dyn-accent-blue)] to-[var(--dyn-accent-purple)] text-white font-bold text-[15px] px-10 py-3.5 rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.25)] hover:shadow-[0_12px_32px_rgba(37,99,235,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group/btn overflow-hidden"
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {isParsing ? "Analyzing..." : "Analyze Content"}
                                {!isParsing && (
                                    <svg className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                )}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
