export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

const CATEGORIES = ['bug', 'idea', 'complaint', 'praise', 'other'];
const MAX_MESSAGE = 4000;

// POST — submit feedback. Open to everyone (guests included); auth is attached when present.
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        let { message, category, rating, email, pageUrl } = body;

        message = typeof message === 'string' ? message.trim() : '';
        if (!message) {
            return NextResponse.json({ error: 'Please enter a message.' }, { status: 400 });
        }
        if (message.length > MAX_MESSAGE) {
            return NextResponse.json({ error: `Feedback is too long (max ${MAX_MESSAGE} characters).` }, { status: 400 });
        }

        category = CATEGORIES.includes(category) ? category : 'other';

        let ratingVal = null;
        if (rating != null) {
            const r = parseInt(rating, 10);
            if (!Number.isNaN(r) && r >= 1 && r <= 5) ratingVal = r;
        }

        const session = await getServerSession(authOptions).catch(() => null);
        const userId = session?.user?.id || null;
        // Prefer the authenticated email; fall back to a provided one (guests).
        const resolvedEmail =
            session?.user?.email ||
            (typeof email === 'string' && email.trim().slice(0, 200)) ||
            null;

        const prisma = getPrisma();
        const data = {
            userId,
            email: resolvedEmail,
            category,
            message,
            rating: ratingVal,
            pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : null,
            userAgent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
        };

        try {
            await prisma.feedback.create({ data });
        } catch (e) {
            // A stale 30-day JWT can outlive a deleted user row → the userId FK
            // violates (P2003). Don't 500 a guest's feedback: re-save it detached
            // from the missing user (userId is nullable, onDelete: SetNull).
            if (e?.code === 'P2003' && userId) {
                await prisma.feedback.create({ data: { ...data, userId: null } });
            } else {
                throw e;
            }
        }

        return NextResponse.json({ success: true, message: 'Thank you — your feedback was sent.' });
    } catch (error) {
        console.error('[Feedback API] Error:', error);
        return NextResponse.json({ error: 'Could not submit feedback. Please try again.' }, { status: 500 });
    }
}
