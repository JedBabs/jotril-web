export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby cap; one LibreOffice conversion per call

import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

// Cached across warm invocations. Mints a Google-signed ID token so a private
// (IAM-locked) Cloud Run Gotenberg accepts the call. Falls back to a static
// header (GOTENBERG_AUTH) or no auth (open service).
let _idTokenClient = null;
async function gotenbergAuthHeaders(audience) {
    if (process.env.GCP_SA_KEY) {
        try {
            if (!_idTokenClient) {
                const credentials = JSON.parse(Buffer.from(process.env.GCP_SA_KEY, 'base64').toString('utf8'));
                const auth = new GoogleAuth({ credentials });
                _idTokenClient = await auth.getIdTokenClient(audience);
            }
            const token = await _idTokenClient.idTokenProvider.fetchIdToken(audience);
            return { Authorization: `Bearer ${token}` };
        } catch (e) {
            console.error('[Convert] Cloud Run ID token mint failed:', e?.message);
            return null; // signal hard auth failure → 502
        }
    }
    if (process.env.GOTENBERG_AUTH) return { Authorization: process.env.GOTENBERG_AUTH };
    return {};
}

/**
 * POST /api/report/convert  — DOCX → faithful PDF via Gotenberg (LibreOffice).
 *
 * This is the server side of the high-fidelity report path: the browser sends
 * the original DOCX, we proxy it to a self-hosted Gotenberg instance (Cloud Run),
 * and return the rendered PDF. The client then overlays AI/mixed highlights on
 * that PDF in-place (pdf-overlay.js) — preserving native charts, table widths,
 * merges and formatting that the mammoth→HTML path can't.
 *
 * Gated by env: returns 501 when GOTENBERG_URL is unset, so the client falls
 * back to the standard /api/report renderer. GOTENBERG_URL / GOTENBERG_AUTH are
 * SERVER-ONLY — never expose the endpoint or secret to the browser.
 */
const MAX_BYTES = 25 * 1024 * 1024; // matches the largest upload tier (ULTRA is 100MB; cap here for the convert hop)

export async function POST(req) {
    const base = process.env.GOTENBERG_URL;
    if (!base) {
        // Fidelity engine not deployed — signal the client to use the standard path.
        return NextResponse.json({ error: 'Fidelity engine not configured' }, { status: 501 });
    }

    let form;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'File too large to convert' }, { status: 413 });

    // Gotenberg LibreOffice route expects multipart with a `files` field.
    const gForm = new FormData();
    gForm.append('files', new Blob([buf]), file.name || 'document.docx');

    const baseUrl = base.replace(/\/+$/, '');
    // Audience for a Cloud Run ID token is the service's base URL.
    const headers = await gotenbergAuthHeaders(baseUrl);
    if (headers === null) {
        return NextResponse.json({ error: 'Conversion auth failed' }, { status: 502 });
    }

    const endpoint = `${baseUrl}/forms/libreoffice/convert`;

    let res;
    try {
        res = await fetch(endpoint, { method: 'POST', body: gForm, headers });
    } catch (e) {
        console.error('[Convert] Gotenberg unreachable:', e?.message);
        return NextResponse.json({ error: 'Conversion service unreachable' }, { status: 502 });
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[Convert] Gotenberg returned', res.status, detail.slice(0, 300));
        return NextResponse.json({ error: 'Conversion failed' }, { status: 502 });
    }

    const pdf = Buffer.from(await res.arrayBuffer());
    // Standard Uint8Array body; let the platform compute Content-Length (a manual
    // one collides with chunked transfer encoding → 0-byte downloads in browsers).
    return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'no-store',
        },
    });
}
