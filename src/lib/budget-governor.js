/**
 * Budget Governor — paces full-engine live scans against the Vercel monthly
 * Function-Invocation pool (Hobby = 1,000,000/month; exhausting it PAUSES the
 * whole deployment, so this is a safety system, not just cost control).
 *
 * SERVER-ONLY. Imports Prisma + chunking. Never import from a client component.
 *
 * Per scan it decides an analysis DEPTH (full / reduced / minimal — see
 * DEPTH_PROFILES in chunking.js) by blending three things:
 *   1. Tier policy        — FREE→reduced, PRO/BETA→full, ADMIN→uncapped.
 *   2. Predictive pacing  — an EWMA of daily invocations projects month-end usage;
 *                           if we're forecast to overshoot the budget, depth is
 *                           toned down *before* the pool drains (the user's ask).
 *   3. Exact cost-fit     — generate scenarios at the chosen depth, count them,
 *                           and step depth down if the scan won't fit the hard
 *                           remaining budget. No estimate guessing.
 *
 * Reservation model (avoids a DB write per proxy call): /api/analyze reserves the
 * estimate up-front (resolveScan), /api/attribute refunds the unused remainder
 * once the real query count is known (reconcileScan). ~2-3 DB writes per scan.
 */

import getPrisma from '@/lib/prisma';
import { getEngineConfig, generateAnalysisScenarios, DEFAULT_BUDGET_CONFIG } from '@/lib/chunking';

const DEPTH_ORDER = ['minimal', 'reduced', 'full'];

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function stepDownDepth(depth) {
    const i = DEPTH_ORDER.indexOf(depth);
    return i <= 0 ? 'minimal' : DEPTH_ORDER[i - 1];
}

