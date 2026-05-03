export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { generateAnalysisScenarios, attributeScoresToSentences, calculateBurstinessNudge, contextualSmooth, classifyResults, splitIntoSentences, getEngineConfig } from '@/lib/chunking';
import { batchQueryModel, JotrilServiceError } from '@/lib/jotrilService';

import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

import { checkQuota, recordQuotaUsage, hashText, calculatePointCost, hashFingerprint } from '@/lib/quota-manager';
import { extractTextFromDocument, extractHtmlFromDocument } from '@/lib/file-parser';
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
            // Also extract structured HTML for formatting-preserving PDF export
            var sourceHtml = await extractHtmlFromDocument(buffer, file.type);
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

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const sendEvent = (event, data) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    sendEvent('progress', { progress: 20, step: "Extracting semantic features..." });
                    // Small delay to ensure the frontend processes the early event quickly
                    await new Promise(r => setTimeout(r, 50));

                    // Batch-query the model
                    sendEvent('progress', { progress: 40, step: "Vectorizing text chunks..." });
                    const results = await batchQueryModel(
                        scenarios.map(s => s.text),
                        5,
                        500
                    );

                    sendEvent('progress', { progress: 70, step: "Evaluating burstiness & complexity..." });

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

                    sendEvent('progress', { progress: 85, step: "Applying contextual smoothing..." });

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

                    sendEvent('progress', { progress: 95, step: "Finalizing confidence ratings..." });

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

                    // Send final completion message
                    sendEvent('complete', {
                        success: true,
                        chunks: classifiedChunks,
                        breakdown,
                        overallLabel,
                        sourceHtml: sourceHtml || null,
                        pointsCost: pointCost,
                        cached: false,
                    });

                    controller.close();
                } catch (error) {
                    console.error('[Analyze Stream] Error:', error);

                    if (error instanceof JotrilServiceError) {
                        if (error.type === 'COLD_START') {
                            sendEvent('error', {
                                error: 'The Jotril V2 engine is warming up. Please try again in about 30 seconds.',
                                type: 'COLD_START',
                                retryAfter: error.retryAfter || 30
                            });
                        } else if (error.type === 'AUTH_ERROR') {
                            sendEvent('error', {
                                error: 'Authentication error with the analysis engine. Please contact support.',
                                type: 'AUTH_ERROR'
                            });
                        } else if (error.type === 'RATE_LIMITED') {
                            sendEvent('error', {
                                error: 'The analysis engine is busy. Please try again in a moment.',
                                type: 'RATE_LIMITED',
                                retryAfter: error.retryAfter || 10
                            });
                        } else {
                            sendEvent('error', { error: 'Analysis failed. Please try again.', type: 'MODEL_ERROR' });
                        }
                    } else {
                        sendEvent('error', { error: 'Analysis failed. Please try again.', type: 'MODEL_ERROR' });
                    }
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
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
