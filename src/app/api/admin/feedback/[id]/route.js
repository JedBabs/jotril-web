export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getPrisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'WONTFIX'];

// PATCH — update a feedback item's triage status and/or internal note.
export async function PATCH(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id } = await params;
        const { status, adminNote } = await req.json();

        const data = {};
        if (status !== undefined) {
            if (!STATUSES.includes(status)) {
                return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
            }
            data.status = status;
        }
        if (adminNote !== undefined) {
            data.adminNote = typeof adminNote === 'string' ? adminNote.slice(0, 4000) : null;
        }
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const prisma = getPrisma();
        const updated = await prisma.feedback.update({ where: { id }, data });
        return NextResponse.json({ success: true, status: updated.status, adminNote: updated.adminNote });
    } catch (error) {
        console.error('[Admin Feedback] PATCH error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE — remove a feedback item (spam cleanup).
export async function DELETE(req, { params }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const prisma = getPrisma();
        await prisma.feedback.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Admin Feedback] DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
