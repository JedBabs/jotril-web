export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { estimateCost, hashText, checkCache, checkQuota, hashFingerprint } from '@/lib/quota-manager';
import { extractTextFromDocument } from '@/lib/file-parser';

/**
 * POST /api/estimate
 * Pre-scan cost preview — calculates point cost without running the analysis.
 * Returns the cost, remaining budget, and whether the scan would be cached.
 */
export async function POST(req) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let text = '';
        let hardwareFootprint = {};
        let contentSize = 0;
        let isDocumentRequest = false;

        if (contentType.includes('multipart/form-data')) {
            isDocumentRequest = true;
            const formData = await req.formData();
            const fpString = formData.get('hardwareFootprint');
            if (fpString) hardwareFootprint = JSON.parse(fpString);

            const file = formData.get('file');
            if (!file || typeof file === 'string') {
                return NextResponse.json({ error: 'No valid file' }, { status: 400 });
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            contentSize = buffer.byteLength;
            text = await extractTextFromDocument(buffer, file.type);
        } else {
            const body = await req.json();
            text = body.text || '';
            hardwareFootprint = body.hardwareFootprint || {};
            contentSize = text.length;
        }

        if (!text || text.trim() === '') {
            return NextResponse.json({ error: 'No text to estimate' }, { status: 400 });
        }

        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount < 100) {
            return NextResponse.json({ error: 'Content must contain at least 100 words for accurate analysis.' }, { status: 400 });
        }

        // Get session & identity
        const session = await getServerSession(authOptions);
        const role = session?.user?.role || 'UNAUTHENTICATED';
        const userId = session?.user?.id || null;
        const hashIdentity = await hashFingerprint(hardwareFootprint);

        // Calculate cost
        const { sentenceCount, pointCost } = estimateCost(text);

        // Check cache
        const textHashValue = await hashText(text);
        const cached = await checkCache(textHashValue, hashIdentity, userId);

        // Check if allowed (without recording)
        const quotaCheck = await checkQuota(role, hashIdentity, userId,
            isDocumentRequest ? 'DOCUMENT' : 'TEXT', contentSize, sentenceCount);

        return NextResponse.json({
            pointCost: cached ? 0 : pointCost,
            cached: !!cached,
            allowed: quotaCheck.allowed,
            reason: quotaCheck.reason,
        });
    } catch (error) {
        console.error('[Estimate] Error:', error);
        return NextResponse.json({ error: 'Failed to estimate cost' }, { status: 500 });
    }
}
