export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { validateEmailVerificationToken } from '@/lib/auth-security';

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

        return NextResponse.json({ success: true, message: 'Email has been successfully verified' });

    } catch (error) {
        console.error('[Verify Email API] Error:', error);
        return NextResponse.json({ error: 'Internal server error processing request' }, { status: 500 });
    }
}
