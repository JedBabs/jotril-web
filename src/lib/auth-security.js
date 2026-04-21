import getPrisma from '@/lib/prisma';
import crypto from 'crypto';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Checks if an identifier (email or IP) is locked out due to brute force attempts.
 * Returns an object with { allowed: boolean, remainingTries: number, lockedUntil: Date|null }
 */
export async function checkBruteForce(identifier) {
    const prisma = getPrisma();

    // Clean up expired lockouts first
    await prisma.accountLockout.updateMany({
        where: {
            identifier,
            lockedUntil: { lte: new Date() }
        },
        data: {
            failedAttempts: 0,
            lockedUntil: null
        }
    });

    const record = await prisma.accountLockout.findUnique({
        where: { identifier }
    });

    if (!record) {
        return { allowed: true, remainingTries: MAX_FAILED_ATTEMPTS, lockedUntil: null };
    }

    if (record.lockedUntil && record.lockedUntil > new Date()) {
        return { allowed: false, remainingTries: 0, lockedUntil: record.lockedUntil };
    }

    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.failedAttempts);
    return { allowed: remaining > 0, remainingTries: remaining, lockedUntil: null };
}

/**
 * Records a failed login attempt for the identifier.
 * Returns the updated brute force status.
 */
export async function recordFailedLogin(identifier) {
    const prisma = getPrisma();

    const record = await prisma.accountLockout.upsert({
        where: { identifier },
        update: { failedAttempts: { increment: 1 } },
        create: { identifier, failedAttempts: 1 }
    });

    if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await prisma.accountLockout.update({
            where: { identifier },
            data: { lockedUntil }
        });
        return { allowed: false, remainingTries: 0, lockedUntil };
    }

    return {
        allowed: true,
        remainingTries: MAX_FAILED_ATTEMPTS - record.failedAttempts,
        lockedUntil: null
    };
}

/**
 * Clears the brute force tracker upon successful login.
 */
export async function clearBruteForce(identifier) {
    const prisma = getPrisma();
    await prisma.accountLockout.deleteMany({
        where: { identifier }
    });
}

/**
 * Generates a secure, expiring reset token for the given user ID.
 */
export async function createPasswordResetToken(userId) {
    const prisma = getPrisma();

    // Clear old tokens for this user first
    await prisma.passwordResetToken.deleteMany({
        where: { userId }
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    await prisma.passwordResetToken.create({
        data: {
            token,
            userId,
            expiresAt
        }
    });

    return token;
}

/**
 * Validates a reset token and returns the associated userId if valid.
 */
export async function validateResetToken(token) {
    if (!token) return null;

    const prisma = getPrisma();
    const record = await prisma.passwordResetToken.findUnique({
        where: { token }
    });

    if (!record) return null;

    if (record.expiresAt < new Date()) {
        // Expired, clean it up
        await prisma.passwordResetToken.delete({ where: { id: record.id } });
        return null;
    }

    return record.userId;
}

/**
 * Generates an Email Verification token for the given email identifier.
 */
export async function createEmailVerificationToken(email) {
    const prisma = getPrisma();

    // Clear old tokens for this email
    await prisma.emailVerificationToken.deleteMany({
        where: { identifier: email }
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours validity

    await prisma.emailVerificationToken.create({
        data: {
            token,
            identifier: email,
            expiresAt
        }
    });

    return token;
}

/**
 * Validates an Email Verification token and returns the email if valid.
 */
export async function validateEmailVerificationToken(token) {
    if (!token) return null;

    const prisma = getPrisma();
    const record = await prisma.emailVerificationToken.findUnique({
        where: { token }
    });

    if (!record) return null;

    if (record.expiresAt < new Date()) {
        await prisma.emailVerificationToken.delete({ where: { id: record.id } });
        return null; // Expired
    }

    return record.identifier;
}
