export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { reconcileScan } from '@/lib/budget-governor';

/**
 * Releases the unused portion of a budget reservation when a scan is ABANDONED before
 * /api/attribute runs (user cancelled, attribution failed, etc). /api/analyze reserves
 * the estimated invocations up-front; normally /api/attribute reconciles against the real
 * cost. If the scan never reaches /api/attribute, that reservation would otherwise leak
 * and slowly inflate UsageBudget.used (prematurely throttling analysis depth).
 *
 * Same trust model as /api/attribute's reconcile (both are unauthenticated and adjust the
 * shared monthly counter — not a security boundary; the expensive proxy is gated by the
 * scan token). Values are clamped so a single call can't move the counter by an absurd
 * amount. reconcileScan itself is two-directional and biased safe.
 */
const MAX_DELTA = 100_000; // far above any single scan's real invocation count

function clampNonNeg(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    return Math.min(v, MAX_DELTA);
}

export async function POST(req) {
    try {
        const { monthKey, estimate, actualInvocations } = await req.json().catch(() => ({}));

        if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey) || typeof estimate !== 'number') {
            return NextResponse.json({ error: 'monthKey and estimate are required' }, { status: 400 });
        }

        await reconcileScan({
            monthKey,
            estimate: clampNonNeg(estimate),
            actualInvocations: clampNonNeg(actualInvocations),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Budget Reconcile] Error:', error);
        return NextResponse.json({ error: 'Reconcile failed' }, { status: 500 });
    }
}
