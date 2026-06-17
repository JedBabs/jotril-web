import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoSentences } from '../src/lib/chunking.js';

describe('splitIntoSentences', () => {
    it('splits simple sentences and filters very short fragments', () => {
        const text = 'This is the first sentence. This is the second sentence! And a third?';
        const sentences = splitIntoSentences(text);

        assert.ok(sentences.length >= 3);
        assert.match(sentences[0], /first sentence/);
    });

    it('returns an empty array for empty input', () => {
        assert.deepEqual(splitIntoSentences(''), []);
        assert.deepEqual(splitIntoSentences(null), []);
    });
});

describe('applySmartCap', () => {
    it('does not cap short documents', async () => {
        const { applySmartCap } = await import('../src/lib/chunking.js');
        const combinations = [
            { type: 'window-1', sentenceIndices: [0] },
            { type: 'window-5', sentenceIndices: [95, 96, 97, 98, 99] },
        ];

        const capped = applySmartCap(combinations, 80);
        assert.equal(capped.length, 2);
    });
});
