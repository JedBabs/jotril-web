export const runtime = 'edge';

export async function POST(req) {
    try {
        const payload = await req.json();
        const { targetUrl, options = {} } = payload;

        if (!targetUrl || (!targetUrl.includes('.hf.space') && !targetUrl.includes('huggingface.co'))) {
            return new Response(JSON.stringify({ error: "Invalid target URL, blocked by proxy firewall." }), { status: 403 });
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

        // Fetch exact output payload
        const contentType = hfResponse.headers.get('content-type') || 'text/plain';
        const responseData = await hfResponse.text();

        return new Response(responseData, {
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
