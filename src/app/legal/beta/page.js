import LegalLayout, { LegalSection } from '@/components/LegalLayout';

export const metadata = {
    title: 'Beta Notice',
    description: 'What to expect from the Jotril AI private beta.',
    robots: { index: true, follow: true },
};

export default function BetaNoticePage() {
    return (
        <LegalLayout title="Beta Notice" updated="30 June 2026">
            <p>
                Jotril AI is in <strong>private beta</strong>. Thanks for helping us test it. Here&rsquo;s what that
                means for you.
            </p>

            <LegalSection heading="It's a work in progress">
                <p>
                    Features may change, break, or disappear. There may be downtime, slow scans (our AI models can
                    take a moment to warm up), and rough edges. Please don&rsquo;t rely on Jotril for anything critical
                    yet.
                </p>
            </LegalSection>

            <LegalSection heading="Results are estimates, not verdicts">
                <p>
                    Jotril gives a <strong>probability</strong> that text is AI-generated. It can be wrong in both
                    directions. <strong>Never</strong> use a Jotril result as the sole basis for accusing someone
                    of misconduct or making any high-stakes decision. Always apply your own judgement.
                </p>
            </LegalSection>

            <LegalSection heading="Free Pro for students">
                <p>
                    Verified <strong>@stu.cu.edu.ng</strong> emails get Pro free for two months, no card required,
                    while beta places last. After that your account reverts to Free automatically — you won&rsquo;t be
                    charged.
                </p>
            </LegalSection>

            <LegalSection heading="Please tell us everything">
                <p>
                    The whole point of the beta is your feedback. Hit the <strong>Feedback</strong> button
                    (bottom-right of every page) and tell us what&rsquo;s broken, confusing, or missing — no detail is
                    too small.
                </p>
            </LegalSection>

            <p className="text-sm">
                See also our{' '}
                <a href="/legal/terms" style={{ color: 'var(--dyn-accent-blue)' }}>Terms of Service</a>{' '}
                and{' '}
                <a href="/legal/privacy" style={{ color: 'var(--dyn-accent-blue)' }}>Privacy Policy</a>.
            </p>
        </LegalLayout>
    );
}
