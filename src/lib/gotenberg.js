/**
 * Gotenberg client (server-only) — DOCX → PDF via the Cloud Run LibreOffice
 * service. Mints a Google ID token from GCP_SA_KEY for an IAM-locked
 * (--no-allow-unauthenticated) service; falls back to a static GOTENBERG_AUTH
 * header, or no auth for an open service.
 */
import { GoogleAuth } from 'google-auth-library';

let _idTokenClient = null;

async function authHeaders(audience) {
    if (process.env.GCP_SA_KEY) {
        if (!_idTokenClient) {
            const credentials = JSON.parse(Buffer.from(process.env.GCP_SA_KEY, 'base64').toString('utf8'));
            const auth = new GoogleAuth({ credentials });
            _idTokenClient = await auth.getIdTokenClient(audience);
        }
        const token = await _idTokenClient.idTokenProvider.fetchIdToken(audience);
        return { Authorization: `Bearer ${token}` };
    }
    if (process.env.GOTENBERG_AUTH) return { Authorization: process.env.GOTENBERG_AUTH };
    return {};
}

export function gotenbergConfigured() {
    return !!process.env.GOTENBERG_URL;
}

/**
 * Convert a DOCX buffer to a faithful PDF buffer.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<Buffer>}
 * @throws if GOTENBERG_URL is unset or the conversion fails.
 */
export async function convertDocxToPdf(buffer, filename = 'document.docx') {
    const base = process.env.GOTENBERG_URL;
    if (!base) throw new Error('GOTENBERG_URL not configured');
    const baseUrl = base.replace(/\/+$/, '');

    const form = new FormData();
    form.append('files', new Blob([buffer]), filename);

    const headers = await authHeaders(baseUrl);
    const res = await fetch(`${baseUrl}/forms/libreoffice/convert`, {
        method: 'POST',
        body: form,
        headers,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Gotenberg ${res.status}: ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
}
