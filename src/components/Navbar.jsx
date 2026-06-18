"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeSwitcher from "./ThemeSwitcher";
import GlitchLogo from "./GlitchLogo";
import { useSession } from "next-auth/react";
import Link from "next/link";

const navLinks = [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Capabilities", href: "#capabilities" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
];

const tierColors = {
    FREE: { bg: "rgba(37,99,235,0.12)", color: "var(--dyn-accent-blue)", border: "var(--dyn-accent-blue)" },
    PRO: { bg: "rgba(6,182,212,0.12)", color: "#06B6D4", border: "#06B6D4" },
    ULTRA: { bg: "rgba(157,113,247,0.12)", color: "var(--dyn-accent-purple)", border: "var(--dyn-accent-purple)" },
    ADMIN: { bg: "rgba(16,185,129,0.12)", color: "#10B981", border: "#10B981" },
};

function MagneticLink({ href, children, onClick }) {
    const ref = useRef(null);

    const handleMouseMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) * 0.28;
        const dy = (e.clientY - cy) * 0.28;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const handleMouseLeave = () => {
        if (ref.current) ref.current.style.transform = "translate(0,0)";
    };

    return (
        <Link
            ref={ref}
            href={href}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="relative text-sm font-semibold transition-colors group py-1 px-1"
            style={{
                color: "var(--dyn-ash)",
                transitionProperty: "color, transform",
                transitionDuration: "0.2s",
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
            }}
        >
            <span
                className="relative z-10 group-hover:text-[var(--dyn-text-navy)] transition-colors duration-200"
            >
                {children}
            </span>
            {/* Animated underline */}
            <span
                className="absolute bottom-0 left-0 h-[1.5px] rounded-full transition-all duration-300 w-0 group-hover:w-full"
                style={{
                    background: "linear-gradient(90deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                }}
            />
        </Link>
    );
}

function MagneticButton({ href, children, className, style, onClick }) {
    const ref = useRef(null);

    const handleMouseMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) * 0.22;
        const dy = (e.clientY - cy) * 0.22;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
    };

    const handleMouseLeave = () => {
        if (ref.current) ref.current.style.transform = "translate(0,0) scale(1)";
    };

    return (
        <Link
            ref={ref}
            href={href}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`magnetic-btn btn-shimmer ${className}`}
            style={{ transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)", ...style }}
        >
            {children}
        </Link>
    );
}

