/**
 * Jotril V2 Model Service (Secure Proxied Load Balancer)
 * Centralized client for the Hugging Face Gradio spaces.
 * Uses direct REST calls routed through a secure Next.js Proxy.
 * Handles load balancing, authentication masking, timeouts, retries, and response parsing.
 */

// Target pools automatically synchronized
export const SPACES = [
    'JedBabs/Jotril-Space-1',
    'JedBabs/Jotril-Space-2',
    'JedBabs/Jotril-Space-3'
];

let currentIndex = 0;

/**
 * The HF model emits human-facing labels ("AI GENERATED" / "HUMAN WRITTEN").
 * The heatmap pipeline (useAnalyze.processFinalResults) keys strictly off the
 * canonical tokens "ai" / "human" / "mixed", so normalize at this boundary —
 * otherwise every successful result silently falls through to "transparent".
 */
function normalizeLabel(raw) {
    const s = String(raw).toUpperCase();
    if (s.includes('HUMAN')) return 'human';
    if (s.includes('AI')) return 'ai';
    return 'mixed';
}

export class JotrilServiceError extends Error {
    constructor(message, type, retriable = false) {
        super(message);
        this.type = type;
        this.retriable = retriable;
    }
}

/**
 * Honest proxy-call tally. Each secureFetch = one real Vercel Function Invocation
 * (submit OR poll), so this counts what `telemetry.edgeProxyCalls` used to under-count
 * (it incremented once per query, ignoring the polls). Session-scoped display gauge —
 * the authoritative monthly budget lives server-side in UsageBudget / budget-governor.js.
 */
export const proxyStats = { calls: 0 };

/**
 * Proxy Wrapper fetching tool.
 */
async function secureFetch(targetUrl, options) {
    proxyStats.calls++;
    return fetch('/api/gradio-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, options })
    });
}

/**
 * Keep-awake: warms EVERY Space so none sleeps after 48h idle.
 *
 * Important: a Hub status check (huggingface.co/api/spaces/...) does NOT reset a
 * Space's inactivity timer — only a real request to its inference endpoint does.
 * So we fire a lightweight submit at each Space's `/gradio_api/call/predict` and
 * don't wait for the result (fire-and-forget): reaching the Space is enough to
 * keep it warm, and we avoid blocking on a 30-60s cold-start (cron timeout safety).
 */
export async function pingJotrilModels() {
    console.log(`[JotrilService] [SECURE] Warming ${SPACES.length} AI assessment nodes via Proxy...`);
    const results = await Promise.allSettled(
        SPACES.map(space => {
            const submitUrl = `https://${space.replace('/', '-')}.hf.space/gradio_api/call/predict`;
            return secureFetch(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: ['warmup'] })
            });
        })
    );
    const reached = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    console.log(`[JotrilService] Warmed ${reached}/${SPACES.length} Spaces.`);
    return reached > 0;
}

/**
 * Submits one sentence to the Gradio `/gradio_api/call/predict` endpoint, then
 * polls the matching `/gradio_api/call/predict/<event_id>` SSE stream for the result.
 *
 * `spaceName` is the *preferred* Space; on transport-level failures we rotate to the
 * next Space in SPACES so a single dead/cold Space doesn't condemn the chunk. A 429
 * (rate limit) keeps the same Space and just backs off — the others are likely as hot.
 */
