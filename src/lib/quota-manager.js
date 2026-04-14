import getPrisma from '@/lib/prisma';
import { splitIntoSentences } from '@/lib/chunking';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAL-GATE QUOTA ENGINE
 *
 * Every request must pass TWO independent gates:
 *   Gate 1 (Count Ceiling): Per-activity hard cap (e.g. 30 texts/day)
 *   Gate 2 (Points Budget): Shared fuel tank across all activities
 *
 * If either gate blocks, the request is denied.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Tier Definitions ──────────────────────────────────────────────────
export const TIERS = {
    UNAUTHENTICATED: {
        role: 'UNAUTHENTICATED',
        dailyPoints: 250,
        isLifetime: true,        // Points are a one-time allocation, not daily
        text: { ceiling: 3, periodDays: 99999 },
        document: { ceiling: 1, periodDays: 99999 },
        maxUploadBytes: 2 * 1024 * 1024,  // 2MB
    },
    FREE: {
        role: 'FREE',
        dailyPoints: 400,
        isLifetime: false,
        text: { ceiling: 5, periodDays: 1 },
        document: { ceiling: 1, periodDays: 7 },
        maxUploadBytes: 5 * 1024 * 1024,  // 5MB
    },
    PRO: {
        role: 'PRO',
        dailyPoints: 2500,
        isLifetime: false,
        text: { ceiling: 30, periodDays: 1 },
        document: { ceiling: 10, periodDays: 7 },
        maxUploadBytes: 20 * 1024 * 1024, // 20MB
    },
    ULTRA: {
        role: 'ULTRA',
        dailyPoints: 50000,
        isLifetime: false,
        text: { ceiling: Infinity, periodDays: 1 },
        document: { ceiling: Infinity, periodDays: 1 },
        maxUploadBytes: 100 * 1024 * 1024, // 100MB
    },
    ADMIN: {
        role: 'ADMIN',
        dailyPoints: Infinity,
        isLifetime: false,
        text: { ceiling: Infinity, periodDays: 1 },
        document: { ceiling: Infinity, periodDays: 1 },
        maxUploadBytes: 100 * 1024 * 1024, // 100MB
    }
};

// ── Point Cost Formula ────────────────────────────────────────────────
// Based on sentence count (the real HF API cost driver)
// Minimum 10 points per scan. 3 points per sentence after that.
// Smart cap in chunking (200 scenario max) naturally caps cost at 200.

/**
 * Calculates the point cost based on sentence count.
 * @param {number} sentenceCount
 * @returns {number} Point cost
 */
export function calculatePointCost(sentenceCount) {
    return Math.max(10, Math.min(200, sentenceCount * 3));
}

/**
 * Estimates point cost from raw text (for the /api/estimate preview).
 * @param {string} text
 * @returns {{ sentenceCount: number, pointCost: number }}
 */
export function estimateCost(text) {
    const sentences = splitIntoSentences(text);
    const sentenceCount = sentences.length;
    const pointCost = calculatePointCost(sentenceCount);
    return { sentenceCount, pointCost };
}

// ── Cache: Same Text = Free ───────────────────────────────────────────

/**
 * Generates a SHA-256 hash of the input text for cache lookup.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function hashText(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if the same text has been scanned recently (within 24h).
 * Returns the cached QuotaUsage record if found.
 * @param {string} textHashValue - SHA-256 of the text
 * @param {string|null} hash - Device hardware hash
 * @param {string|null} userId
 * @returns {Promise<object|null>} The cached record or null
 */
export async function checkCache(textHashValue, hash, userId) {
    const prisma = getPrisma();
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    return prisma.quotaUsage.findFirst({
        where: {
            textHash: textHashValue,
            createdAt: { gte: oneDayAgo },
            OR: [
                ...(userId ? [{ userId }] : []),
                ...(hash ? [{ hash }] : [])
            ]
        },
        orderBy: { createdAt: 'desc' }
    });
}

// ── Dual-Gate Quota Check ─────────────────────────────────────────────

