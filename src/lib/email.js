import nodemailer from 'nodemailer';

/**
 * Singleton Nodemailer Transporter
 */
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: parseInt(process.env.EMAIL_SERVER_PORT || '587', 10),
    auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
    },
});

/**
 * Core send email logic
 */
export async function sendEmail({ to, subject, html, text }) {
    if (!process.env.EMAIL_SERVER_HOST || !process.env.EMAIL_SERVER_USER) {
        // Fallback for development if SMTP is not configured
        console.log('\n=============================================');
        console.log(`[MOCK EMAIL SENT TO]: ${to}`);
        console.log(`[SUBJECT]: ${subject}`);
        console.log(`[CONTENT]: ${text || html}`);
        console.log('=============================================\n');
        return true;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"Jotril AI" <noreply@jotril.ai>',
            to,
            subject,
            text,
            html,
        });
        console.log(`[EMAIL COMPLETED] Sent to ${to} (Message ID: ${info.messageId})`);
        return true;
    } catch (error) {
        console.error('[EMAIL ERROR]', error);
        return false;
    }
}

/**
 * Send Verification Email
 */
export async function sendVerificationEmail(email, token, baseUrl) {
    const link = `${baseUrl}/auth/verify-email?token=${token}`;
    const subject = 'Welcome to Jotril - Verify your email';
    const text = `Please verify your Jotril account by clicking the following link: ${link}`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #1e293b;">
            <h2 style="color: #0f172a;">Welcome to Jotril!</h2>
            <p>Thank you for creating an account. Please click the button below to verify your email address:</p>
            <div style="margin: 30px 0;">
                <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email Address</a>
            </div>
            <p style="font-size: 14px; color: #64748b;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 14px; color: #3b82f6; word-break: break-all;">${link}</p>
        </div>
    `;

    return sendEmail({ to: email, subject, html, text });
}

/**
 * Send Password Reset Email
 */
export async function sendPasswordResetEmail(email, token, baseUrl) {
    const link = `${baseUrl}/auth/reset-password?token=${token}`;
    const subject = 'Jotril - Reset your password';
    const text = `You requested a password reset. Click the following link to reset your password: ${link}`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #1e293b;">
            <h2 style="color: #0f172a;">Password Reset Request</h2>
            <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
            <div style="margin: 30px 0;">
                <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
        </div>
    `;

    return sendEmail({ to: email, subject, html, text });
}
