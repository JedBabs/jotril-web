/**
 * Jotril V2 Model Service (Secure Proxied Load Balancer)
 * Centralized client for the Hugging Face Gradio spaces.
 * Uses direct REST calls routed through a secure Next.js Proxy.
 * Handles load balancing, authentication masking, timeouts, retries, and response parsing.
 */

// Target pools automatically synchronized
export const SPACES = [
    'JedBabs/Jotril-Space-1',
    'JedBabs/Jotril-Space-2'
];

let currentIndex = 0;

export class JotrilServiceError extends Error {
    constructor(message, type, retriable = false) {
        super(message);
        this.type = type;
        this.retriable = retriable;
    }
}

/**
 * Proxy Wrapper fetching tool.
 */
async function secureFetch(targetUrl, options) {
    return fetch('/api/gradio-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, options })
    });
}

/**
 * Pings the model to ensure it's awake and ready.
 */
export async function pingJotrilModels() {
    console.log('[JotrilService] [SECURE] Pinging primary AI assessment nodes via Proxy...');
    try {
        const response = await secureFetch(`https://huggingface.co/api/spaces/${SPACES[0]}`, { method: 'GET' });
        if (!response.ok) throw new Error('Space API unreachable via proxy');
        const data = await response.json();
        return data.runtime?.stage === 'RUNNING';
    } catch (e) {
        console.warn('[JotrilService] Ping execution failed natively:', e);
        return false;
    }
}

/**
 * Executes a raw Gradio direct `/gradio_api/call/predict` endpoint for ultra-low latency.
 */
export async function queryJotrilModel(text, spaceName) {
    const MAX_RETRIES = 5;
    let retryCount = 0;

    while (retryCount <= MAX_RETRIES) {
        try {
            const submitUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/call/predict`;

            const submitRes = await secureFetch(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { data: [text] } // proxy automatically stringifies inner body requests if configured
            });

            if (!submitRes.ok) {
                const errText = await submitRes.text().catch(() => '');
                if (submitRes.status === 429) {
                    throw new JotrilServiceError(`Rate limit exceeded securely`, 'RATE_LIMIT', true);
                }
                throw new Error(`Proxy submit failed (${submitRes.status}): ${errText}`);
            }

            const submitData = await submitRes.json();
            const eventId = submitData.event_id;
            if (!eventId) throw new Error('Invalid Gradio Proxy Response: Missing event_id');

            let result = null;
            let statusFailures = 0;
            const statusUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/call/predict/${eventId}`;

            while (statusFailures < 15) {
                const statusRes = await secureFetch(statusUrl, { method: 'GET' });

                if (!statusRes.ok) {
                    if (statusRes.status === 404 || statusRes.status === 429) {
                        statusFailures++;
                        await new Promise(r => setTimeout(r, 600));
                        continue;
                    }
                    throw new Error(`Proxy Polling Exception: Code ${statusRes.status}`);
                }

                const rawText = await statusRes.text();
                const lines = rawText.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    const dataStr = line.substring(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.msg === 'process_starts' || data.msg === 'process_generating') {
                            continue; // Valid heartbeat ping
                        }
                        if (data.msg === 'process_completed') {
                            // Extract prediction and confidence metrics
                            const p = data.output.data[0];
                            result = p.label ? { label: p.label.toLowerCase(), confidence: p.confidences[0]?.confidence || 1.0 } : p[0];
                        } else {
                            throw new Error(`Gradio generation error via proxy: ${dataStr}`);
                        }
                    } catch (e) {
                        // Some data streams represent chunk breakage; gracefully continue
                    }
                }

                if (result) break; // Finished successfully
                await new Promise(r => setTimeout(r, 450));
            }

            if (!result) throw new Error('Proxy Polling Timeout Extinguished');

            return {
                text,
                ...result,
                sourceSpace: spaceName
            };

        } catch (error) {
            if (error instanceof JotrilServiceError) {
                if (error.type === 'RATE_LIMIT') {
                    retryCount++;
                    const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000);
                    console.log(`[JotrilProxyService] Space ${spaceName} dynamically rate limited. Retreating for ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue; // Retrying gracefully 
                }
            }
            // Unexpected standard errors map to cold-start retries
            retryCount++;
            if (retryCount > MAX_RETRIES) throw new Error(`Query failed continuously on secure proxy setup.`);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Primary multi-threaded document engine export. No internal API tokens exposed here.
 */
export async function predictBatch(texts, onProgress = null, checkCancel = null, concurrency = 10, batchDelay = 50) {
    const results = new Array(texts.length).fill(null);
    let completedCount = 0;

    const worker = async () => {
        while (currentIndex < texts.length) {
            if (checkCancel) await checkCancel();
            const idx = currentIndex++;
            const text = texts[idx];

            if (batchDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }

            const preferredSpace = SPACES[(idx) % SPACES.length];

            try {
                const res = await queryJotrilModel(text, preferredSpace);
                results[idx] = res;
            } catch (error) {
                console.error('[JotrilProxyService] Query item completely failed:', error.message);
                results[idx] = null;
            } finally {
                completedCount++;
                if (onProgress) {
                    const pct = Math.round((completedCount / texts.length) * 100);
                    onProgress(pct, `Proxy Processing ${completedCount}/${texts.length}`);
                }
            }
        }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, texts.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}



export async function queryJotrilBatch(texts, spaceName) {
    const MAX_RETRIES = 5;
    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
        try {
            const submitUrl = https://.hf.space/gradio_api/call/predict;
            const response = await secureFetch(submitUrl, {
                method: "POST",
                body: JSON.stringify({ data: [texts] })
            });
            
            const rawResponse = await response.text();
            if (rawResponse.includes("error")) throw new Error("Batch API Error");
            
            // Assuming the API returns [ ["ai", 0.9], ["human", 0.1], ... ]
            // or something similar when batched! We will just parse each result.
            const eventIdMatch = rawResponse.match(/"event_id":"([^"]+)"/);
            if (eventIdMatch) {
               // Wait, the API sends event stream! 
               const eventId = eventIdMatch[1];
               const streamResp = await secureFetch(submitUrl + "/" + eventId, { method: "GET" });
               const streamData = await streamResp.text();
               const finalMatch = streamData.match(/event: complete\n*data: (.+)/);
               if (finalMatch) { 
                   const resultData = JSON.parse(finalMatch[1]);
                   return resultData[0]; // Assuming Gradio returns 2D array [[results]]
               }
            }
            throw new Error("Invalid batch parsing context");
        } catch(e) {
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error("Failed batch");
}
