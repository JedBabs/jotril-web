/**
 * Jotril V2 Model Service
 * Centralized client for the private Gradio space on Hugging Face.
 * Handles authentication, timeouts, retries, cold-start detection, and response parsing.
 */

const GRADIO_BASE = "https://jedbabs-jotril-v2.hf.space";
const REQUEST_TIMEOUT_MS = 90_000; // 90s — generous for free-tier cold starts
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

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
 * Creates an AbortController that auto-aborts after the given timeout.
 */
function createTimeoutController(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, clear: () => clearTimeout(timer) };
}

/**
 * Builds the authorization headers for HuggingFace API calls.
 * Both submit and result-fetch calls need the Bearer token for private spaces.
 */
function getAuthHeaders(includeContentType = false) {
    const headers = {};
    if (process.env.HF_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;
    }
    if (includeContentType) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

/**
 * Detects if an error response indicates the space is cold-starting.
 */
function isColdStartError(text) {
    const markers = ['currently loading', 'building', 'is starting', 'is booting', 'sleeping', 'paused', 'starting'];
    return markers.some(m => text.toLowerCase().includes(m.toLowerCase()));
}

/**
 * Parses the Gradio SSE stream response to extract the model result.
 *
 * Gradio returns Server-Sent Events in this format:
 *   event: complete
 *   data: [{"HUMAN WRITTEN": 0.052, "AI GENERATED": 0.948}, 94.80, 0.948]
 *
 * We need to extract the data line and parse the JSON array.
 */
function parseSSEResponse(sseText) {
    // Check for error events first
    const errorMatch = sseText.match(/^event:\s*error\s*\ndata:\s*(.+)$/m);
    if (errorMatch) {
        throw new JotrilServiceError(
            `Model returned error: ${errorMatch[1].substring(0, 200)}`,
            'MODEL_ERROR'
        );
    }

    // Gradio can send multiple events (e.g. heartbeat, generating, complete).
    // The first one might be `data: null`. We need to extract all data lines and find the valid final payload.
    const dataMatches = [...sseText.matchAll(/^data:\s*(.+)$/gm)];
    if (!dataMatches || dataMatches.length === 0) {
        throw new JotrilServiceError(
            'No data found in Gradio SSE response',
            'MODEL_ERROR'
        );
    }

    let parsed = null;
    // Iterate backwards since the final 'complete' event is at the end
    for (let i = dataMatches.length - 1; i >= 0; i--) {
        try {
            const p = JSON.parse(dataMatches[i][1]);
            if (p !== null) {
                parsed = p;
                break;
            }
        } catch (e) {
            // ignore JSON parse errors on intermediate chunks
        }
    }

    if (!parsed) {
        throw new JotrilServiceError(
            'Valid JSON data not found in Gradio SSE response',
            'MODEL_ERROR'
        );
    }

    // V2 Format: [label_obj, score_pct, score_decimal]
    // label_obj: {"HUMAN WRITTEN": 0.052, "AI GENERATED": 0.948}
    // score_pct: 94.80
    // score_decimal: 0.948
    if (Array.isArray(parsed) && parsed.length >= 3) {
        const labelObj = parsed[0];
        const aiScore = parsed[2]; // Raw 0-1 AI probability

        return {
            aiScore: typeof aiScore === 'number' ? aiScore : 0,
            humanScore: typeof aiScore === 'number' ? 1 - aiScore : 1,
            label: aiScore >= 0.5 ? 'AI GENERATED' : 'HUMAN WRITTEN',
            confidence: labelObj || {}
        };
    }

    throw new JotrilServiceError(
        `Unexpected response format: ${JSON.stringify(parsed).substring(0, 200)}`,
        'MODEL_ERROR'
    );
}

/**
 * Queries the Jotril V2 model with a single text input.
 * Handles the full Gradio submit → poll SSE → parse flow.
 *
 * @param {string} text - The text to analyze
 * @returns {Promise<{aiScore: number, humanScore: number, label: string, confidence: object}>}
 * @throws {JotrilServiceError} with type indicating the failure category
 */
export async function queryJotrilModel(text) {
    if (!process.env.HF_TOKEN) {
        throw new JotrilServiceError(
            'HF_TOKEN environment variable is not set. Add your HuggingFace token to .env',
            'AUTH_ERROR'
        );
    }

    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Step 1: Submit the prediction request
            const submitTimeout = createTimeoutController(REQUEST_TIMEOUT_MS);
            let submitRes;
            try {
                submitRes = await fetch(`${GRADIO_BASE}/gradio_api/call/predict`, {
                    method: 'POST',
                    headers: getAuthHeaders(true),
                    body: JSON.stringify({ data: [text] }),
                    signal: submitTimeout.controller.signal
                });
            } finally {
                submitTimeout.clear();
            }

            // Check if the response is JSON
            const contentType = submitRes.headers.get('content-type') || '';
            const rawBody = await submitRes.text();

            if (!submitRes.ok || !contentType.includes('application/json')) {
                // Cold start detection from response body or generic error
                if (isColdStartError(rawBody) || submitRes.status === 503 || submitRes.status === 504) {
                    throw new JotrilServiceError(
                        'The Jotril V2 engine is warming up. This takes about 30-60 seconds on the first request.',
                        'COLD_START',
                        30
                    );
                }

                // Auth errors
                if (submitRes.status === 401 || submitRes.status === 403) {
                    throw new JotrilServiceError(
                        `Authentication failed (${submitRes.status}). Check that your HF_TOKEN is valid.`,
                        'AUTH_ERROR'
                    );
                }

                // Rate limiting
                if (submitRes.status === 429) {
                    throw new JotrilServiceError(
                        'Rate limited by HuggingFace. Please wait a moment.',
                        'RATE_LIMITED',
                        10
                    );
                }

                throw new JotrilServiceError(
                    `Gradio submit failed (${submitRes.status}). The engine may be offline or sleeping.`,
                    'MODEL_ERROR'
                );
            }

            let event_id;
            try {
                const json = JSON.parse(rawBody);
                event_id = json.event_id;
            } catch (e) {
                throw new JotrilServiceError('Failed to parse Gradio response as JSON', 'MODEL_ERROR');
            }

            if (!event_id) {
                throw new JotrilServiceError('No event_id returned from Gradio', 'MODEL_ERROR');
            }

            // Step 2: Fetch the result via SSE stream
            const resultTimeout = createTimeoutController(REQUEST_TIMEOUT_MS);
            let resultRes;
            try {
                resultRes = await fetch(`${GRADIO_BASE}/gradio_api/call/predict/${event_id}`, {
                    headers: getAuthHeaders(false),
                    signal: resultTimeout.controller.signal
                });
            } finally {
                resultTimeout.clear();
            }

            if (!resultRes.ok) {
                const errText = await resultRes.text();
                if (resultRes.status === 503 || isColdStartError(errText)) {
                    throw new JotrilServiceError(
                        'The Jotril V2 engine is warming up.',
                        'COLD_START',
                        30
                    );
                }
                throw new JotrilServiceError(
                    `Gradio result fetch failed (${resultRes.status})`,
                    'MODEL_ERROR'
                );
            }

            const sseText = await resultRes.text();
            return parseSSEResponse(sseText);

        } catch (error) {
            lastError = error;

            // Don't retry auth errors — they won't resolve by retrying
            if (error instanceof JotrilServiceError && error.type === 'AUTH_ERROR') {
                throw error;
            }

            // Abort errors = timeout
            if (error.name === 'AbortError') {
                lastError = new JotrilServiceError(
                    'Request timed out. The model may be cold-starting or under heavy load.',
                    'COLD_START',
                    30
                );
            }

            // If we have retries left, wait with exponential backoff
            if (attempt < MAX_RETRIES - 1) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                console.warn(`[JotrilService] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new JotrilServiceError('All retry attempts exhausted', 'MODEL_ERROR');
}

/**
 * Batch-processes multiple texts through the model with concurrency control.
 *
 * @param {string[]} texts - Array of text strings to analyze
 * @param {number} concurrency - Max concurrent requests (default 3 for free-tier)
 * @param {number} batchDelay - Delay between batches in ms (default 300 for free-tier)
 * @returns {Promise<Array<{aiScore: number, humanScore: number, label: string} | null>>}
 */
export async function batchQueryModel(texts, concurrency = 3, batchDelay = 300) {
    const results = [];

    for (let i = 0; i < texts.length; i += concurrency) {
        const batch = texts.slice(i, i + concurrency);
        const batchPromises = batch.map(async (text) => {
            try {
                return await queryJotrilModel(text);
            } catch (error) {
                // If it's a cold start or auth error, propagate immediately
                if (error instanceof JotrilServiceError &&
                    (error.type === 'COLD_START' || error.type === 'AUTH_ERROR')) {
                    throw error;
                }
                console.error('[JotrilService] Batch item failed:', error.message);
                return null; // Return null for individual failures
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Inter-batch delay to avoid overwhelming the free-tier space
        if (i + concurrency < texts.length && batchDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    return results;
}
