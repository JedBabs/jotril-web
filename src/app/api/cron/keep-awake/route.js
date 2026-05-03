import { NextResponse } from 'next/server';
import { queryJotrilModel } from '@/lib/jotrilService';

export const dynamic = 'force-dynamic';

/**
 * Keep-Awake Cron Route
 * This endpoint should be called every 23 hours to prevent Hugging Face spaces from sleeping.
 * It sends a minimal ping request to all configured spaces.
 */
export async function GET(req) {
    // Only allow authorized calls if a CRON_SECRET is set
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('⏰ [Keep-Awake] Starting space pings...');

        // Use a short, simple text for the ping
        const pingText = "Is the engine active?";

        // We want to ping BOTH spaces, so we'll bypass the random load balancer 
        // by calling them specifically if we had that option, or just relying on multiple hits.
        // However, since queryJotrilModel picks one, we'll try to hit it multiple times 
        // or modify jotrilService to allow specific space targeting.

        // Let's modify jotrilService to export SPACES or allow targeting. 
        // (I already added preferredSpace to queryJotrilModel)

        const SPACES = [
            "JedBabs/Jotril-Space-1",
            "JedBabs/Jotril-Space-2"
        ];

        const results = await Promise.allSettled(
            SPACES.map(space => queryJotrilModel(pingText, space))
        );

        const summary = results.map((res, idx) => ({
            space: SPACES[idx],
            status: res.status,
            error: res.status === 'rejected' ? res.reason.message : null
        }));

        console.log('✅ [Keep-Awake] Pings completed:', summary);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: summary
        });

    } catch (error) {
        console.error('❌ [Keep-Awake] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
