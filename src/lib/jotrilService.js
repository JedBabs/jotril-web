/**
 * Jotril V2 Model Service
 * Centralized client for the Hugging Face Gradio spaces.
 * Uses direct REST calls to the Gradio 6.x API (which lives at /gradio_api/).
 * Handles load balancing, authentication, timeouts, retries, and response parsing.
 */

const SPACES = [
    "JedBabs/Jotril-Space-1",
    "JedBabs/Jotril-Space-2"
];

// Convert space name to direct URL (e.g. "JedBabs/Jotril-Space-1" → "https://jedbabs-jotril-space-1.hf.space")
function spaceToUrl(spaceName) {
    return `https://${spaceName.replace("/", "-").toLowerCase()}.hf.space`;
}

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1500;
const QUERY_TIMEOUT_MS = 30000; // 30s hard timeout per individual model query

/**
 * Validates the HF_TOKEN by making a native fetch to a known space.
 * This ensures we throw a fast, clean auth error instead of mysterious hangs.
 */
export async function checkHfToken() {
    if (!process.env.HF_TOKEN) {
        throw new JotrilServiceError('HF_TOKEN environment variable is not set.', 'AUTH_ERROR');
    }
    try {
        const response = await fetch(`https://huggingface.co/api/spaces/${SPACES[0]}`, {
            headers: { "Authorization": `Bearer ${process.env.HF_TOKEN}` }
        });
        if (response.status === 401 || response.status === 403) {
            throw new JotrilServiceError(`HuggingFace Token gets ${response.status} from API. Ensure your token is valid and has read access.`, 'AUTH_ERROR');
        }
        return true;
    } catch (e) {
        if (e instanceof JotrilServiceError) throw e;
        console.warn(`⚠️ [JotrilService] Pre-flight token check failed: ${e.message}`);
        return true;
    }
}

/**
 * Queries a Gradio 6.x space directly via REST (bypassing @gradio/client).
 * 1. POST /gradio_api/call/predict  → returns { event_id }
 * 2. GET  /gradio_api/call/predict/{event_id} → SSE stream with final result
 */
