import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisStream } from '../src/lib/parse-analysis-stream.js';

function makeStream(chunks) {
    const encoder = new TextEncoder();
    let index = 0;

    return {
        getReader() {
            return {
                async read() {
                    if (index >= chunks.length) {
                        return { done: true, value: undefined };
                    }
                    const value = encoder.encode(chunks[index]);
                    index += 1;
                    return { done: false, value };
                },
            };
        },
    };
}

describe('parseAnalysisStream', () => {
    it('parses event and data split across chunks', async () => {
        const events = [];
        const stream = makeStream([
            'event: complete\n',
            'data: {"chunks":[{"text":"Hello world."}],"breakdown":{},"overallLabel":"HUMAN WRITTEN"}\n\n',
        ]);

        await parseAnalysisStream(stream.getReader(), {
            onComplete: (data) => events.push(data),
        });

        assert.equal(events.length, 1);
        assert.equal(events[0].overallLabel, 'HUMAN WRITTEN');
        assert.equal(events[0].chunks[0].text, 'Hello world.');
    });

    it('handles progress and error events in one stream', async () => {
        const progress = [];
        const errors = [];

        const stream = makeStream([
            'event: progress\n',
            'data: {"progress":40,"step":"Working"}\n\n',
            'event: error\n',
            'data: {"error":"Quota exceeded","limitExceeded":true}\n\n',
        ]);

        await parseAnalysisStream(stream.getReader(), {
            onProgress: (data) => progress.push(data),
            onError: (data) => errors.push(data),
        });

        assert.equal(progress.length, 1);
        assert.equal(progress[0].progress, 40);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].limitExceeded, true);
    });

    it('flushes the final buffer when the stream ends without a trailing newline', async () => {
        const events = [];
        const stream = makeStream([
            'event: complete\ndata: {"chunks":[],"breakdown":{},"overallLabel":"MIXED"}',
        ]);

        await parseAnalysisStream(stream.getReader(), {
            onComplete: (data) => events.push(data),
        });

        assert.equal(events.length, 1);
        assert.equal(events[0].overallLabel, 'MIXED');
    });
});
