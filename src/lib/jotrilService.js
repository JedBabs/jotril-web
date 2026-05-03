/**
 * Jotril V2 Model Service
 * Centralized client for the Hugging Face Gradio spaces.
 * Handles load balancing, authentication, timeouts, retries, and response parsing.
 */

import { Client } from "@gradio/client";

const SPACES = [
    "JedBabs/Jotril-Space-1",
    "JedBabs/Jotril-Space-2"
];

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
 * Detects if an error response indicates the space is cold-starting.
 */
function isColdStartError(error) {
    const text = error.message || String(error);
    const markers = ['currently loading', 'building', 'is starting', 'is booting', 'sleeping', 'paused', 'starting', 'warming up'];
    return markers.some(m => text.toLowerCase().includes(m.toLowerCase()));
}

/**
 * Queries the Jotril model using load balancing between multiple spaces.
 * 
 * @param {string} text - The text to analyze
 * @param {string|null} preferredSpace - Optional space to try first (used for retries)
 * @returns {Promise<{aiScore: number, humanScore: number, label: string, confidence: object, spaceUsed: string}>}
 */
export async function queryJotrilModel(text, preferredSpace = null) {
    if (!process.env.HF_TOKEN) {
        throw new JotrilServiceError(
            'HF_TOKEN environment variable is not set. Add your HuggingFace token to .env',
            'AUTH_ERROR'
        );
    }

    // 1. Select a space (randomly or preferred)
    const selectedSpace = preferredSpace || SPACES[Math.floor(Math.random() * SPACES.length)];
    const otherSpace = SPACES.find(s => s !== selectedSpace);

    console.log(`📡 [JotrilService] Sending request to: ${selectedSpace}`);

    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Connect to the Gradio Space
            const app = await Client.connect(selectedSpace, {
                hf_token: process.env.HF_TOKEN
            });

            // Perform prediction
            // The "/predict" endpoint usually expects [text] as input
            const result = await app.predict("/predict", [text]);

            // V2 Format expected by frontend: [label_obj, score_pct, score_decimal]
            // result.data[0] = Label dict (Human vs AI)
            // result.data[1] = Confidence percentage
            // result.data[2] = AI Probability meter (0-1)

            if (result && result.data && result.data.length >= 3) {
                const aiScore = result.data[2];
                return {
                    aiScore: typeof aiScore === 'number' ? aiScore : 0,
                    humanScore: typeof aiScore === 'number' ? 1 - aiScore : 1,
                    label: aiScore >= 0.5 ? 'AI GENERATED' : 'HUMAN WRITTEN',
                    confidence: result.data[0] || {},
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
                if (otherSpace && preferredSpace !== otherSpace) {
                    console.log(`🔄 [JotrilService] Swapping to fallback space: ${otherSpace}`);
                    return queryJotrilModel(text, otherSpace);
                }

                throw new JotrilServiceError(
                    'The Jotril engine is warming up. This takes about 30-60 seconds.',
                    'COLD_START',
                    30
                );
            }

            // Handle Rate Limiting
            if (error.message?.includes('429')) {
                if (otherSpace && preferredSpace !== otherSpace) {
                    console.log(`🔄 [JotrilService] Rate limited on ${selectedSpace}, swapping to fallback: ${otherSpace}`);
                    return queryJotrilModel(text, otherSpace);
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
    if (otherSpace && preferredSpace !== otherSpace) {
        console.log(`🚨 [JotrilService] All retries failed on ${selectedSpace}. Final fallback to ${otherSpace}`);
        return queryJotrilModel(text, otherSpace);
    }

    throw lastError instanceof JotrilServiceError ? lastError : new JotrilServiceError(lastError.message || 'Model prediction failed', 'MODEL_ERROR');
}

/**
 * Batch-processes multiple texts through the model with concurrency control.
 *
 * @param {string[]} texts - Array of text strings to analyze
 * @param {number} concurrency - Max concurrent requests
 * @param {number} batchDelay - Delay between batches in ms
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
                if (error instanceof JotrilServiceError &&
                    (error.type === 'COLD_START' || error.type === 'AUTH_ERROR')) {
                    throw error;
                }
                console.error('[JotrilService] Batch item failed:', error.message);
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        if (i + concurrency < texts.length && batchDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    return results;
}
