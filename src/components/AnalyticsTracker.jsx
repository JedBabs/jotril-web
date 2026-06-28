"use client";

import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

export default function AnalyticsTracker({ gaId }) {
    const pathname = usePathname();

    if (!gaId) return null;

    // Do not inject tracking scripts on private or sensitive routes
    if (
        pathname?.startsWith("/admin") ||
        pathname?.startsWith("/dashboard") ||
        pathname?.startsWith("/api")
    ) {
        return null;
    }

    return <GoogleAnalytics gaId={gaId} />;
}
