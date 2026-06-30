import LegalLayout, { LegalSection } from '@/components/LegalLayout';

export const metadata = {
    title: 'Terms of Service',
    description: 'Terms of Service for Jotril AI.',
    robots: { index: true, follow: true },
};

export default function TermsPage() {
    return (
        <LegalLayout title="Terms of Service" updated="30 June 2026">
            <p>
                These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Jotril AI (&ldquo;Jotril&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;), an AI-generated-text detection service. By creating an account or using the
                service you agree to these Terms. If you do not agree, do not use the service.
            </p>

            <LegalSection heading="1. Beta service">
                <p>
                    Jotril AI is currently offered as a <strong>private beta</strong>. The service is provided
                    on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis and may be incomplete, change, be interrupted, or
                    be discontinued at any time without notice. Features, limits, and pricing may change before
                    general availability.
                </p>
            </LegalSection>

            <LegalSection heading="2. Eligibility & accounts">
                <p>
                    You must provide a valid email address and keep your credentials secure. You are responsible
                    for all activity under your account. We may suspend or terminate accounts that abuse the
                    service, attempt to circumvent quotas, or violate these Terms.
                </p>
            </LegalSection>

            <LegalSection heading="3. Beta Pro offer (students)">
                <p>
                    Verified Covenant University student emails (<strong>@stu.cu.edu.ng</strong>) may receive a
                    complimentary Pro plan for a limited promotional period (currently two months), with no
                    payment required, subject to availability (limited number of beta places). At the end of the
                    promotional period the account automatically reverts to the Free plan. The offer is
                    non-transferable and may be modified or withdrawn at any time.
                </p>
            </LegalSection>

            <LegalSection heading="4. Nature of detection results — important">
                <p>
                    Jotril produces <strong>probabilistic estimates</strong> of whether text is likely
                    AI-generated. These estimates are <strong>not proof</strong> and can be wrong, including both
                    false positives (human text flagged as AI) and false negatives. Results must <strong>not</strong> be
                    used as the sole basis for any academic-integrity, disciplinary, employment, legal, or other
                    consequential decision about any person. You are solely responsible for how you interpret and
                    act on results, and you should always apply independent human judgement.
                </p>
            </LegalSection>

            <LegalSection heading="5. Acceptable use">
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-1">
                    <li>upload content you do not have the right to submit, or that is unlawful;</li>
                    <li>attempt to reverse-engineer, overload, or disrupt the service or its infrastructure;</li>
                    <li>use the service to harass, defame, or unfairly penalise any individual;</li>
                    <li>resell or commercially redistribute the service without our written permission.</li>
                </ul>
            </LegalSection>

            <LegalSection heading="6. Your content">
                <p>
                    You retain ownership of text and documents you submit. You grant us a limited licence to
                    process them solely to provide and improve the service (for example, generating results,
                    caching, and producing reports). See our{' '}
                    <a href="/legal/privacy" style={{ color: 'var(--dyn-accent-blue)' }}>Privacy Policy</a>{' '}
                    for details.
                </p>
            </LegalSection>

            <LegalSection heading="7. Disclaimers & limitation of liability">
                <p>
                    To the maximum extent permitted by law, Jotril AI is provided without warranties of any kind,
                    express or implied, including accuracy, fitness for a particular purpose, or non-infringement.
                    To the maximum extent permitted by law, we are not liable for any indirect, incidental, or
                    consequential damages, or for any decision made in reliance on detection results.
                </p>
            </LegalSection>

            <LegalSection heading="8. Changes & contact">
                <p>
                    We may update these Terms; material changes will be reflected by the &ldquo;Last updated&rdquo; date.
                    Continued use after changes constitutes acceptance. Questions? Use the in-app{' '}
                    <strong>Feedback</strong> button or email{' '}
                    <a href="mailto:support@jotril.com" style={{ color: 'var(--dyn-accent-blue)' }}>support@jotril.com</a>.
                </p>
            </LegalSection>
        </LegalLayout>
    );
}
