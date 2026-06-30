import nodemailer from 'nodemailer';

/**
 * Email delivery layer.
 *
 * Priority order (first configured wins):
 *   1. Resend HTTP API  (RESEND_API_KEY)  — preferred on Vercel serverless; a plain
 *      HTTPS POST, no long-lived SMTP socket to cold-start or get blocked on egress.
 *   2. SMTP via Nodemailer (EMAIL_SERVER_HOST + EMAIL_SERVER_USER) — works with any
 *      transactional SMTP, including Resend SMTP (host smtp.resend.com, user "resend").
 *   3. Mock (nothing configured) — logs to the server console so dev never blocks.
 *
 * FROM address comes from EMAIL_FROM (e.g. "Jotril AI <noreply@jotril.com>").
 * The sending domain MUST be verified (SPF/DKIM) with the provider or mail to real
 * inboxes (e.g. university Google Workspace) will land in spam or bounce.
 */

const FROM = process.env.EMAIL_FROM || 'Jotril AI <noreply@jotril.com>';

function hasResend() {
    return !!process.env.RESEND_API_KEY;
}
function hasSmtp() {
    return !!(process.env.EMAIL_SERVER_HOST && process.env.EMAIL_SERVER_USER);
}

// Lazily created so we never open an SMTP connection when Resend/mock is in use.
let _transporter = null;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: parseInt(process.env.EMAIL_SERVER_PORT || '587', 10),
            secure: parseInt(process.env.EMAIL_SERVER_PORT || '587', 10) === 465,
            auth: {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
            },
        });
    }
    return _transporter;
}

/**
 * Core send. Returns true on success, false on failure (never throws — callers
 * treat email as best-effort so a provider hiccup can't 500 a signup).
 */
export async function sendEmail({ to, subject, html, text }) {
    // 1. Resend HTTP API
    if (hasResend()) {
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.error(`[EMAIL ERROR] Resend ${res.status}: ${body}`);
                return false;
            }
            const data = await res.json().catch(() => ({}));
            console.log(`[EMAIL COMPLETED] Resend sent to ${to} (id: ${data?.id || 'n/a'})`);
            return true;
        } catch (error) {
            console.error('[EMAIL ERROR] Resend exception', error);
            return false;
        }
    }

    // 2. SMTP
    if (hasSmtp()) {
        try {
            const info = await getTransporter().sendMail({ from: FROM, to, subject, text, html });
            console.log(`[EMAIL COMPLETED] SMTP sent to ${to} (Message ID: ${info.messageId})`);
            return true;
        } catch (error) {
            console.error('[EMAIL ERROR] SMTP exception', error);
            return false;
        }
    }

    // 3. Mock
    console.log('\n=============================================');
    console.log(`[MOCK EMAIL SENT TO]: ${to}`);
    console.log(`[SUBJECT]: ${subject}`);
    console.log(`[CONTENT]: ${text || html}`);
    console.log('=============================================\n');
    return true;
}

// ── Branded template shell ────────────────────────────────────────────────

const BRAND_NAVY = '#0f172a';
const BRAND_BLUE = '#2563eb';

function layout({ heading, bodyHtml, footerNote }) {
    return `
    <div style="background:#f1f5f9;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:${BRAND_NAVY};padding:22px 32px;">
          <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Jotril<span style="color:#60a5fa;"> AI</span></span>
          <span style="float:right;background:#1e293b;color:#93c5fd;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.5px;">BETA</span>
        </div>
        <div style="padding:32px;color:#1e293b;">
          <h2 style="margin:0 0 16px;color:${BRAND_NAVY};font-size:20px;">${heading}</h2>
          ${bodyHtml}
        </div>
        <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
          ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ''}
          <p style="margin:0;">Jotril AI is in private beta. AI-detection results are probabilistic and may be inaccurate — they should not be the sole basis for any academic or disciplinary decision.</p>
          <p style="margin:8px 0 0;">© ${new Date().getFullYear()} Jotril AI. You received this email because an account was created with this address.</p>
        </div>
      </div>
    </div>`;
}

