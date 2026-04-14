"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themes = [
    {
        id: "light",
        label: "Light",
        icon: (
            <svg viewBox="0 0 18 18" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="9" cy="9" r="3.5" />
                <line x1="9" y1="1" x2="9" y2="3" />
                <line x1="9" y1="15" x2="9" y2="17" />
                <line x1="1" y1="9" x2="3" y2="9" />
                <line x1="15" y1="9" x2="17" y2="9" />
                <line x1="3.2" y1="3.2" x2="4.6" y2="4.6" />
                <line x1="13.4" y1="13.4" x2="14.8" y2="14.8" />
                <line x1="3.2" y1="14.8" x2="4.6" y2="13.4" />
                <line x1="13.4" y1="4.6" x2="14.8" y2="3.2" />
            </svg>
        ),
    },
    {
        id: "dark",
        label: "Dark",
        icon: (
            <svg viewBox="0 0 18 18" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 9.5A6.5 6.5 0 0 1 7 3a6 6 0 1 0 8 6.5z" />
            </svg>
        ),
    },
    {
        id: "colorful",
        label: "Color",
        icon: (
            <svg viewBox="0 0 18 18" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="7" r="2" />
                <circle cx="12" cy="7" r="2" />
                <circle cx="9" cy="12" r="2" />
                <path d="M6 7 Q9 4 12 7" />
                <path d="M6 7 Q7.5 10 9 12" />
                <path d="M12 7 Q10.5 10 9 12" />
            </svg>
        ),
    },
];

export default function ThemeSwitcher() {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => setMounted(true), []);
    if (!mounted) return <div className="w-32 h-9" />;

    const activeIndex = themes.findIndex((t) => t.id === theme) || 0;

    return (
        <div
            className="relative flex items-center gap-0.5 rounded-full p-1 border"
            style={{
                background: "var(--dyn-glass-bg)",
                backdropFilter: "blur(12px)",
                borderColor: "var(--dyn-glass-border)",
                boxShadow: "var(--dyn-glass-shadow)",
            }}
            role="radiogroup"
            aria-label="Theme switcher"
        >
            {/* Sliding active indicator */}
            <span
                aria-hidden="true"
                className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{
                    width: "calc(33.333% - 2px)",
                    left: `calc(${activeIndex * 33.333}% + 4px)`,
                    background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                    boxShadow: "0 0 10px var(--dyn-glow-color)",
                }}
            />

            {themes.map((t) => (
                <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    role="radio"
                    aria-checked={theme === t.id}
                    aria-label={`${t.label} mode`}
                    title={`${t.label} mode`}
                    className="relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold tracking-wide transition-all duration-300"
                    style={{
                        color: theme === t.id ? "#fff" : "var(--dyn-ash)",
                        minWidth: "60px",
                    }}
                >
                    {t.icon}
                    <span className="hidden sm:inline">{t.label}</span>
                </button>
            ))}
        </div>
    );
}
