import LegalLayout, { LegalSection } from '@/components/LegalLayout';

export const metadata = {
    title: 'Privacy Policy',
    description: 'How Jotril AI collects, uses, and protects your data.',
    robots: { index: true, follow: true },
};

export default function PrivacyPage() {
    return (
        <LegalLayout title="Privacy Policy" updated="30 June 2026">
            <p>
                This Privacy Policy explains what data Jotril AI (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, why, and your choices.
                We aim to collect only what we need to run the service.
            </p>

            <LegalSection heading="1. Data we collect">
                <ul className="list-disc pl-6 space-y-1">
                    <li><strong>Account data:</strong> your email address, name (if provided), password hash, and plan/role.</li>
                    <li><strong>Content you submit:</strong> text and documents you scan, and the generated results/reports.</li>
                    <li><strong>Usage & device data:</strong> scan counts, a privacy-preserving device fingerprint (used to enforce free-tier limits), IP address (abuse prevention), and browser information.</li>
                    <li><strong>Analytics:</strong> aggregate, privacy-respecting usage analytics (e.g. page views, performance).</li>
                    <li><strong>Feedback:</strong> messages you send via the in-app feedback tool, plus the page and browser context.</li>
                </ul>
            </LegalSection>

            <LegalSection heading="2. How we use it">
                <ul className="list-disc pl-6 space-y-1">
                    <li>To provide detection results, reports, and your scan history.</li>
                    <li>To enforce quotas and prevent abuse.</li>
                    <li>To operate, secure, debug, and improve the service.</li>
                    <li>To send essential account emails (verification, password reset, beta notices).</li>
                </ul>
            </LegalSection>

            <LegalSection heading="3. Processing & sub-processors">
                <p>
                    To run the service we use trusted third-party processors, including: a cloud host (Vercel),
                    a managed database (Supabase/PostgreSQL), AI model hosting (Hugging Face), document
                    conversion (Google Cloud), and an email provider (Resend). These providers process data on
                    our behalf to deliver the service.
                </p>
            </LegalSection>

            <LegalSection heading="4. Retention">
                <p>
                    Account data is kept while your account is active. Scan results are retained so you can access
                    your history; you may request deletion at any time. Cached/intermediate report files are
                    automatically expired. We delete or anonymise data we no longer need.
                </p>
            </LegalSection>

            <LegalSection heading="5. Your rights & choices">
                <p>
                    You may access, correct, or delete your account data, and request a copy or deletion of your
                    submitted content, by emailing us. You can stop using the service and request account closure
                    at any time.
                </p>
            </LegalSection>

            <LegalSection heading="6. Security">
                <p>
                    Passwords are hashed; access to model infrastructure is gated; transport is encrypted (HTTPS).
                    No system is perfectly secure, but we take reasonable measures to protect your data. As a beta
                    service, please avoid submitting highly sensitive personal data.
                </p>
            </LegalSection>

            <LegalSection heading="7. Contact">
                <p>
                    For privacy requests, email{' '}
                    <a href="mailto:privacy@jotril.com" style={{ color: 'var(--dyn-accent-blue)' }}>privacy@jotril.com</a>{' '}
                    or use the in-app Feedback button.
                </p>
            </LegalSection>
        </LegalLayout>
    );
}
