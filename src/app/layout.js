import "./globals.css";
import Providers from "@/components/Providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import GlitchFavicon from "@/components/GlitchFavicon";

// System Font Fallback to ensure build success without external fetch
const geistSans = {
    variable: "--font-geist-sans",
};

const geistMono = {
    variable: "--font-geist-mono",
};

export const metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.jotril.com"),
    title: {
        default: "Jotril AI — Multi-Modal AI Detection Platform",
        template: "%s | Jotril AI",
    },
    description: "Enterprise-grade detection for AI-generated text, images, video, and audio. Detect deepfakes, synthetic voices, and AI writing down to the exact sentence or pixel.",
    keywords: ["AI detector", "deepfake detector", "AI content checker", "ChatGPT detector", "AI writing detection", "Jotril AI", "image forensics", "voice cloning detection"],
    authors: [{ name: "Jotril AI Team" }],
    creator: "Jotril AI",
    publisher: "Jotril AI",
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    openGraph: {
        title: "Jotril AI — Full-Spectrum AI Detection",
        description: "One platform to detect AI-generated content across text, images, video, and audio.",
        url: "/",
        siteName: "Jotril AI",
        locale: "en_US",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Jotril AI — Enterprise Deepfake & AI Detection",
        description: "Enterprise-grade detection for AI-generated text, images, video, and audio.",
        creator: "@JotrilAI",
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
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
                {process.env.NEXT_PUBLIC_GA_ID && <AnalyticsTracker gaId={process.env.NEXT_PUBLIC_GA_ID} />}
            </body>
        </html>
    );
}

