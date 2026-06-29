export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryJotrilModel, JotrilServiceError } from '@/lib/jotrilService';
import getPrisma from '@/lib/prisma';
import { checkQuota, recordQuotaUsage, hashText } from '@/lib/quota-manager';
import { splitIntoSentences } from '@/lib/chunking';

/** SHA-256 of a raw API key. Keys are stored hashed so a DB leak can't reuse them. */
function hashApiKey(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function POST(req) {
    try {
        const authHeader = req.headers.get('authorization');

        // Strict requirement for Bearer Token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or Invalid Bearer Token' }, { status: 401 });
        }

        const apiKeyStr = authHeader.split(' ')[1];

        const prisma = getPrisma();
        // Look up by hash (new keys are stored hashed); fall back to the raw value so any
        // legacy plaintext keys created before hashing still authenticate until rotated.
        const keyRecord = await prisma.apiKey.findFirst({
            where: { OR: [{ key: hashApiKey(apiKeyStr) }, { key: apiKeyStr }] },
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

        // Query the model using the shared service. queryJotrilModel returns
        // { text, score (0-100 AI), aiProbability (0-1), confidence, rawLabel, sourceSpace }.
        const result = await queryJotrilModel(text);

        // Guard the case where every retry failed to produce a score — don't charge quota
        // for a scan that yielded nothing.
        if (!result || result.score == null) {
            return NextResponse.json({ error: 'Upstream model returned no score. Please retry shortly.' }, { status: 502 });
        }

        const aiProbability = Math.round(result.score);          // already 0-100
        const humanProbability = 100 - aiProbability;
        // Band the probability with the engine's default thresholds (mirrors
        // chunking.classifyResults: human ≤62, mixed 63-75, ai ≥76).
        const label = aiProbability >= 76 ? 'ai' : aiProbability >= 63 ? 'mixed' : 'human';

        // Record successful usage
        await recordQuotaUsage(deviceHash, keyRecord.userId, 'TEXT', text.length, pointCost, sentenceCount, textHashValue, purchasedDeficit).catch(err => {
            console.error('[V1 API] Error recording quota:', err);
        });

        return NextResponse.json({
            success: true,
            data: {
                ai_probability: aiProbability,
                human_probability: humanProbability,
                label,
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
