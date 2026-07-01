/**
 * One-time lifecycle emails: a "welcome" on sign-up and a "you're on Pro" when a user
 * reaches a Pro/Ultra tier. Each is sent EXACTLY ONCE per user, tracked by
 * User.welcomeEmailSentAt / User.proEmailSentAt.
 *
 * Idempotency is race-safe: we atomically "claim" the flag with an updateMany guarded on
 * `field: null` (only one concurrent caller wins), then send. If the send fails we release
 * the flag so it retries next time. Hooked into: /api/auth/verify-email (credentials),
 * the NextAuth jwt callback (every sign-in — cheap no-op once both flags are set), the
 * admin tier-change PATCH, and the admin backfill sweep for existing users.
 *
 * SERVER-ONLY (imports Prisma via the caller + email lib).
 */

import { effectiveRole } from '@/lib/beta';
import { sendWelcomeEmail, sendProEmail } from '@/lib/email';

function defaultBaseUrl() {
    return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
}

/** Atomically set `field` to now iff it's currently null. Returns true if THIS call won. */
async function claim(prisma, userId, field) {
    const res = await prisma.user.updateMany({
        where: { id: userId, [field]: null },
        data: { [field]: new Date() },
    });
    return res.count === 1;
}

/** Undo a claim (so a failed send can be retried on a later hook). */
async function release(prisma, userId, field) {
    await prisma.user.update({ where: { id: userId }, data: { [field]: null } }).catch(() => {});
}

/**
 * Send whichever one-time emails apply to `user` and haven't been sent yet.
 * `user` must carry: id, email, name, role, roleExpiresAt, welcomeEmailSentAt, proEmailSentAt.
 * Best-effort — never throws. Returns { welcome, pro } indicating what was sent this call.
 */
export async function sendLifecycleEmails(prisma, user, url = defaultBaseUrl()) {
    const sent = { welcome: false, pro: false };
    if (!user?.id || !user.email) return sent;

    try {
        // Welcome — once per user.
        if (!user.welcomeEmailSentAt) {
            if (await claim(prisma, user.id, 'welcomeEmailSentAt')) {
                const ok = await sendWelcomeEmail(user.email, user.name, url).catch(() => false);
                if (ok) sent.welcome = true;
                else await release(prisma, user.id, 'welcomeEmailSentAt');
            }
        }

        // Pro — once per user, when they're effectively PRO/ULTRA (respects beta expiry).
        if (!user.proEmailSentAt) {
            const role = effectiveRole(user);
            if (role === 'PRO' || role === 'ULTRA') {
                if (await claim(prisma, user.id, 'proEmailSentAt')) {
                    const ok = await sendProEmail(user.email, url, user.roleExpiresAt).catch(() => false);
                    if (ok) sent.pro = true;
                    else await release(prisma, user.id, 'proEmailSentAt');
                }
            }
        }
    } catch (e) {
        console.warn('[Lifecycle Emails] failed', e?.message);
    }
    return sent;
}
