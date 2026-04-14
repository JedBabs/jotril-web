export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import getPrisma from '@/lib/prisma';
import crypto from 'crypto';

export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prisma = getPrisma();
    const keys = await prisma.apiKey.findMany({
        where: { userId: session.user.id }
    });

    // Mask keys: show prefix + last 4 chars only
    const maskedKeys = keys.map(k => ({
        ...k,
        key: k.key.substring(0, 3) + '****...' + k.key.slice(-4)
    }));

    return NextResponse.json({ keys: maskedKeys });
}

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prisma = getPrisma();

    // Server-side securely generates a random strong Key token
    const rawKey = "jt_" + crypto.randomBytes(16).toString('hex');

    const newKey = await prisma.apiKey.create({
        data: {
            key: rawKey,
            userId: session.user.id,
        }
    });

    return NextResponse.json({ key: newKey });
}

export async function DELETE(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prisma = getPrisma();
    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');

    if (keyId) {
        // Ensure the key belongs to the user
        const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
        if (!key || key.userId !== session.user.id) {
            return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 403 });
        }

        await prisma.apiKey.delete({ where: { id: keyId } });
        return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
}