/**
 * Validates if the user/device is allowed to perform the specified analysis.
 *
 * Gate 1: Count ceiling (per-activity type, per period)
 * Gate 2: Points budget (shared daily pool + purchased fallback)
 *
 * @param {string} role - User role (UNAUTHENTICATED, FREE, PRO, ULTRA, ADMIN)
 * @param {string|null} hash - Device hardware fingerprint hash
 * @param {string|null} userId
 * @param {string} type - 'TEXT' or 'DOCUMENT'
 * @param {number} contentSize - Characters (text) or Bytes (document)
 * @param {number} sentenceCount - Number of sentences in the content
 * @returns {Promise<{allowed: boolean, reason: string|null, pointCost: number}>}
 */
export async function checkQuota(role, hash, userId, type, contentSize, sentenceCount = 0) {
    const tier = TIERS[role || 'UNAUTHENTICATED'];
    if (!tier) return { allowed: false, reason: 'Invalid user tier', pointCost: 0 };

    // ── Size hard cap ─────────────────────────────────────────────
    if (type === 'DOCUMENT' && contentSize > tier.maxUploadBytes) {
        const maxMB = Math.round(tier.maxUploadBytes / 1024 / 1024);
        const actualMB = (contentSize / 1024 / 1024).toFixed(1);
        return {
            allowed: false,
            reason: `Document too large (${actualMB}MB). Your ${tier.role} tier allows up to ${maxMB}MB.`,
            pointCost: 0
        };
    }

    const prisma = getPrisma();
    const pointCost = calculatePointCost(sentenceCount);

    // ── GATE 1: Count Ceiling ─────────────────────────────────────
    const limits = type === 'DOCUMENT' ? tier.document : tier.text;

    if (limits.ceiling !== Infinity) {
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - limits.periodDays);

        const countUsage = await prisma.quotaUsage.count({
            where: {
                type,
                createdAt: { gte: periodStart },
                OR: [
                    ...(userId ? [{ userId }] : []),
                    ...(hash ? [{ hash }] : [])
                ]
            }
        });

        if (countUsage >= limits.ceiling) {
            const periodStr = limits.periodDays === 1 ? 'today' : limits.periodDays === 7 ? 'this week' : '';
            return {
                allowed: false,
                reason: `You've reached your ${limits.ceiling} ${type.toLowerCase()} scan limit ${periodStr}. Upgrade your plan for more.`,
                pointCost
            };
        }
    }

    // ── GATE 2: Points Budget ─────────────────────────────────────
    if (tier.dailyPoints !== Infinity) {
        const pointsPeriodStart = new Date();
        if (tier.isLifetime) {
            pointsPeriodStart.setFullYear(2000); // Count everything ever
        } else {
            pointsPeriodStart.setDate(pointsPeriodStart.getDate() - 1); // Last 24h
        }

        const pointsUsed = await prisma.quotaUsage.aggregate({
            _sum: { pointsCost: true },
            where: {
                createdAt: { gte: pointsPeriodStart },
                OR: [
                    ...(userId ? [{ userId }] : []),
                    ...(hash ? [{ hash }] : [])
                ]
            }
        });

        const totalPointsUsed = pointsUsed._sum.pointsCost || 0;
        const dailyRemaining = tier.dailyPoints - totalPointsUsed;

        if (dailyRemaining < pointCost) {
            // Check purchased points fallback
            let purchasedPoints = 0;
            if (userId) {
                const user = await prisma.user.findUnique({ where: { id: userId }, select: { purchasedPoints: true } });
                purchasedPoints = user?.purchasedPoints || 0;
            }

            const deficit = pointCost - Math.max(0, dailyRemaining);

            if (purchasedPoints >= deficit) {
                // Will use purchased points to cover the deficit — allowed!
                return { allowed: true, reason: null, pointCost, purchasedDeficit: deficit };
            }

            const timeStr = tier.isLifetime ? '' : ' Your points refresh daily.';
            return {
                allowed: false,
                reason: `Not enough points. This scan costs ${pointCost} points but you only have ${Math.max(0, dailyRemaining)} remaining and ${purchasedPoints} purchased points.${timeStr}`,
                pointCost
            };
        }
    }

    return { allowed: true, reason: null, pointCost };
}

// ── Record Usage ──────────────────────────────────────────────────────

/**
 * Records successful usage in the database.
 * If usePurchased is true, deducts from user's purchased points balance.
 */