async function directPredict(spaceName, text) {
    const baseUrl = spaceToUrl(spaceName);
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.HF_TOKEN}`
    };

    // Step 1: Submit the prediction request
    const submitRes = await fetch(`${baseUrl}/gradio_api/call/predict`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [text] })
    });

    if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '');
        throw new Error(`Space ${spaceName} submit failed (${submitRes.status}): ${errText}`);
    }

    const { event_id } = await submitRes.json();
    if (!event_id) {
        throw new Error(`Space ${spaceName} returned no event_id`);
    }

    // Step 2: Fetch the result via SSE endpoint
    const resultRes = await fetch(`${baseUrl}/gradio_api/call/predict/${event_id}`, {
        headers: { "Authorization": `Bearer ${process.env.HF_TOKEN}` }
    });

    if (!resultRes.ok) {
        const errText = await resultRes.text().catch(() => '');
        throw new Error(`Space ${spaceName} result fetch failed (${resultRes.status}): ${errText}`);
    }

    const sseText = await resultRes.text();

    // Parse SSE: look for "event: complete\ndata: [...]"
    const lines = sseText.split('\n');
    let lastEventType = '';
    for (const line of lines) {
        if (line.startsWith('event: ')) {
            lastEventType = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (lastEventType === 'error') {
                throw new Error(`Space ${spaceName} prediction error: ${dataStr}`);
            }
            if (lastEventType === 'complete' && dataStr) {
                return JSON.parse(dataStr);
            }
        }
    }

    throw new Error(`Space ${spaceName} returned no complete event. Raw SSE: ${sseText.substring(0, 200)}`);
}

/**
 * Error types returned by the service for frontend-specific handling.
 */
export class JotrilServiceError extends Error {
    constructor(message, type, retryAfter = null) {
        super(message);
        this.name = 'JotrilServiceError';
        this.type = type; // 'COLD_START' | 'RATE_LIMITED' | 'AUTH_ERROR' | 'MODEL_ERROR'
        this.retryAfter = retryAfter;
    }
}

/**
 * Detects if an error response indicates the space is cold-starting.
 */
function isColdStartError(error) {
    const text = error.message || String(error);
    const markers = ['currently loading', 'building', 'is starting', 'is booting', 'sleeping', 'paused', 'starting', 'warming up', 'metadata could not be loaded', 'failed to fetch'];
    return markers.some(m => text.toLowerCase().includes(m.toLowerCase()));
}

/**
 * Queries the Jotril model using load balancing between multiple spaces.
 * 
 * @param {string} text - The text to analyze
 * @param {string|null} preferredSpace - Optional space to try first (used for retries)
 * @returns {Promise<{aiScore: number, humanScore: number, label: string, confidence: object, spaceUsed: string}>}
 */
export async function queryJotrilModel(text, preferredSpace = null, triedSpaces = new Set()) {
    await checkHfToken();

    // 1. Select a space (randomly or preferred)
    const selectedSpace = preferredSpace || SPACES[Math.floor(Math.random() * SPACES.length)];
    triedSpaces.add(selectedSpace);
    const otherSpace = SPACES.find(s => !triedSpaces.has(s));

    console.log(`📡 [JotrilService] [${preferredSpace ? 'DIRECT' : 'LOAD-BALANCED'}] Connecting to: ${selectedSpace}`);

    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Direct REST call to Gradio 6.x API with hard timeout
            const result = await Promise.race([
                directPredict(selectedSpace, text),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Prediction timed out after ${QUERY_TIMEOUT_MS / 1000}s`)), QUERY_TIMEOUT_MS))
            ]);

            // V2 Format: [label_obj, score_pct, score_decimal]
            if (result && Array.isArray(result) && result.length >= 3) {
                const aiScore = result[2];
                return {
                    aiScore: typeof aiScore === 'number' ? aiScore : 0,
                    humanScore: typeof aiScore === 'number' ? 1 - aiScore : 1,
                    label: aiScore >= 0.5 ? 'AI GENERATED' : 'HUMAN WRITTEN',
                    confidence: result[0] || {},
                    spaceUsed: selectedSpace
                };
            }

            throw new JotrilServiceError('Invalid response format from model space', 'MODEL_ERROR');

        } catch (error) {
            lastError = error;

            // Handle Cold Start
            if (isColdStartError(error) || error.message?.includes('503') || error.message?.includes('504')) {
                console.warn(`⚠️ [JotrilService] ${selectedSpace} is warming up...`);

                // If this space is warming up and we have another space, try the other one immediately
                if (otherSpace) {
                    console.log(`🔄 [JotrilService] Swapping to fallback space: ${otherSpace}`);
                    return queryJotrilModel(text, otherSpace, triedSpaces);
                }

                console.error(`🚨 [JotrilService] Both spaces are warming up. Informing caller of COLD_START.`);
                throw new JotrilServiceError(
                    'The Jotril engine is warming up. This takes about 30-60 seconds.',
                    'COLD_START',
                    30
                );
            }

            // Handle Rate Limiting
            if (error.message?.includes('429')) {
                if (otherSpace) {
                    console.log(`🔄 [JotrilService] Rate limited on ${selectedSpace}, swapping to fallback: ${otherSpace}`);
                    return queryJotrilModel(text, otherSpace, triedSpaces);
                }
                throw new JotrilServiceError('Rate limited by HuggingFace.', 'RATE_LIMITED', 10);
            }

            // Handle Auth Errors
            if (error.message?.includes('401') || error.message?.includes('403')) {
                throw new JotrilServiceError('Authentication failed. Check HF_TOKEN.', 'AUTH_ERROR');
            }

            // Exponential backoff for other errors
            if (attempt < MAX_RETRIES - 1) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                console.warn(`❌ [JotrilService] Attempt ${attempt + 1} failed on ${selectedSpace}, retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // If all retries fail on the first space, try the other space as a last resort
    if (otherSpace) {
        console.log(`🚨 [JotrilService] All retries failed on ${selectedSpace}. Final fallback to ${otherSpace}`);
        return queryJotrilModel(text, otherSpace, triedSpaces);
    }

    throw lastError instanceof JotrilServiceError ? lastError : new JotrilServiceError(lastError.message || 'Model prediction failed', 'MODEL_ERROR');
}

/**
 * Batch-processes multiple texts through the model with concurrency control.
 *
 * @param {string[]} texts - Array of text strings to analyze
 * @param {number} concurrency - Max concurrent requests
 * @param {number} batchDelay - Delay between batches in ms
 * @param {() => Promise<void>} checkCancel - Optional callback to throw if cancelled
 * @returns {Promise<Array<{aiScore: number, humanScore: number, label: string} | null>>}
 */
export async function batchQueryModel(texts, concurrency = 3, batchDelay = 300, checkCancel = null, onProgress = null) {
    const results = new Array(texts.length).fill(null);
    let currentIndex = 0;
    let completedCount = 0;
    const MAX_RETRIES = 3;

    // Quick preflight to ensure token is valid before we kick off massive limits
    await checkHfToken();

    if (texts.length > 0) {
        console.log(`[JotrilService] Spinning up ${Math.min(concurrency, texts.length)} concurrent sliding window workers...`);
    }

    // The Sliding Window Worker Thread
    const worker = async () => {
        while (currentIndex < texts.length) {
            if (checkCancel) await checkCancel();

            // Claim the next query index atomically
            const idx = currentIndex++;
            const text = texts[idx];
            let retryCount = 0;

            while (retryCount <= MAX_RETRIES) {
                try {
                    // Alternate spaces effectively across the sliding window
                    const preferredSpace = SPACES[(idx) % SPACES.length];
                    results[idx] = await queryJotrilModel(text, preferredSpace);
                    break; // Success, break retry loop
                } catch (error) {
                    if (error instanceof JotrilServiceError) {
                        if (error.type === 'COLD_START') {
                            retryCount++;
                            if (retryCount > MAX_RETRIES) throw new Error(`Query failed after ${MAX_RETRIES} retries. Jotril engine clusters may be permanently offline.`);
                            console.warn(`⏳ [JotrilService] Query encountered COLD_START. Waiting 30s before retrying (${retryCount}/${MAX_RETRIES})...`);
                            for (let s = 0; s < 30; s++) { if (checkCancel) await checkCancel(); await new Promise(r => setTimeout(r, 1000)); }
                            continue;
                        } else if (error.type === 'RATE_LIMITED') {
                            retryCount++;
                            if (retryCount > MAX_RETRIES) throw new Error(`Query failed after ${MAX_RETRIES} retries due to strict HuggingFace limit.`);
                            console.warn(`⏳ [JotrilService] Query RATE_LIMITED. Waiting 10s before retrying (${retryCount}/${MAX_RETRIES})...`);
                            for (let s = 0; s < 10; s++) { if (checkCancel) await checkCancel(); await new Promise(r => setTimeout(r, 1000)); }
                            continue;
                        } else if (error.type === 'AUTH_ERROR') {
                            throw error; // Fatal
                        }
                    }
                    console.error('[JotrilService] Query item failed:', error.message);
                    results[idx] = null;
                    break; // Unrecoverable error (e.g. timeout), mark null and process next
                }
            }

            // Immediately dispatch live progress and free up the worker slot
            completedCount++;
            if (onProgress) {
                const pct = Math.round((completedCount / texts.length) * 100);
                onProgress(pct, `Query ${completedCount}/${texts.length}`);
            }

            if (batchDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }
    };

    // Spin up concurrent worker fleet
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, texts.length); i++) {
        workers.push(worker());
    }

    // Wait for the entire pool to drain
    await Promise.all(workers);

    return results;
}
