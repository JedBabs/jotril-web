import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared shell for /legal/* pages. Server component — static content only.
 * `updated` is a plain date string shown under the title.
 */
export default function LegalLayout({ title, updated, children }) {
    return (
        <main className="min-h-screen" style={{ background: 'var(--dyn-bg-white)' }}>
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm font-medium mb-8 transition-colors hover:text-[var(--dyn-accent-blue)]"
                    style={{ color: 'var(--dyn-ash)' }}
                >
                    <ArrowLeft size={15} /> Back to Jotril AI
                </Link>

                <h1 className="text-4xl font-black tracking-tight mb-2" style={{ color: 'var(--dyn-text-navy)' }}>
                    {title}
                </h1>
                {updated && (
                    <p className="text-sm mb-10" style={{ color: 'var(--dyn-ash)' }}>
                        Last updated: {updated}
                    </p>
                )}

                <div className="legal-prose space-y-6 text-[15px] leading-relaxed" style={{ color: 'var(--dyn-text-navy)' }}>
                    {children}
                </div>
            </div>
        </main>
    );
}

/** Section heading helper for legal copy. */
export function LegalSection({ heading, children }) {
    return (
        <section>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>
                {heading}
            </h2>
            <div className="space-y-3" style={{ color: 'var(--dyn-ash)' }}>
                {children}
            </div>
        </section>
    );
}
