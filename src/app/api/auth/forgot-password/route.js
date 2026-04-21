export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { createPasswordResetToken } from '@/lib/auth-security';

import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const prisma = getPrisma();
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        // Always return success to prevent user enumeration
        if (!user) {
            return NextResponse.json({ success: true, message: 'If an account exists, a reset email has been sent.' });
        }

        // Generate token and link
        const token = await createPasswordResetToken(user.id);

        // Construct the reset URL depending on environment
        const host = req.headers.get('host');
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        await sendPasswordResetEmail(user.email, token, baseUrl);

        return NextResponse.json({
            success: true,
            message: 'If an account exists, a reset email has been sent.'
        });

    } catch (error) {
        console.error('[Forgot Password API] Error:', error);
        return NextResponse.json({ error: 'Internal server error processing request' }, { status: 500 });
    }
}
