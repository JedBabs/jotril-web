/**
 * Beta program logic — the private-beta Pro comp for Covenant University students.
 *
 * Flow: anyone can sign up (stays FREE). When a user confirms a @stu.cu.edu.ng email
 * AND fewer than BETA_MAX_TESTERS slots are taken, they're auto-granted Pro for
 * BETA_PRO_MONTHS, tracked via User.role/roleExpiresAt/betaTester.
 *
 * Expiry is enforced cheaply at read time via effectiveRole() — no cron needed.
 */

export const BETA_EMAIL_DOMAIN = 'stu.cu.edu.ng';
export const BETA_MAX_TESTERS = 50;
export const BETA_PRO_MONTHS = 2;

/** True if the address belongs to a Covenant University student. */
export function isBetaEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return email.toLowerCase().trim().endsWith(`@${BETA_EMAIL_DOMAIN}`);
}

/** Date BETA_PRO_MONTHS from `from` (defaults to now). */
export function betaExpiry(from = new Date()) {
    const d = new Date(from);
    d.setMonth(d.getMonth() + BETA_PRO_MONTHS);
    return d;
}

/**
 * The role a user effectively has *right now*, accounting for an expired grant.
 * A time-limited role (roleExpiresAt in the past) reverts to FREE. ADMIN/ULTRA
 * and any role without an expiry are returned as-is.
 *
 * Accepts either a full user object or { role, roleExpiresAt }. Safe with strings.
 */
export function effectiveRole(user) {
    if (!user) return 'UNAUTHENTICATED';
    const role = user.role || 'FREE';
    const exp = user.roleExpiresAt ? new Date(user.roleExpiresAt) : null;
    if (exp && exp.getTime() <= Date.now()) return 'FREE';
    return role;
}

/**
 * Attempt to comp a freshly-verified CU student to Pro for the beta window.
 * Idempotent-ish: a user who is already a betaTester, ADMIN, or ULTRA is left alone.
 * Respects the BETA_MAX_TESTERS cap (counts existing betaTester rows).
 *
 * @returns {Promise<{granted:boolean, reason:string, expiresAt?:Date}>}
 */
export async function grantBetaProIfEligible(prisma, user) {
    if (!user || !isBetaEmail(user.email)) {
        return { granted: false, reason: 'not_cu_email' };
    }
    if (user.betaTester) {
        return { granted: false, reason: 'already_beta', expiresAt: user.roleExpiresAt };
    }
    // Don't downgrade staff/lifetime-higher accounts.
    if (user.role === 'ADMIN' || user.role === 'ULTRA') {
        return { granted: false, reason: 'higher_tier' };
    }

    const taken = await prisma.user.count({ where: { betaTester: true } });
    if (taken >= BETA_MAX_TESTERS) {
        return { granted: false, reason: 'beta_full' };
    }

    const expiresAt = betaExpiry();
    await prisma.user.update({
        where: { id: user.id },
        data: {
            role: 'PRO',
            roleExpiresAt: expiresAt,
            betaTester: true,
            betaGrantedAt: new Date(),
        },
    });
    return { granted: true, reason: 'granted', expiresAt };
}
