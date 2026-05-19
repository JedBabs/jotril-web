import "./globals.css";
import Providers from "@/components/Providers";

// System Font Fallback to ensure build success without external fetch
const geistSans = {
    variable: "--font-geist-sans",
};

const geistMono = {
    variable: "--font-geist-mono",
};

export const metadata = {
    title: "Jotril AI — Detect AI-Generated Text with Precision",
    description: "Advanced AI content detection engine. Paste your document, essay, or article and get sentence-level analysis showing exactly where AI was used. Powered by the Jotril V2 multi-scale detection model.",
    keywords: ["AI detector", "AI content checker", "ChatGPT detector", "AI writing detection", "Jotril"],
    openGraph: {
        title: "Jotril AI — Detect AI-Generated Text",
        description: "Sentence-level AI detection powered by the Jotril V2 engine.",
        type: "website",
    },
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
            </body>
        </html>
    );
}

