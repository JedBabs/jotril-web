export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { getQuotaStatus, hashFingerprint } from '@/lib/quota-manager';

/**
 * GET /api/quota
 * Returns the current quota status for the UI (QuotaBar component).
 */
export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        const role = session?.user?.role || 'UNAUTHENTICATED';
        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);
        const fpString = searchParams.get('fp');

        let hashIdentity = null;
        if (fpString) {
            try {
                hashIdentity = await hashFingerprint(JSON.parse(fpString));
            } catch (e) { }
        } else {
            // Fallback
            hashIdentity = searchParams.get('hash') || null;
        }

        const status = await getQuotaStatus(role, hashIdentity, userId);

        if (!status) {
            return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
        }

        return NextResponse.json(status);
    } catch (error) {
        console.error('[Quota] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch quota' }, { status: 500 });
    }
}