export async function recordQuotaUsage(hash, userId, type, size, pointCost, sentenceCount, textHashValue, purchasedDeficit = 0) {
    const prisma = getPrisma();

    // The daily points pool only takes the hit for whatever it could afford to pay natively.
    // The deficit is covered exclusively from the user's purchased balance.
    const createPromise = prisma.quotaUsage.create({
        data: {
            hash,
            userId,
            type,
            size,
            pointsCost: pointCost - purchasedDeficit,
            sentenceCount,
            textHash: textHashValue
        }
    });

    if (purchasedDeficit > 0 && userId) {
        await prisma.$transaction([
            createPromise,
            prisma.user.update({
                where: { id: userId },
                data: { purchasedPoints: { decrement: purchasedDeficit } }
            })
        ]);
    } else {
        await createPromise;
    }
}

// ── Quota Status (for UI) ─────────────────────────────────────────────

/**
 * Returns the current quota status for displaying in the UI.
 * Shows points used, remaining, count usage, and reset times.
 */
export async function getQuotaStatus(role, hash, userId) {
    const tier = TIERS[role || 'UNAUTHENTICATED'];
    if (!tier) return null;

    const prisma = getPrisma();
    const now = new Date();

    // Points usage
    const pointsPeriodStart = new Date();
    if (tier.isLifetime) {
        pointsPeriodStart.setFullYear(2000);
    } else {
        pointsPeriodStart.setDate(pointsPeriodStart.getDate() - 1);
    }

    const pointsUsed = await prisma.quotaUsage.aggregate({
        _sum: { pointsCost: true },
        where: {
            createdAt: { gte: pointsPeriodStart },
            OR: [
                ...(userId ? [{ userId }] : []),
                ...(hash ? [{ hash }] : [])
            ]
        }
    });

    const totalPointsUsed = pointsUsed._sum.pointsCost || 0;

    // Text count usage
    const textPeriodStart = new Date();
    textPeriodStart.setDate(textPeriodStart.getDate() - tier.text.periodDays);

    const textUsed = await prisma.quotaUsage.count({
        where: {
            type: 'TEXT',
            createdAt: { gte: textPeriodStart },
            OR: [
                ...(userId ? [{ userId }] : []),
                ...(hash ? [{ hash }] : [])
            ]
        }
    });

    // Document count usage
    const docPeriodStart = new Date();
    docPeriodStart.setDate(docPeriodStart.getDate() - tier.document.periodDays);

    const docUsed = await prisma.quotaUsage.count({
        where: {
            type: 'DOCUMENT',
            createdAt: { gte: docPeriodStart },
            OR: [
                ...(userId ? [{ userId }] : []),
                ...(hash ? [{ hash }] : [])
            ]
        }
    });

    // Purchased points
    let purchasedPoints = 0;
    if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { purchasedPoints: true } });
        purchasedPoints = user?.purchasedPoints || 0;
    }

    // Calculate reset time (next midnight UTC)
    const nextReset = new Date(now);
    nextReset.setUTCHours(24, 0, 0, 0);
    const msUntilReset = nextReset - now;
    const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
    const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));

    return {
        tier: tier.role,
        points: {
            used: totalPointsUsed,
            daily: tier.dailyPoints === Infinity ? null : tier.dailyPoints,
            remaining: tier.dailyPoints === Infinity ? null : Math.max(0, tier.dailyPoints - totalPointsUsed),
            purchased: purchasedPoints,
            resetsIn: tier.isLifetime ? null : `${hoursUntilReset}h ${minutesUntilReset}m`,
        },
        text: {
            used: textUsed,
            ceiling: tier.text.ceiling === Infinity ? null : tier.text.ceiling,
            periodLabel: tier.text.periodDays === 1 ? 'today' : tier.text.periodDays === 7 ? 'this week' : null,
        },
        document: {
            used: docUsed,
            ceiling: tier.document.ceiling === Infinity ? null : tier.document.ceiling,
            periodLabel: tier.document.periodDays === 1 ? 'today' : tier.document.periodDays === 7 ? 'this week' : null,
        },
    };
}

/**
 * SHA-256 hash of hardware fingerprint object.
 */
export async function hashFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return 'unknown-device';
    const str = JSON.stringify(fingerprint);
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
