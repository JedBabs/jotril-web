"use client";
import { useEffect, useState } from "react";

/**
 * Discourages refreshing/closing the tab while a scan is running. Browsers ignore
 * custom beforeunload text, so the clear message is delivered as an in-app banner;
 * beforeunload is only the backstop (generic "Leave site?" dialog) for an actual
 * refresh/close. Subscribes to the global queue — banner shows while jobs are active.
 */
export default function ScanGuard() {
    const [activeCount, setActiveCount] = useState(0);

    useEffect(() => {
        let unsub = () => {};
        let mounted = true;
        // queue-manager is client-only (crypto/fetch) — import lazily.
        import("@/lib/queue-manager").then(({ QueueManager }) => {
            if (!mounted) return;
            unsub = QueueManager.subscribe(({ jobs }) => setActiveCount(jobs?.length || 0));
        });
        return () => { mounted = false; unsub(); };
    }, []);

    useEffect(() => {
        if (activeCount === 0) return;
        const handler = (e) => {
            e.preventDefault();
            e.returnValue = ""; // required to trigger the browser's confirm dialog
            return "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [activeCount]);

    if (activeCount === 0) return null;

    return (
        <div
            role="alert"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl glass-card border border-score-mixed/40 shadow-[0_0_24px_rgba(245,158,11,0.35)]"
        >
            <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-score-mixed opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-score-mixed" />
            </span>
            <span className="text-sm font-medium text-navy">
                Scan in progress — please don’t refresh or close this tab, or your results will be lost.
            </span>
        </div>
    );
}
