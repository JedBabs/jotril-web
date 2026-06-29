import test from 'node:test';
import assert from 'node:assert/strict';

// Stub fetch globally before importing QueueManager (it imports jotrilService which needs fetch)
let fetchCallCount = 0;
let fetchShouldFail = false;
globalThis.fetch = async (url, options) => {
    fetchCallCount++;
    if (fetchShouldFail) {
        return { ok: false, status: 500, text: async () => 'error' };
    }
    // Simulate the two-phase Gradio call pattern: POST returns event_id, GET returns data
    if (options?.method === 'POST') {
        return { ok: true, json: async () => ({ event_id: 'mock_event' }) };
    }
    // GET status polling
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('event: complete\ndata: [["AI", 0.9]]\n\n'));
            controller.close();
        }
    });
    return { ok: true, body: stream };
};

const { QueueManager } = await import('../src/lib/queue-manager.js');

test('Queue Manager — Singleton & Constants', async () => {
    assert.ok(QueueManager, 'QueueManager should exist');
    // MAX_CONCURRENCY = PER_SPACE_CONCURRENCY (30) × SPACES.length (3) = 90.
    assert.equal(QueueManager.MAX_CONCURRENCY, 90, 'MAX_CONCURRENCY should be 30 × 3 Spaces');
    assert.equal(QueueManager.estimatedLatencyMs, 1200, 'Latency estimate should be 1200ms');
    assert.ok(QueueManager.telemetry, 'Telemetry object should exist');
    assert.equal(typeof QueueManager.telemetry.edgeProxyCalls, 'number');
    assert.equal(typeof QueueManager.telemetry.sweeperRetries, 'number');
    assert.equal(typeof QueueManager.telemetry.connectionDrops, 'number');
    assert.equal(typeof QueueManager.telemetry.processedChunks, 'number');
});

test('Queue Manager — FIFO enqueue (no user-priority tier)', async () => {
    // Reset state
    QueueManager.queue = [];
    QueueManager.activeJobs.clear();
    QueueManager.activeWorkers = 999; // Block workers from actually running

    const firstChunks = [{ text: 'a1' }];
    const secondChunks = [{ text: 'b1' }, { text: 'b2' }];

    // enqueueJob signature is now (fileOrMeta, chunkDataArray, onScanComplete) — no tier.
    const id1 = QueueManager.enqueueJob({ name: 'first.pdf' }, firstChunks, () => { });
    const id2 = QueueManager.enqueueJob({ name: 'second.pdf' }, secondChunks, () => { });

    // All chunks queued in FIFO order; the `tier` field no longer exists.
    assert.equal(QueueManager.queue.length, 3, 'all 3 chunks queued');
    assert.equal(QueueManager.queue[0].jobId, id1, 'first job first');
    assert.equal(QueueManager.queue[1].jobId, id2, 'second job follows');
    assert.equal(QueueManager.queue[2].jobId, id2, 'second job follows');
    assert.equal(QueueManager.queue[0].tier, undefined, 'no tier field on queue items');

    // Cleanup
    QueueManager.queue = [];
    QueueManager.activeJobs.clear();
    QueueManager.activeWorkers = 0;
});

test('Queue Manager — ETA Math (calculateJobETA, no jobId)', async () => {
    // calculateJobETA(no jobId) = ceil(queue.length * estimatedLatencyMs / max(1, activeWorkers)).
    QueueManager.activeWorkers = 0; // → workers floor of 1
    QueueManager.queue = new Array(20).fill({ tier: 1 });
    assert.equal(QueueManager.calculateJobETA(), 20 * 1200); // 24000ms

    QueueManager.queue = new Array(100).fill({ tier: 1 });
    assert.equal(QueueManager.calculateJobETA(), 100 * 1200); // 120000ms

    QueueManager.queue = [];
    assert.equal(QueueManager.calculateJobETA(), 0);
});

test('Queue Manager — Subscribe & Notify', async () => {
    let received = null;
    const unsub = QueueManager.subscribe((payload) => { received = payload; });
    QueueManager._notify();
    assert.ok(received, 'Subscriber should receive payload');
    assert.ok(Array.isArray(received.jobs), 'Payload should have jobs array');
    assert.ok(received.telemetry, 'Payload should have telemetry');
    unsub();
    received = null;
    QueueManager._notify();
    assert.equal(received, null, 'After unsubscribe, should not receive');
});
