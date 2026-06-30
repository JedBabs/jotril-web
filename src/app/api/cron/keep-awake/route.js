import { NextResponse } from 'next/server';
import { pingJotrilModels, SPACES } from '@/lib/jotrilService';

export const dynamic = 'force-dynamic';

/**
 * Keep-Awake Cron Route
 * Called daily (vercel.json) to prevent the Hugging Face Spaces from sleeping after 48h.
 * Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 */
export async function GET(req) {
    const secret = process.env.CRON_SECRET;

    // Fail CLOSED in production: this endpoint triggers HF inference (cost/abuse), so an
    // unprotected one is a liability. If CRON_SECRET isn't configured in prod, refuse to
    // run rather than serve an open endpoint. (Dev with no secret still runs freely.)
    if (process.env.NODE_ENV === 'production' && !secret) {
        console.error('[Keep-Awake] CRON_SECRET is not set — refusing to run an unauthenticated cron in production.');
        return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }
    const authHeader = req.headers.get('authorization');
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('⏰ [Keep-Awake] Warming spaces...');

        // pingJotrilModels fires a submit at each Space's inference endpoint and does NOT
        // poll for the result. Reaching the endpoint with a real job resets the 48h sleep
        // timer; not awaiting the (30-60s cold-start) inference keeps us well under the
        // serverless function timeout. SPACES stays the single source of truth.
        const reached = await pingJotrilModels();

        console.log(`✅ [Keep-Awake] Warmed ${reached ? 'spaces' : 'no spaces'}.`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            spaces: SPACES.length,
            reached,
        });

    } catch (error) {
        console.error('❌ [Keep-Awake] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
