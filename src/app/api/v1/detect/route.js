export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryJotrilModel, JotrilServiceError } from '@/lib/jotrilService';
import getPrisma from '@/lib/prisma';
import { checkQuota, recordQuotaUsage, hashText } from '@/lib/quota-manager';
import { splitIntoSentences } from '@/lib/chunking';

export async function POST(req) {
    try {
        const authHeader = req.headers.get('authorization');

        // Strict requirement for Bearer Token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or Invalid Bearer Token' }, { status: 401 });
        }

        const apiKeyStr = authHeader.split(' ')[1];

        const prisma = getPrisma();
        const keyRecord = await prisma.apiKey.findUnique({
            where: { key: apiKeyStr },
            include: { user: true }
        });

        if (!keyRecord) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 403 });
        }

        const body = await req.json();
        const { text } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Valid string literal "text" payload is required.' }, { status: 400 });
        }

        // Apply Quota checks mirroring the frontend analyze route
        const sentences = splitIntoSentences(text);
        const sentenceCount = sentences.length;
        const textHashValue = await hashText(text);

        const deviceHash = 'API_KEY_' + keyRecord.id; // Unique identifier for API usage

        const quotaCheck = await checkQuota(keyRecord.user.role, deviceHash, keyRecord.userId, 'TEXT', text.length, sentenceCount);
        const pointCost = quotaCheck.pointCost;
        const purchasedDeficit = quotaCheck.purchasedDeficit || 0;

        if (!quotaCheck.allowed) {
            return NextResponse.json({
                error: quotaCheck.reason,
                limitExceeded: true,
                pointCost
            }, { status: 429 });
        }

        // Query the model using the shared service
        const result = await queryJotrilModel(text);

        // Record successful usage
        await recordQuotaUsage(deviceHash, keyRecord.userId, 'TEXT', text.length, pointCost, sentenceCount, textHashValue, purchasedDeficit).catch(err => {
            console.error('[V1 API] Error recording quota:', err);
        });

        return NextResponse.json({
            success: true,
            data: {
                ai_probability: Math.round(result.aiScore * 100),
                human_probability: Math.round(result.humanScore * 100),
                label: result.label,
                confidence: result.confidence,
                text_length: text.length,
                version: "jotril-v2.0"
            }
        });

    } catch (error) {
        console.error('[V1 API] Error:', error);

        if (error instanceof JotrilServiceError) {
            if (error.type === 'COLD_START') {
                return NextResponse.json({ error: 'Upstream model is currently booting. Retry in ~30 seconds.' }, { status: 503 });
            }
            if (error.type === 'AUTH_ERROR') {
                return NextResponse.json({ error: 'Upstream model authentication failed.' }, { status: 502 });
            }
            if (error.type === 'RATE_LIMITED') {
                return NextResponse.json({ error: 'Upstream model rate limit exceeded. Retry later.' }, { status: 429 });
            }
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
