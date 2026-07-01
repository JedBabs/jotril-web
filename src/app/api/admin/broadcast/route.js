export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { renderBroadcastHtml, sendBulkEmails } from '@/lib/email';

// Audience → Prisma where clause. User.email is a required column, so every user
// already has one — no `email: { not: null }` filter (Prisma rejects `not: null`
// on a non-nullable field). emailVerified IS nullable, so it can use `not: null`.
const AUDIENCES = {
    all: {},
    verified: { emailVerified: { not: null } },
    beta: { betaTester: true },
    pro: { role: { in: ['PRO', 'ULTRA'] } },
};

const MAX_SUBJECT = 200;
const MAX_HEADING = 200;
const MAX_MESSAGE = 20000;

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') return null;
    return session;
}

// GET — recipient counts per audience, so the composer can preview reach before sending.
export async function GET() {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    try {
        const prisma = getPrisma();
        // Resilient: a failing audience (e.g. a not-yet-pushed column) yields 0 for that
        // one rather than blanking the whole tool.
        const keys = ['all', 'verified', 'beta', 'pro'];
        const settled = await Promise.allSettled(
            keys.map((k) => prisma.user.count({ where: AUDIENCES[k] }))
        );
        const counts = {};
        settled.forEach((r, i) => {
            counts[keys[i]] = r.status === 'fulfilled' ? r.value : 0;
            if (r.status === 'rejected') console.error(`[Admin Broadcast] count ${keys[i]} failed:`, r.reason?.message);
        });
        return NextResponse.json({ counts, adminEmail: session.user.email || null });
    } catch (error) {
        console.error('[Admin Broadcast] GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST — send the broadcast. `test:true` sends a single copy to testEmail (or the admin)
// so the sender can preview deliverability before blasting the whole audience.
export async function POST(req) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    try {
        const body = await req.json().catch(() => ({}));
        let { audience, subject, heading, message, test, testEmail } = body;

        subject = typeof subject === 'string' ? subject.trim() : '';
        heading = typeof heading === 'string' ? heading.trim() : '';
        message = typeof message === 'string' ? message.trim() : '';

        if (!subject || subject.length > MAX_SUBJECT) {
            return NextResponse.json({ error: 'A subject (1–200 chars) is required.' }, { status: 400 });
        }
        if (!message || message.length > MAX_MESSAGE) {
            return NextResponse.json({ error: `A message (1–${MAX_MESSAGE} chars) is required.` }, { status: 400 });
        }
        if (heading.length > MAX_HEADING) {
            return NextResponse.json({ error: 'Heading is too long.' }, { status: 400 });
        }

        const html = renderBroadcastHtml({ heading: heading || subject, message });

        // ── Test send: one copy, no audience query ────────────────────────
        if (test) {
            const to = (typeof testEmail === 'string' && testEmail.trim()) || session.user.email;
            if (!to) {
                return NextResponse.json({ error: 'No test address available.' }, { status: 400 });
            }
            const result = await sendBulkEmails([{ to, subject: `[TEST] ${subject}`, html, text: message }]);
            return NextResponse.json({ test: true, to, ...result });
        }

        // ── Real broadcast ────────────────────────────────────────────────
        if (!AUDIENCES[audience]) {
            return NextResponse.json({ error: 'Invalid audience.' }, { status: 400 });
        }

        const prisma = getPrisma();
        const recipients = await prisma.user.findMany({
            where: AUDIENCES[audience],
            select: { email: true },
        });
        const messages = recipients
            .filter((u) => u.email)
            .map((u) => ({ to: u.email, subject, html, text: message }));

        if (messages.length === 0) {
            return NextResponse.json({ error: 'No recipients match that audience.' }, { status: 400 });
        }

        const result = await sendBulkEmails(messages);
        console.log(`[Admin Broadcast] audience=${audience} sent=${result.sent}/${result.total} by ${session.user.email}`);
        return NextResponse.json({ audience, ...result });
    } catch (error) {
        console.error('[Admin Broadcast] POST error:', error);
        return NextResponse.json({ error: 'Failed to send broadcast.' }, { status: 500 });
    }
}
