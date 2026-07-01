export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { createEmailVerificationToken } from '@/lib/auth-security';
import { sendVerificationEmail } from '@/lib/email';

// Generic response used for every outcome so this endpoint can't be used to probe
// which emails have accounts (no user enumeration).
const GENERIC = {
    success: true,
    message: "If an unverified account exists for that email, we've sent a fresh verification link.",
};

export async function POST(req) {
    try {
        const { email } = await req.json().catch(() => ({}));
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const normalized = email.toLowerCase().trim();
        const prisma = getPrisma();
        const user = await prisma.user.findUnique({ where: { email: normalized } });

        // Only (re)send when there's an account that still needs verifying. In every
        // other case we return the same generic success (don't reveal account state).
        if (user && !user.emailVerified) {
            const token = await createEmailVerificationToken(normalized);

            const host = req.headers.get('host');
            const fallback = `${host?.includes('localhost') ? 'http' : 'https'}://${host}`;
            const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || fallback;

            await sendVerificationEmail(normalized, token, baseUrl).catch((e) =>
                console.warn('[Resend Verification] send failed', e)
            );
        }

        return NextResponse.json(GENERIC);
    } catch (error) {
        console.error('[Resend Verification] Error:', error);
        // Still generic — never leak internal state to the client.
        return NextResponse.json(GENERIC);
    }
}