function monthKeyUTC(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonthUTC(date) {
    // Day 0 of next month = last day of this month.
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function daysLeftUTC(date) {
    // Inclusive of today, so a fresh scan on the last day still has 1 day of runway.
    return daysInMonthUTC(date) - date.getUTCDate() + 1;
}

/**
 * Loads (creating if absent) the current month's budget row, and rolls the EWMA
 * forward when the UTC day has changed since the last write — folding the day that
 * just ended into the predictive run-rate. The roll is persisted.
 */
async function loadAndRollBudget(prisma, now, alpha) {
    const monthKey = monthKeyUTC(now);
    const day = now.getUTCDate();

    let row = await prisma.usageBudget.upsert({
        where: { month: monthKey },
        create: { month: monthKey, lastDay: day },
        update: {},
    });

    if (row.lastDay !== day) {
        // lastDay === 0 means the row was just created this scan — seed EWMA from today.
        const ewmaDaily = row.lastDay === 0
            ? row.todayUsed
            : alpha * row.todayUsed + (1 - alpha) * row.ewmaDaily;
        row = await prisma.usageBudget.update({
            where: { month: monthKey },
            data: { ewmaDaily, todayUsed: 0, lastDay: day },
        });
    }

    return row;
}

/** Atomic reservation — increments both the monthly and today counters. */
async function reserve(prisma, monthKey, amount) {
    if (amount <= 0) return;
    await prisma.usageBudget.update({
        where: { month: monthKey },
        data: { used: { increment: amount }, todayUsed: { increment: amount } },
    });
}

/** Atomic refund of unused reservation. */
async function refund(prisma, monthKey, amount) {
    if (amount <= 0) return;
    await prisma.usageBudget.update({
        where: { month: monthKey },
        data: { used: { decrement: amount }, todayUsed: { decrement: amount } },
    });
}

/**
 * Decides the maximum allowed depth from tier policy + predictive throttle,
 * BEFORE per-document cost-fit. Returns the decision plus the hard remaining
 * budget the cost-fit must respect.
 */
function decideDepth({ tier, budgetCfg, row, now }) {
    const monthlyBudget = budgetCfg.monthlyInvocations;

    // ADMIN is never paced — full depth, no enforcement (but usage is still recorded).
    if (tier === 'ADMIN') {
        return {
            depth: 'full', theta: 1, enforce: false,
            detectionBudget: monthlyBudget,
            remaining: Math.max(0, monthlyBudget - row.used),
            daysLeft: daysLeftUTC(now), projected: row.used,
        };
    }

    const detectionBudget = Math.floor(monthlyBudget * (1 - budgetCfg.reservePct));
    const tierMaxDepth = budgetCfg.tierDepth?.[tier] || 'reduced';
    const daysLeft = daysLeftUTC(now);

    // Predictive forecast: use the higher of the historical EWMA and today's running
    // pace so a fresh spike is caught before the day even closes (conservative).
    const runRate = Math.max(row.ewmaDaily, row.todayUsed);
    const projected = row.used + runRate * daysLeft;

    let theta = 1; // throttle factor: 1 = on track, <1 = forecast to overshoot
    if (projected > detectionBudget) {
        const remainingPace = detectionBudget - row.used;
        theta = clamp(remainingPace / Math.max(runRate * daysLeft, 1), 0.15, 1);
    }

    // Map the forecast into depth. theta < 1 means "on the current trajectory we
    // overshoot the budget", so we tone down as soon as that's predicted:
    //   theta >= 0.85 : little/no overshoot — keep tier depth
    //   0.5–0.85      : real overshoot forecast — step down one level ("a little bit")
    //   < 0.5         : severe — drop to minimal
    let depth = tierMaxDepth;
    if (theta < 0.5) depth = 'minimal';
    else if (theta < 0.85) depth = stepDownDepth(depth);

    // Hard floor: if the reserve is already spent, force minimal regardless of tier.
    if (row.used >= detectionBudget) depth = 'minimal';

    return {
        depth, theta, enforce: true, detectionBudget,
        remaining: Math.max(0, detectionBudget - row.used),
        daysLeft, projected,
    };
}

/**
 * Full per-scan resolution: decide depth, generate scenarios, cost-fit, reserve.
 * Call from /api/analyze.
 *
 * @returns {{ depth, estimate, monthKey, scenarios, sentences, callsPerQuery, decision }}
 */
export async function resolveScan({ tier, text, now = new Date() }) {
    const prisma = getPrisma();
    const engineCfg = await getEngineConfig();
    const budgetCfg = { ...DEFAULT_BUDGET_CONFIG, ...(engineCfg.budget || {}) };
    const monthKey = monthKeyUTC(now);

    const row = await loadAndRollBudget(prisma, now, budgetCfg.ewmaAlpha);
    const decision = decideDepth({ tier, budgetCfg, row, now });

    // Generate at the decided depth, then step down until it fits the hard remaining
    // budget (skip enforcement for ADMIN / uncapped).
    let depth = decision.depth;
    let gen = generateAnalysisScenarios(text, depth);
    let estimate = gen.scenarios.length * budgetCfg.callsPerQuery;

    if (decision.enforce) {
        while (estimate > decision.remaining && depth !== 'minimal') {
            depth = stepDownDepth(depth);
            gen = generateAnalysisScenarios(text, depth);
            estimate = gen.scenarios.length * budgetCfg.callsPerQuery;
        }
    }

    await reserve(prisma, monthKey, estimate);

    return {
        depth, estimate, monthKey,
        scenarios: gen.scenarios,
        sentences: gen.sentences,
        callsPerQuery: budgetCfg.callsPerQuery,
        decision: { theta: decision.theta, daysLeft: decision.daysLeft, remaining: decision.remaining },
    };
}

/**
 * Refund the unused portion of a reservation once the real query count is known.
 * Call from /api/attribute. `actualInvocations` = queries actually executed × callsPerQuery.
 */
export async function reconcileScan({ monthKey, estimate, actualInvocations }) {
    const unused = Math.max(0, (estimate || 0) - (actualInvocations || 0));
    if (unused > 0) {
        await refund(getPrisma(), monthKey, unused);
    }
}
