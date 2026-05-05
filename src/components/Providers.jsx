"use client";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { ProcessProvider } from "./ProcessContext";
import DevDebugOverlay from "./DevDebugOverlay";

export default function Providers({ children }) {
    return (
        <SessionProvider>
            <ProcessProvider>
                <ThemeProvider attribute="data-theme" defaultTheme="light" themes={['light', 'dark', 'colorful']}>
                    {children}
                    <DevDebugOverlay />
                </ThemeProvider>
            </ProcessProvider>
        </SessionProvider>
    );
}
