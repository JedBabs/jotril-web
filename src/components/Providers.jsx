"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import { ProcessProvider } from "./ProcessContext";
import ScanGuard from "./ScanGuard";

// Dev-only diagnostics overlay. It's heavy for what it is — it statically pulls in
// the queue manager + jotrilService and installs global error/fetch interceptors —
// and it's useless to regular users (it renders null unless session.user.isDev).
// So we BOTH code-split it (keep it out of the global first-load bundle) AND gate it
// behind a dev session, so normal visitors never download it on any route.
const DevDebugOverlay = dynamic(() => import("./DevDebugOverlay"), { ssr: false });

function DevTools() {
    const { data: session } = useSession();
    if (!session?.user?.isDev) return null;
    return <DevDebugOverlay />;
}

export default function Providers({ children }) {
    return (
        <SessionProvider>
            <ProcessProvider>
                <ThemeProvider attribute="data-theme" defaultTheme="light" themes={['light', 'dark', 'colorful']}>
                    {children}
                    <ScanGuard />
                    <DevTools />
                </ThemeProvider>
            </ProcessProvider>
        </SessionProvider>
    );
}
