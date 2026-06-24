/**
 * Google Cloud Storage helper (server-only) for caching rendered report PDFs.
 * Uses the GCS JSON REST API with an access token minted from GCP_SA_KEY —
 * reuses the same service-account credential as Gotenberg, no extra dependency.
 *
 * Cache key convention: `${userId}/${scanId}.pdf`
 */
import { GoogleAuth } from 'google-auth-library';

const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
let _auth = null;

function bucket() {
    return process.env.GCS_BUCKET || '';
}

export function storageConfigured() {
    return !!process.env.GCS_BUCKET && !!process.env.GCP_SA_KEY;
}

async function accessToken() {
    if (!_auth) {
        const credentials = JSON.parse(Buffer.from(process.env.GCP_SA_KEY, 'base64').toString('utf8'));
        _auth = new GoogleAuth({ credentials, scopes: [STORAGE_SCOPE] });
    }
    const t = await _auth.getAccessToken();
    if (!t) throw new Error('Failed to mint GCS access token');
    return t;
}

export function reportKey(userId, scanId) {
    return `${userId}/${scanId}.pdf`;
}

/**
 * Intermediate cache key for the Gotenberg-converted (un-highlighted) PDF,
 * content-addressed by the SHA-256 of the source DOCX. Lets the convert step
 * run in parallel with the scan (Phase A) and be reused by the scan-complete
 * prewarm (Phase B) instead of re-paying the Gotenberg cold start. Not
 * user-scoped — identical bytes convert to the identical PDF, so this dedupes
 * across users and re-scans. The bucket is private; the hash requires the file.
 */
export function conversionKey(hash) {
    return `conversions/${hash}.pdf`;
}

/** True if the object already exists. */
export async function reportExists(key) {
    if (!storageConfigured()) return false;
    const token = await accessToken();
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket()}/o/${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.status === 200;
}

/** Upload PDF bytes (overwrites). */
export async function uploadReport(key, pdfBuffer) {
    const token = await accessToken();
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket()}/o?uploadType=media&name=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
        body: new Uint8Array(pdfBuffer),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`GCS upload ${res.status}: ${detail.slice(0, 200)}`);
    }
    return true;
}

/** Download PDF bytes, or null if missing. */
export async function downloadReport(key) {
    if (!storageConfigured()) return null;
    const token = await accessToken();
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket()}/o/${encodeURIComponent(key)}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GCS download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}
