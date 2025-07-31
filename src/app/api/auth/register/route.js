export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { createEmailVerificationToken } from '@/lib/auth-security';
import { sendVerificationEmail } from '@/lib/email';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export async function POST(req) {
    try {
        const { email, password, name } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Extremely robust email regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Invalid email format provided' }, { status: 400 });
        }

        if (!PASSWORD_REGEX.test(password)) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.' }, { status: 400 });
        }

        const prisma = getPrisma();

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create free user
        const newUser = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                password: hashedPassword,
                name: name || null,
                role: 'FREE'
            }
        });

        // Generate verification token and send email
        const token = await createEmailVerificationToken(newUser.email);

        const host = req.headers.get('host');
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;

        const emailSent = await sendVerificationEmail(newUser.email, token, baseUrl);

        if (!emailSent) {
            console.warn('[Register API] Failed to send verification email');
        }

        return NextResponse.json({
            success: true,
            user: { id: newUser.id, email: newUser.email, role: newUser.role },
            message: "Registration successful. Please check your email to verify your account."
        });

    } catch (error) {
        console.error('[Register API] Error:', error);
        return NextResponse.json({ error: 'Internal server error during registration' }, { status: 500 });
    }
}
