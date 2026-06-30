export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { validateEmailVerificationToken } from '@/lib/auth-security';
import { grantBetaProIfEligible } from '@/lib/beta';
import { sendBetaProEmail } from '@/lib/email';

export async function POST(req) {
    try {
        const { token } = await req.json();

        if (!token) {
            return NextResponse.json({ error: 'Verification token is required' }, { status: 400 });
        }

        const email = await validateEmailVerificationToken(token);

        if (!email) {
            return NextResponse.json({ error: 'Verification link is invalid or has expired' }, { status: 400 });
        }

        const prisma = getPrisma();

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return NextResponse.json({ error: 'User associated with this email no longer exists' }, { status: 400 });
        }

        if (user.emailVerified) {
            return NextResponse.json({ success: true, message: 'Email is already verified' });
        }

        await prisma.user.update({
            where: { email },
            data: { emailVerified: new Date() }
        });

        // The validateEmailVerificationToken already deletes the token upon expiry,
        // but let's proactively delete it here too on success.
        await prisma.emailVerificationToken.deleteMany({
            where: { token }
        });

        // Beta comp: CU students get Pro free for 2 months on confirmation (capped at 50).
        // Best-effort — a failure here must never block a successful verification.
        let beta = { granted: false, reason: 'skipped' };
        try {
            beta = await grantBetaProIfEligible(prisma, user);
            if (beta.granted) {
                const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
                sendBetaProEmail(user.email, baseUrl, beta.expiresAt).catch((e) =>
                    console.warn('[Verify Email API] beta Pro email failed', e)
                );
            }
        } catch (e) {
            console.warn('[Verify Email API] beta grant failed', e);
        }

        return NextResponse.json({
            success: true,
            message: 'Email has been successfully verified',
            betaPro: beta.granted,
            betaReason: beta.reason,
        });

    } catch (error) {
        console.error('[Verify Email API] Error:', error);
        return NextResponse.json({ error: 'Internal server error processing request' }, { status: 500 });
    }
}
