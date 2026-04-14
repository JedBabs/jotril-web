"use client";
import React from 'react';

export default function GlitchLogo() {
    return (
        <a href="/" className="group relative flex items-center gap-0.5 select-none">
            <span
                className="relative text-[22px] font-black tracking-tight glitch-text"
                data-text="Jotril"
                style={{ color: "var(--dyn-text-navy)", transition: "color 0.2s" }}
            >
                Jotril
            </span>
            <span
                className="text-[22px] font-black tracking-tight"
                style={{ color: "var(--dyn-accent-blue)" }}
            >
                AI
            </span>
            <span
                className="text-[22px] font-black tracking-tight leading-none"
                style={{ color: "var(--dyn-accent-blue)" }}
            >
                .
            </span>
            {/* Glow pulse on hover */}
            <span
                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                style={{
                    background: "radial-gradient(ellipse at 50% 50%, var(--dyn-glow-color) 0%, transparent 70%)",
                    pointerEvents: "none",
                }}
            />
        </a>
    );
}
