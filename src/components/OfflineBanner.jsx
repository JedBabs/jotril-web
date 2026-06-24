"use client";
import { useEffect } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OfflineBanner — top-of-viewport notice when the browser reports no network.
 *
 * Two side effects beyond the visual cue:
 *   1. Pauses the global QueueManager so workers stop hammering the proxy
 *      while there's no link — in-flight queries finish (or time out) on
 *      their own; new chunk pickup is suspended.
 *   2. Resumes the queue on reconnect so background scans finish on their
 *      own when the user comes back online.
 *
 * Lives in Providers so every route gets it (landing, dashboard, auth, …).
 */
export default function OfflineBanner() {
    const online = useOnlineStatus();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { QueueManager } = await import("@/lib/queue-manager");
                if (cancelled) return;
                if (online) QueueManager.resume();
                else QueueManager.pause();
            } catch {
                /* queue manager not loaded yet — nothing to pause */
            }
        })();
        return () => { cancelled = true; };
    }, [online]);

    if (online) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white shadow-md"
            style={{
                background: "linear-gradient(90deg, #b45309, #ea580c)",
                fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
            }}
        >
            <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full bg-white animate-pulse"
            />
            You&apos;re offline. We&apos;ll resume automatically when your connection returns.
        </div>
    );
}
