/**
 * Scan token — a short-lived HMAC-signed token that authorizes the client to use
 * /api/gradio-proxy. Issued (as an HttpOnly cookie) by /api/analyze after the
 * budget governor has admitted a scan, and verified at the Edge proxy. This stops
 * /api/gradio-proxy from being an open relay for the server-side HF_TOKEN: a caller
 * must have passed through the governed entrypoint first.
 *
 * Pure Web Crypto (crypto.subtle) so it runs in BOTH the Node runtime (/api/analyze)
 * and the Edge runtime (/api/gradio-proxy). No node:crypto, no extra deps.
 *
 * This is a "you came through the front door" gate, not a per-call budget cap — the
 * authoritative invocation budget still lives server-side in UsageBudget. A captured
 * cookie (HttpOnly, so not XSS-readable) is replayable for at most TTL.
 */

export const SCAN_TOKEN_COOKIE = 'jotril_scan';
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2h — comfortably covers long background scans

function getSecret() {
    return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '';
}

function bytesToB64Url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strToB64Url(str) {
    return bytesToB64Url(new TextEncoder().encode(str));
}

async function hmacSha256(message, secret) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return bytesToB64Url(new Uint8Array(sig));
}

/** Constant-time string compare (avoids timing oracles on the signature). */
function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Returns a signed token `<payloadB64>.<sigB64>`, or null if no secret is configured
 * (callers treat null as "enforcement disabled" — fail-open so a misconfig can't brick
 * the whole scan flow; in practice NEXTAUTH_SECRET is always set for auth to work).
 */
export async function signScanToken(ttlMs = DEFAULT_TTL_MS) {
    const secret = getSecret();
    if (!secret) return null;
    const payload = strToB64Url(JSON.stringify({ exp: Date.now() + ttlMs }));
    const sig = await hmacSha256(payload, secret);
    return `${payload}.${sig}`;
}

/**
 * Verifies a scan token. Returns true when the signature is valid AND unexpired.
 * When no secret is configured, returns true (fail-open — see signScanToken).
 */
export async function verifyScanToken(token) {
    const secret = getSecret();
    if (!secret) return true; // enforcement disabled (no secret) — don't brick scans
    if (!token || typeof token !== 'string' || !token.includes('.')) return false;

    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return false;

    const expected = await hmacSha256(payloadB64, secret);
    if (!timingSafeEqual(sig, expected)) return false;

    try {
        const bin = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
        const json = JSON.parse(decodeURIComponent(
            Array.from(bin).map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
        ));
        return typeof json.exp === 'number' && json.exp > Date.now();
    } catch {
        return false;
    }
}
