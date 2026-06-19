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
    assert.equal(QueueManager.MAX_CONCURRENCY, 10, 'MAX_CONCURRENCY should be 10');
    assert.equal(QueueManager.estimatedLatencyMs, 1500, 'Latency estimate should be 1500ms');
    assert.ok(QueueManager.telemetry, 'Telemetry object should exist');
    assert.equal(typeof QueueManager.telemetry.edgeProxyCalls, 'number');
    assert.equal(typeof QueueManager.telemetry.sweeperRetries, 'number');
    assert.equal(typeof QueueManager.telemetry.connectionDrops, 'number');
    assert.equal(typeof QueueManager.telemetry.processedChunks, 'number');
});

test('Queue Manager — VIP Tier Preemption Sorting', async () => {
    // Reset state
    QueueManager.queue = [];
    QueueManager.activeJobs.clear();
    QueueManager.activeWorkers = 999; // Block workers from actually running

    const freeChunks = [{ text: 'free chunk' }];
    const proChunks = [{ text: 'pro chunk 1' }, { text: 'pro chunk 2' }];

    QueueManager.enqueueJob({ name: 'free.pdf' }, freeChunks, 1, () => { });
    QueueManager.enqueueJob({ name: 'pro.pdf' }, proChunks, 3, () => { });

    // Pro (tier 3) must be sorted before Free (tier 1)
    assert.equal(QueueManager.queue[0].tier, 3, 'First queued chunk should be tier 3');
    assert.equal(QueueManager.queue[1].tier, 3, 'Second queued chunk should be tier 3');
    assert.equal(QueueManager.queue[2].tier, 1, 'Last queued chunk should be tier 1');

    // Cleanup
    QueueManager.queue = [];
    QueueManager.activeJobs.clear();
    QueueManager.activeWorkers = 0;
});

test('Queue Manager — ETA Math (getGlobalQueueDepthMs)', async () => {
    QueueManager.queue = new Array(20).fill({ tier: 1 }); // 20 fake chunks
    // Expected: (20 / 10) * 1500 = 3000ms
    assert.equal(QueueManager.getGlobalQueueDepthMs(), 3000);

    QueueManager.queue = new Array(100).fill({ tier: 1 }); // 100 fake chunks
    // Expected: (100 / 10) * 1500 = 15000ms
    assert.equal(QueueManager.getGlobalQueueDepthMs(), 15000);

    QueueManager.queue = [];
    assert.equal(QueueManager.getGlobalQueueDepthMs(), 0);
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
