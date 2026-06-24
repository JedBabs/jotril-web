"use client";
import { useEffect } from "react";

/**
 * Mounts once (via Providers) and registers /sw.js after window load.
 *
 * Production-only registration: in dev, Turbopack's HMR + a service worker
 * fight each other (the SW caches stale chunks), so we skip registration
 * when NODE_ENV !== 'production'. If a SW was previously registered in dev
 * we proactively unregister it so the next refresh is clean.
 *
 * The SW itself handles cache-versioning + activation; this component is
 * just the bootstrap.
 */
export default function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        if (process.env.NODE_ENV !== "production") {
            // Clean up any stale SW from a prior prod build during dev.
            navigator.serviceWorker.getRegistrations().then((regs) => {
                regs.forEach((r) => r.unregister().catch(() => {}));
            }).catch(() => {});
            return;
        }

        const register = () => {
            navigator.serviceWorker
                .register("/sw.js", { scope: "/" })
                .catch((err) => console.warn("[SW] registration failed:", err));
        };

        if (document.readyState === "complete") register();
        else window.addEventListener("load", register, { once: true });
    }, []);

    return null;
}
