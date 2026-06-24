"use client";
import { useEffect, useState } from "react";

/**
 * useOnlineStatus — reactive `navigator.onLine`.
 *
 * SSR-safe: starts as `true` (assume online until proven otherwise) so the
 * server-rendered markup matches the optimistic hydration state. Real status
 * is read on mount and updated via window.online / window.offline events.
 *
 * Note: `navigator.onLine` only reports whether the OS thinks it has a route
 * to *some* network — it can return `true` on a captive portal or a dead
 * link. We treat it as a fast-path signal for "definitely offline"; actual
 * request failures are the source of truth for "definitely degraded".
 */
export function useOnlineStatus() {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const update = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    return online;
}