export default function Navbar({ session, onSignOut }) {
    const { update } = useSession();
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 24);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const isLoggedIn = !!session?.user;
    const userRole = session?.user?.role || "FREE";
    const userEmail = session?.user?.email || "";
    const tc = tierColors[userRole] || tierColors.FREE;

    // Universal session role sync
    useEffect(() => {
        if (isLoggedIn) {
            fetch('/api/dashboard')
                .then(r => r.json())
                .then(data => {
                    if (data.tier && session.user.role !== data.tier) {
                        update({ role: data.tier });
                    }
                })
                .catch(() => { });
        }
    }, [isLoggedIn, update, session]);



    return (
        <motion.nav
            initial={{ y: -28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 noise-overlay ${scrolled
                ? "border-b"
                : "border-b border-transparent"
                }`}
            style={
                scrolled
                    ? {
                        background: "var(--dyn-glass-bg)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        borderColor: "var(--dyn-glass-border)",
                        boxShadow: "0 1px 40px rgba(0,0,0,0.08)",
                    }
                    : {
                        background: "rgba(0,0,0,0)",
                        backdropFilter: "blur(0px)",
                        WebkitBackdropFilter: "blur(0px)",
                        borderColor: "rgba(237, 242, 252, 0)",
                        boxShadow: "0 1px 40px rgba(0,0,0,0)",
                    }
            }
        >
            <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-10 py-3.5">
                <GlitchLogo />

                {/* Desktop Links */}
                <div className="hidden md:flex items-center gap-6">
                    {navLinks.map((link) => (
                        <MagneticLink key={link.href} href={link.href}>
                            {link.label}
                        </MagneticLink>
                    ))}
                </div>

                {/* CTA / Auth */}
                <div className="hidden md:flex items-center gap-3">
                    <ThemeSwitcher />

                    {isLoggedIn ? (
                        <>
                            <span
                                className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border"
                                style={{ background: tc.bg, color: tc.color, borderColor: tc.border }}
                            >
                                {userRole}
                            </span>
                            <span className="text-xs font-medium max-w-[130px] truncate" style={{ color: "var(--dyn-ash)" }}>
                                {userEmail}
                            </span>

                            <MagneticLink href="/dashboard">Dashboard</MagneticLink>

                            {userRole === 'ADMIN' && (
                                <MagneticLink href="/admin">
                                    <span className="flex items-center gap-1.5 text-score-human">
                                        <div className="w-1 h-1 rounded-full bg-score-human animate-pulse" />
                                        Admin Panel
                                    </span>
                                </MagneticLink>
                            )}
                            <button
                                onClick={onSignOut}
                                className="text-sm font-semibold transition-colors duration-200"
                                style={{ color: "var(--dyn-ash)" }}
                                onMouseEnter={(e) => (e.target.style.color = "#EF4444")}
                                onMouseLeave={(e) => (e.target.style.color = "var(--dyn-ash)")}
                            >
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <>
                            <MagneticLink href="/auth/signin">Sign In</MagneticLink>
                            <MagneticButton
                                href="/auth/signup"
                                className="text-white font-bold text-sm py-2.5 px-6 rounded-full"
                                style={{
                                    background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))",
                                    boxShadow: "0 2px 16px var(--dyn-glow-color)",
                                }}
                            >
                                Sign Up Free
                            </MagneticButton>
                        </>
                    )}
                </div>

                {/* Mobile Hamburger */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="md:hidden p-2 rounded-lg transition-colors"
                    style={{ color: "var(--dyn-text-navy)" }}
                    aria-label="Toggle menu"
                >
                    <motion.svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        animate={mobileOpen ? "open" : "closed"}
                    >
                        {mobileOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </motion.svg>
                </button>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="md:hidden overflow-hidden border-t"
                        style={{
                            background: "var(--dyn-glass-bg)",
                            backdropFilter: "blur(24px)",
                            borderColor: "var(--dyn-glass-border)",
                        }}
                    >
                        <div className="px-6 pb-6 space-y-1 pt-3">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className="block py-3 text-sm font-semibold border-b transition-colors"
                                    style={{
                                        color: "var(--dyn-ash)",
                                        borderColor: "var(--dyn-silver)",
                                    }}
                                >
                                    {link.label}
                                </Link>
                            ))}

                            <div className="flex justify-center py-4 border-b" style={{ borderColor: "var(--dyn-silver)" }}>
                                <ThemeSwitcher />
                            </div>

                            {isLoggedIn ? (
                                <div className="pt-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border"
                                            style={{ background: tc.bg, color: tc.color, borderColor: tc.border }}
                                        >
                                            {userRole}
                                        </span>
                                        <span className="text-xs truncate" style={{ color: "var(--dyn-ash)" }}>{userEmail}</span>
                                    </div>
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setMobileOpen(false)}
                                        className="block text-center font-bold text-sm py-3 px-6 rounded-full text-white"
                                        style={{ background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))" }}
                                    >
                                        Dashboard
                                    </Link>

                                    {userRole === 'ADMIN' && (
                                        <Link
                                            href="/admin"
                                            onClick={() => setMobileOpen(false)}
                                            className="block text-center font-bold text-sm py-3 px-6 rounded-2xl bg-navy text-white"
                                        >
                                            Admin Hub
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => { onSignOut?.(); setMobileOpen(false); }}
                                        className="block w-full text-center text-sm font-semibold py-2"
                                        style={{ color: "var(--dyn-ash)" }}
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            ) : (
                                <div className="pt-3 space-y-3">
                                    <Link
                                        href="/auth/signin"
                                        onClick={() => setMobileOpen(false)}
                                        className="block text-center text-sm font-semibold py-2"
                                        style={{ color: "var(--dyn-text-navy)" }}
                                    >
                                        Sign In
                                    </Link>
                                    <Link
                                        href="/auth/signup"
                                        onClick={() => setMobileOpen(false)}
                                        className="block text-center btn-shimmer font-bold text-sm py-3 px-6 rounded-full text-white"
                                        style={{ background: "linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))" }}
                                    >
                                        Sign Up Free
                                    </Link>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}
