export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { reconcileScan } from '@/lib/budget-governor';
import { verifyBudgetToken } from '@/lib/scan-token';

/**
 * Releases the unused portion of a budget reservation when a scan is ABANDONED before
 * /api/attribute runs (user cancelled, attribution failed, etc). /api/analyze reserves
 * the estimated invocations up-front; normally /api/attribute reconciles against the real
 * cost. If the scan never reaches /api/attribute, that reservation would otherwise leak
 * and slowly inflate UsageBudget.used (prematurely throttling analysis depth).
 *
 * The reservation basis (estimate/monthKey) is carried in the server-signed budgetToken
 * issued by /api/analyze, so a client can't forge it to move the shared counter. Only
 * actualInvocations is client-supplied, and it's clamped so a single call can't move the
 * counter by an absurd amount. reconcileScan itself is two-directional and biased safe.
 */
const MAX_DELTA = 100_000; // far above any single scan's real invocation count

function clampNonNeg(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    return Math.min(v, MAX_DELTA);
}

export async function POST(req) {
    try {
        const { budgetToken, actualInvocations } = await req.json().catch(() => ({}));

        const budget = await verifyBudgetToken(budgetToken);
        if (!budget || typeof budget.monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(budget.monthKey) || typeof budget.estimate !== 'number') {
            return NextResponse.json({ error: 'A valid budget token is required' }, { status: 400 });
        }

        await reconcileScan({
            monthKey: budget.monthKey,
            estimate: clampNonNeg(budget.estimate),
            actualInvocations: clampNonNeg(actualInvocations),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Budget Reconcile] Error:', error);
        return NextResponse.json({ error: 'Reconcile failed' }, { status: 500 });
    }
}
