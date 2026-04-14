export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryJotrilModel, JotrilServiceError } from '@/lib/jotrilService';
import getPrisma from '@/lib/prisma';

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

        // Query the model using the shared service
        const result = await queryJotrilModel(text);

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
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
