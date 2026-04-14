export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { validateResetToken } from '@/lib/auth-security';

export async function POST(req) {
    try {
        const { token, password } = await req.json();

        if (!token || !password) {
            return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
        }

        // Validate the reset token
        const userId = await validateResetToken(token);

        if (!userId) {
            return NextResponse.json({ error: 'Reset token is invalid or has expired' }, { status: 400 });
        }

        const prisma = getPrisma();
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user's password
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        // Delete the consumed token (already done inside validateResetToken upon expiry, but explicitly do on success here)
        await prisma.passwordResetToken.delete({ 
            where: { token } 
        });

        return NextResponse.json({ success: true, message: 'Password has been successfully reset' });

    } catch (error) {
        console.error('[Reset Password API] Error:', error);
        return NextResponse.json({ error: 'Internal server error processing request' }, { status: 500 });
    }
}
