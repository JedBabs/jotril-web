export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { sendLifecycleEmails } from '@/lib/lifecycle-emails';

// One-time sweep that sends any *pending* welcome / Pro emails to EXISTING users (people
// who signed up before this feature, or who never got the mail). Idempotent — safe to run
// repeatedly; each user only ever receives each email once (the flags gate it).
const PACE_MS = 900;   // stay well under Resend's ~2 req/sec during the sweep
const BATCH = 50;      // cap per call so we finish inside maxDuration; re-run if `more`.

export async function POST() {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const prisma = getPrisma();
        // Candidates: a usable account (verified credential user OR any OAuth-linked user)
        // that still has at least one lifecycle email pending. Fully-done users are skipped.
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    { OR: [{ emailVerified: { not: null } }, { accounts: { some: {} } }] },
                    { OR: [{ welcomeEmailSentAt: null }, { proEmailSentAt: null }] },
                ],
            },
            select: {
                id: true, email: true, name: true, role: true, roleExpiresAt: true,
                welcomeEmailSentAt: true, proEmailSentAt: true,
            },
            take: BATCH,
        });

        let welcomeSent = 0;
        let proSent = 0;
        for (const u of users) {
            const r = await sendLifecycleEmails(prisma, u);
            if (r.welcome) welcomeSent += 1;
            if (r.pro) proSent += 1;
            await new Promise((res) => setTimeout(res, PACE_MS));
        }

        return NextResponse.json({
            processed: users.length,
            welcomeSent,
            proSent,
            more: users.length === BATCH, // likely more pending — run again
        });
    } catch (error) {
        console.error('[Admin Backfill Emails] error:', error);
        return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
    }
}
