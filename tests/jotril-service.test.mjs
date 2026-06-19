import test from 'node:test';
import assert from 'node:assert/strict';
const { SPACES } = await import('../src/lib/jotrilService.js');

test('Jotril Service — SPACES array integrity', () => {
    assert.ok(Array.isArray(SPACES));
    assert.equal(SPACES.length, 2);
    assert.equal(SPACES[0], 'JedBabs/Jotril-Space-1');
    assert.equal(SPACES[1], 'JedBabs/Jotril-Space-2');
});

test('Jotril Service — Round-robin modulo distribution', () => {
    for (let i = 0; i < 20; i++) {
        const space = SPACES[i % SPACES.length];
        const expected = i % 2 === 0 ? SPACES[0] : SPACES[1];
        assert.equal(space, expected);
    }
});