export async function queryJotrilModel(text, spaceName) {
    const MAX_RETRIES = 5;
    let retryCount = 0;
    // Rotate starting from the caller's preferred Space, so retries fan out across the pool.
    const startIdx = Math.max(0, SPACES.indexOf(spaceName));
    let currentSpace = spaceName;

    while (retryCount <= MAX_RETRIES) {
        try {
            const submitUrl = `https://${currentSpace.replace('/', '-')}.hf.space/gradio_api/call/predict`;

            const submitRes = await secureFetch(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: [text] })
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
            // The poll URL MUST match the api_name used at submit time ("/predict").
            // Polling "/batch/<eid>" for a /predict job only ever returns
            // "event: heartbeat / data: null" and never resolves — the root cause of
            // the recurring "Polling Timeout Extinguished" + resubmit loop.
            const statusUrl = `https://${currentSpace.replace('/', '-')}.hf.space/gradio_api/call/predict/${eventId}`;

            let statusFailures = 0;
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

                // Gradio's /gradio_api/call/<api>/<event_id> endpoint streams SSE as
                // alternating "event: <type>" / "data: <json>" line pairs. The payload
                // on a "complete" event is the raw output array:
                //   [ { label, confidences:[{label,confidence}] }, scorePct, aiProbability ]
                // (NOT the old {"msg":"process_completed","output":...} queue protocol.)
                const lines = rawText.split('\n');
                let currentEvent = null;
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        currentEvent = line.slice(6).trim();
                        continue;
                    }
                    if (!line.startsWith('data:')) continue;

                    const dataStr = line.slice(5).trim();
                    if (currentEvent === 'error') {
                        throw new Error(`Gradio inference error via proxy: ${dataStr}`);
                    }
                    if (currentEvent !== 'complete') continue; // skip heartbeat / generating

                    let payload;
                    try {
                        payload = JSON.parse(dataStr);
                    } catch (e) {
                        continue; // truncated/partial frame — keep scanning
                    }

                    const head = Array.isArray(payload) ? payload[0] : payload;
                    if (head && head.label != null) {
                        // The site's source of truth is the AI probability (0-1); the engine
                        // thresholds (humanMax/mixedMax) later turn it into ai/mixed/human.
                        // payload[2] is the model's "AI Probability Meter"; fall back to the
                        // AI entry inside `confidences` if the array shape differs.
                        const aiProbability = Array.isArray(payload) && typeof payload[2] === 'number'
                            ? payload[2]
                            : head.confidences?.find(c => /ai/i.test(String(c.label)))?.confidence ?? null;
                        result = {
                            score: aiProbability != null ? Math.round(aiProbability * 100) : null, // 0-100 AI score
                            aiProbability,
                            confidence: head.confidences?.[0]?.confidence ?? 1.0,
                            rawLabel: normalizeLabel(head.label) // fallback label only if score is unavailable
                        };
                    }
                }

                if (result) break; // Finished successfully
                await new Promise(r => setTimeout(r, 450));
            }

            if (!result) throw new Error('Proxy Polling Timeout Extinguished');

            return {
                text,
                ...result,
                sourceSpace: currentSpace
            };

        } catch (error) {
            // 429 = rate limit on this Space. Rotating doesn't help (others share the
            // same HF user quota), so stay put and just back off.
            if (error instanceof JotrilServiceError && error.type === 'RATE_LIMIT') {
                retryCount++;
                const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000);
                console.log(`[JotrilProxyService] Space ${currentSpace} rate limited. Retreating for ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            // Everything else (cold start, 5xx, polling timeout, network) = THIS Space is
            // probably unhealthy. Rotate to the next Space in the pool for the retry — a
            // dead Space-N can't condemn the chunk while Space-{N+1} is healthy.
            retryCount++;
            if (retryCount > MAX_RETRIES) {
                throw new Error(`Query failed across all Spaces after ${MAX_RETRIES} attempts: ${error.message}`);
            }
            const nextSpace = SPACES[(startIdx + retryCount) % SPACES.length];
            console.warn(`[JotrilProxyService] ${currentSpace} failed (${error.message}); failing over to ${nextSpace} (attempt ${retryCount}/${MAX_RETRIES})`);
            currentSpace = nextSpace;
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
            const submitUrl = `https://${spaceName.replace("/", "-")}.hf.space/gradio_api/call/batch`;
            const response = await secureFetch(submitUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: [texts] })
            });
            
            const rawResponse = await response.text();
            if(rawResponse.includes("error")) { console.log(rawResponse); throw new Error("Batch API Error"); } throw new Error("Batch API Error");
            
            // Assuming the API returns [ ["ai", 0.9], ["human", 0.1], ... ]
            // or something similar when batched! We will just parse each result.
            const eventIdMatch = rawResponse.match(/"event_id":"([^"]+)"/);
            if (eventIdMatch) {
               // Wait, the API sends event stream! 
               const eventId = eventIdMatch[1];
               const streamResp = await secureFetch(submitUrl + "/" + eventId, { method: "GET" });
               const streamData = await streamResp.text();
               if (streamData.includes("event: complete")) {
                   const splitData = streamData.split("event: complete");
                   const dataBlock = splitData[splitData.length - 1];
                   if (dataBlock.includes("data:")) {
                       const jsonStr = dataBlock.substring(dataBlock.indexOf("data:") + 5).trim();
                       try {
                           const resultData = JSON.parse(jsonStr);
                           return resultData[0]; // Assuming Gradio returns 2D array [[results]]
                       } catch(err) {
                           console.log("JSON Parse Error on stream:", jsonStr);
                       }
                   }
               }
            }
            throw new Error("Invalid batch parsing context");
        } catch(e) { console.log(e);
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error("Failed batch");
}
