import test from 'node:test';
import assert from 'node:assert/strict';

test('Fingerprint Vector Generation (Headless Compatibility)', async () => {
    const { generateHardwareVector } = await import('../src/lib/fingerprint.js');

    // During headless node execution, this natively hits the SSR / Node environment bypass safely
    const v1 = await generateHardwareVector();
    const v2 = await generateHardwareVector();

    // Assert structural integrity of multi-hash object
    assert.equal(typeof v1, 'object');
    assert.equal(v1.hardwareConcurrency, 8);
    assert.equal(v1.canvasHash, 'headless-node-execution');
    assert.equal(v1.fontsHash, 'headless-node-execution');

    // Ensure deterministic serialization across identical Node invocations
    assert.deepEqual(v1, v2, 'Output vector should remain strictly deterministic');
});
