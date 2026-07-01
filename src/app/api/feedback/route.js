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
        let { message, category, rating, email, pageUrl, screenshot } = body;

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

        // Accept only a reasonably-sized image data URL (the widget downscales to a small
        // JPEG); anything else is dropped silently rather than failing the submission.
        const screenshotVal =
            (typeof screenshot === 'string' &&
                /^data:image\/(png|jpe?g|webp|gif);base64,/.test(screenshot) &&
                screenshot.length <= 1_500_000)
                ? screenshot
                : null;

        const prisma = getPrisma();
        const data = {
            userId,
            email: resolvedEmail,
            category,
            message,
            rating: ratingVal,
            screenshot: screenshotVal,
            pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : null,
            userAgent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
        };

        try {
            await prisma.feedback.create({ data });
        } catch (e) {
            // Two recoverable cases, retried once with a safe payload:
            //  • P2022 — the `screenshot` column isn't pushed yet → save without it.
            //  • P2003 — a stale 30-day JWT outlived a deleted user row (FK) → detach
            //    userId (it's nullable, onDelete: SetNull) so a guest's note still saves.
            if (e?.code === 'P2022' || e?.code === 'P2003') {
                const fallback = { ...data };
                if (e.code === 'P2022') delete fallback.screenshot;
                if (e.code === 'P2003') fallback.userId = null;
                await prisma.feedback.create({ data: fallback });
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