function button(href, label) {
    return `<div style="margin:28px 0;">
      <a href="${href}" style="background:${BRAND_BLUE};color:#ffffff;padding:13px 26px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">${label}</a>
    </div>
    <p style="font-size:13px;color:#64748b;margin:0;">Or paste this link into your browser:</p>
    <p style="font-size:13px;color:${BRAND_BLUE};word-break:break-all;margin:6px 0 0;">${href}</p>`;
}

// ── Specific emails ───────────────────────────────────────────────────────

export async function sendVerificationEmail(email, token, baseUrl) {
    const link = `${baseUrl}/auth/verify-email?token=${token}`;
    return sendEmail({
        to: email,
        subject: 'Confirm your email to join the Jotril AI beta',
        text: `Welcome to the Jotril AI beta! Confirm your email to activate your account: ${link}`,
        html: layout({
            heading: 'Confirm your email',
            bodyHtml: `
              <p style="line-height:1.6;margin:0 0 4px;">Thanks for joining the Jotril AI private beta. Confirm your email address to activate your account.</p>
              <p style="line-height:1.6;margin:8px 0 0;color:#64748b;font-size:14px;">Covenant University students (<strong>@stu.cu.edu.ng</strong>) get <strong>Pro free for 2 months</strong> automatically once confirmed — no card needed.</p>
              ${button(link, 'Confirm Email Address')}
              <p style="font-size:13px;color:#94a3b8;margin:20px 0 0;">This link expires in 24 hours. If you didn't create a Jotril AI account, you can ignore this email.</p>`,
        }),
    });
}

export async function sendPasswordResetEmail(email, token, baseUrl) {
    const link = `${baseUrl}/auth/reset-password?token=${token}`;
    return sendEmail({
        to: email,
        subject: 'Reset your Jotril AI password',
        text: `Reset your Jotril AI password: ${link}`,
        html: layout({
            heading: 'Reset your password',
            bodyHtml: `
              <p style="line-height:1.6;margin:0;">We received a request to reset your password. If this wasn't you, you can safely ignore this email.</p>
              ${button(link, 'Reset Password')}
              <p style="font-size:13px;color:#94a3b8;margin:20px 0 0;">This link expires in 1 hour.</p>`,
        }),
    });
}

/**
 * Sent when a CU student email is comped Pro on email confirmation.
 * @param {Date} expiresAt - when the 2-month grant lapses.
 */
export async function sendBetaProEmail(email, baseUrl, expiresAt) {
    const expiry = expiresAt
        ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    return sendEmail({
        to: email,
        subject: '🎉 Your Jotril AI Pro beta access is live',
        text: `Your email is confirmed and Jotril AI Pro is now active for 2 months${expiry ? ` (until ${expiry})` : ''}. Start scanning: ${baseUrl}/dashboard`,
        html: layout({
            heading: 'Pro is active — welcome aboard 🎉',
            bodyHtml: `
              <p style="line-height:1.6;margin:0 0 8px;">Your email is confirmed and your <strong>Jotril AI Pro</strong> beta access is now live${expiry ? ` until <strong>${expiry}</strong>` : ' for the next 2 months'} — completely free, no card required.</p>
              <p style="line-height:1.6;margin:0;color:#475569;">Pro gives you higher daily limits, larger document uploads, and the full-depth detection engine.</p>
              ${button(`${baseUrl}/dashboard`, 'Open your dashboard')}
              <p style="font-size:14px;line-height:1.6;color:#475569;margin:20px 0 0;">You're one of our first 50 testers — please tell us what's broken or confusing using the <strong>Feedback</strong> button in the app. Every report helps.</p>`,
            footerNote: 'After the 2-month beta period your account reverts to the Free tier automatically. No charges, ever, unless you choose to upgrade.',
        }),
    });
}
