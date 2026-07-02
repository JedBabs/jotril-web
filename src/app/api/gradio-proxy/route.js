export const runtime = 'edge';

import { SCAN_TOKEN_COOKIE, verifyScanToken } from '@/lib/scan-token';

// Exact host allow-list. We parse the URL and check the HOSTNAME — a substring
// check (`url.includes('.hf.space')`) is exploitable: `https://evil.com/?x=.hf.space`
// passes it, and the proxy would then send the injected `Authorization: Bearer
// HF_TOKEN` header to evil.com → token exfiltration. Hostname matching closes that.
function isAllowedTarget(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'huggingface.co' || host.endsWith('.hf.space');
}

export async function POST(req) {
    try {
        // Gate: the caller must present a valid scan token (HttpOnly cookie issued by
        // /api/analyze after the budget governor admitted the scan). Without this the
        // proxy is an open relay for the server-side HF_TOKEN. verifyScanToken fails
        // open ONLY when no NEXTAUTH_SECRET is configured (so a misconfig can't brick
        // every scan); with a secret present (always, in practice) a missing/forged/
        // expired token is rejected.
        const token = req.cookies.get(SCAN_TOKEN_COOKIE)?.value;
        if (!(await verifyScanToken(token))) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: missing or invalid scan token. Start a scan via /api/analyze first.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const payload = await req.json();
        const { targetUrl, options = {} } = payload;

        if (!targetUrl || !isAllowedTarget(targetUrl)) {
            return new Response(
                JSON.stringify({ error: 'Invalid target URL, blocked by proxy firewall.' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
        }

        // Initialize headers securely, overriding any client-side Bearer injections
        if (!options.headers) {
            options.headers = {};
        }

        // Read the private token safely from the Node container logic
        if (process.env.HF_TOKEN) {
            options.headers['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;
        } else {
            console.warn("Secure Proxy Warning: HF_TOKEN is missing in Vercel/Local environment variables.");
        }

        // Verbose forward logs are dev-only — they were per-invocation noise
        // (60-90 calls per scan × headers+body) and leaked the user's text
        // through the platform log pipeline.
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Proxy] Forwarding secure request to: ${targetUrl}`);
        }
        const hfResponse = await fetch(targetUrl, options);

        // STREAM the upstream body — do NOT buffer it (`await hfResponse.text()`).
        // Gradio's poll endpoint is a long-held SSE stream that only closes once the
        // Space's queue reaches the event; buffering meant this function sent NOTHING
        // until then, and Vercel kills an Edge Function that hasn't started responding
        // within ~25s. Under scan load (deep Space queues) every tail-chunk poll blew
        // that limit → 504 → client resubmitted on another Space → retry storm.
        // Streaming forwards the headers + heartbeats immediately; the client's
        // .text() simply resolves when the stream ends, as before.
        const contentType = hfResponse.headers.get('content-type') || 'text/plain';

        return new Response(hfResponse.body, {
            status: hfResponse.status,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        console.error("[Proxy] Critical Proxy Failure:", error);
        return new Response(JSON.stringify({ error: "Server-side proxy execution failed", details: error.message }), { status: 500 });
    }
}
