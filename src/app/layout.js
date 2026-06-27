import "./globals.css";
import Providers from "@/components/Providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import GlitchFavicon from "@/components/GlitchFavicon";

// System Font Fallback to ensure build success without external fetch
const geistSans = {
    variable: "--font-geist-sans",
};

const geistMono = {
    variable: "--font-geist-mono",
};

export const metadata = {
    title: "Jotril AI — Multi-Modal AI Detection Platform",
    description: "Enterprise-grade detection for AI-generated text, images, video, and audio. Detect deepfakes, synthetic voices, and AI writing down to the exact sentence or pixel.",
    keywords: ["AI detector", "deepfake detector", "AI content checker", "ChatGPT detector", "AI writing detection", "Jotril AI", "image forensics"],
    openGraph: {
        title: "Jotril AI — Full-Spectrum AI Detection",
        description: "One platform to detect AI-generated content across text, images, video, and audio.",
        type: "website",
    },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
};



export default function RootLayout({ children }) {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body suppressHydrationWarning className="min-h-full flex flex-col">
                <Providers>{children}</Providers>
                <GlitchFavicon />
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}

