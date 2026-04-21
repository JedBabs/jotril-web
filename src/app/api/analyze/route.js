export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { generateAnalysisScenarios, attributeScoresToSentences, calculateBurstinessNudge, contextualSmooth, classifyResults, splitIntoSentences, getEngineConfig } from '@/lib/chunking';
import { batchQueryModel, JotrilServiceError } from '@/lib/jotrilService';

import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

import { checkQuota, recordQuotaUsage, hashText, calculatePointCost, hashFingerprint } from '@/lib/quota-manager';
import { extractTextFromDocument } from '@/lib/file-parser';
import getPrisma from '@/lib/prisma';

export async function POST(req) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let text = '';
        let hardwareFootprint = {};
        let isDocumentRequest = false;
        let contentSize = 0;
        let fileName = null;

        if (contentType.includes('multipart/form-data')) {
            isDocumentRequest = true;
            const formData = await req.formData();

            const fpString = formData.get('hardwareFootprint');
            if (fpString) hardwareFootprint = JSON.parse(fpString);

            const file = formData.get('file');
            if (!file || typeof file === 'string') {
                return NextResponse.json({ error: 'No valid document file provided' }, { status: 400 });
            }
            fileName = file.name;

            const buffer = Buffer.from(await file.arrayBuffer());
            contentSize = buffer.byteLength;
            text = await extractTextFromDocument(buffer, file.type);
        } else {
            const jsonBody = await req.json();
            text = jsonBody.text || '';
            hardwareFootprint = jsonBody.hardwareFootprint || {};
            contentSize = text.length;
        }

        if (!text || text.trim() === '') {
            return NextResponse.json({ error: 'No text or recognizable content could be extracted' }, { status: 400 });
        }

        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount < 100) {
            return NextResponse.json({ error: 'Content must contain at least 100 words for accurate analysis.' }, { status: 400 });
        }

        // Identify the user and device
        const session = await getServerSession(authOptions);
        const role = session?.user?.role || 'UNAUTHENTICATED';
        const userId = session?.user?.id || null;
        const hashIdentity = await hashFingerprint(hardwareFootprint);

        // Count sentences for cost calculation
        const sentences = splitIntoSentences(text);
        const sentenceCount = sentences.length;

        const textHashValue = await hashText(text);

        // Enforce Dual-Gate Quota
        const requestType = isDocumentRequest ? 'DOCUMENT' : 'TEXT';

        const quotaCheck = await checkQuota(role, hashIdentity, userId, requestType, contentSize, sentenceCount);
        const pointCost = quotaCheck.pointCost;
        const purchasedDeficit = quotaCheck.purchasedDeficit || 0;

        if (!quotaCheck.allowed) {
            return NextResponse.json({
                error: quotaCheck.reason,
                limitExceeded: true,
                pointCost,
            }, { status: 403 });
        }

        // Record usage immediately before processing
        await recordQuotaUsage(hashIdentity, userId, requestType, contentSize, pointCost, sentenceCount, textHashValue, purchasedDeficit);

        // Generate all multi-scale analysis scenarios
        const { scenarios, sentences: docSentences, totalSentences } = generateAnalysisScenarios(text);

        console.log(`[Analyze] Processing ${scenarios.length} scenarios for ${totalSentences} sentences (${pointCost} pts)...`);

        // Batch-query the model
        const results = await batchQueryModel(
            scenarios.map(s => s.text),
            5,
            500
        );

        // Convert model results to 0-100 scores with confidence penalty for short fragments
        const scores = results.map((result, idx) => {
            if (!result) return 0;

            let score = result.aiScore * 100;

            // Confidence penalty for very short fragments (< 10 words)
            const wordCount = scenarios[idx].text.split(/\s+/).length;
            if (wordCount < 10) {
                score = 50 + (score - 50) * 0.6;
            }

            return score;
        });

        // Fetch dynamic engine configuration from DB (cached)
        const engineCfg = await getEngineConfig();

        // Calculate document-level burstiness correction
        const burstinessNudge = calculateBurstinessNudge(docSentences, engineCfg);

        // Map scores back to individual sentences using the 3-signal differential engine
        const rawChunks = attributeScoresToSentences(
            docSentences,
            scenarios,
            scores,
            burstinessNudge,
            engineCfg
        );

        // Apply contextual smoothing
        const smoothedChunks = contextualSmooth(rawChunks, engineCfg);

        // Classify into human/mixed/ai
        const { chunks: classifiedChunks, breakdown, overallLabel } = classifyResults(smoothedChunks, engineCfg);

        if (userId) {
            try {
                const prisma = getPrisma();
                await prisma.scanResult.create({
                    data: {
                        userId,
                        filename: fileName,
                        type: requestType,
                        wordCount,
                        sentenceCount,
                        overallLabel,
                        breakdown,
                        chunks: classifiedChunks
                    }
                });
            } catch (err) {
                console.error('[Analyze] Error saving ScanResult:', err);
            }
        }

        return NextResponse.json({
            success: true,
            chunks: classifiedChunks,
            breakdown,
            overallLabel,
            pointsCost: pointCost,
            cached: false,
        });

    } catch (error) {
        console.error('[Analyze] Error:', error);

        if (error instanceof JotrilServiceError) {
            if (error.type === 'COLD_START') {
                return NextResponse.json({
                    error: 'The Jotril V2 engine is warming up. Please try again in about 30 seconds.',
                    type: 'COLD_START',
                    retryAfter: error.retryAfter || 30
                }, { status: 503 });
            }
            if (error.type === 'AUTH_ERROR') {
                return NextResponse.json({
                    error: 'Authentication error with the analysis engine. Please contact support.',
                    type: 'AUTH_ERROR'
                }, { status: 502 });
            }
            if (error.type === 'RATE_LIMITED') {
                return NextResponse.json({
                    error: 'The analysis engine is busy. Please try again in a moment.',
                    type: 'RATE_LIMITED',
                    retryAfter: error.retryAfter || 10
                }, { status: 429 });
            }
        }

        return NextResponse.json({
            error: 'Analysis failed. Please try again.',
            type: 'MODEL_ERROR'
        }, { status: 500 });
    }
}
