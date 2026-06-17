/**
 * Parses Server-Sent Events from /api/analyze.
 * Keeps event type across TCP chunks and flushes the final buffer.
 */

function processSseLine(line, currentEvent, handlers) {
    if (line.startsWith('event: ')) {
        return { event: line.substring(7).trim(), handled: false };
    }

    if (!line.startsWith('data: ')) {
        return { event: currentEvent, handled: false };
    }

    const dataStr = line.substring(6).trim();
    if (!dataStr) {
        return { event: currentEvent, handled: false };
    }

    try {
        const data = JSON.parse(dataStr);

        if (currentEvent === 'progress') {
            handlers.onProgress?.(data);
        } else if (currentEvent === 'complete') {
            handlers.onComplete?.(data);
        } else if (currentEvent === 'error') {
            handlers.onError?.(data);
        }
    } catch (error) {
        handlers.onParseError?.(error, dataStr);
    }

    return { event: currentEvent, handled: true };
}

/**
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @param {{
 *   onProgress?: (data: object) => void,
 *   onComplete?: (data: object) => void,
 *   onError?: (data: object) => void,
 *   onParseError?: (error: Error, raw: string) => void,
 * }} handlers
 */
export async function parseAnalysisStream(reader, handlers) {
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = null;

    const consumeLines = (lines, flushAll = false) => {
        const pending = flushAll ? lines : lines.slice(0, -1);
        const remainder = flushAll ? '' : (lines.at(-1) ?? '');

        for (const rawLine of pending) {
            const line = rawLine.replace(/\r$/, '');
            const result = processSseLine(line, currentEvent, handlers);
            if (result.event !== currentEvent) {
                currentEvent = result.event;
            }
        }

        return remainder;
    };

    while (true) {
        const { done, value } = await reader.read();

        if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = consumeLines(lines);
        }

        if (done) {
            if (buffer.trim()) {
                consumeLines(buffer.split('\n'), true);
            }
            break;
        }
    }
}
