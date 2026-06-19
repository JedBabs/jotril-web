/**
 * Global Jotril Queue Manager - High Concurrency Load Balancer
 * Coordinates all chunk processing natively utilizing a bounded concurrency pool
 * and priority preemption queues. Includes Auto-Sweeper and Telemetry Hooks.
 */
import { queryJotrilModel, SPACES } from './jotrilService.js';

class JotrilQueueManager {
    constructor() {
        if (!JotrilQueueManager.instance) {
            this.queue = [];
            this.activeJobs = new Map();
            this.activeWorkers = 0;
            this.MAX_CONCURRENCY = 60; // 10 simultaneous chunks
            this.listeners = new Set();
            this.telemetry = {
                processedChunks: 0,
                connectionDrops: 0,
                sweeperRetries: 0,
                edgeProxyCalls: 0 // Tracks against Vercel 100K daily limit!
            };

            // Expected latency per chunk (estimated 1500ms API round trip)
            this.estimatedLatencyMs = 1200;

            JotrilQueueManager.instance = this;
        }
        return JotrilQueueManager.instance;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _notify() {
        const payload = Array.from(this.activeJobs.values()).map(job => ({
            jobId: job.id,
            filename: job.filename,
            total: job.totalChunks,
            completed: job.completedChunks,
            etaSeconds: this.calculateJobETA(job.id),
            tier: job.tier
        }));

        for (const listener of this.listeners) {
            listener({ jobs: payload, telemetry: this.telemetry });
        }
    }

    cancelJob(jobId) {
        this.activeJobs.delete(jobId);
        this.queue = this.queue.filter(j => j.jobId !== jobId);
        this._notify();
    }

    getGlobalQueueDepthMs() {
        return (this.queue.length / this.MAX_CONCURRENCY) * this.estimatedLatencyMs;
    }

    calculateJobETA(jobId) {
        const jobIndex = this.queue.findIndex(chunk => chunk.jobId === jobId);
        if (jobIndex === -1) {
            const job = this.activeJobs.get(jobId);
            if (!job) return 0;
            return Math.ceil((((job.totalChunks - job.completedChunks) / this.MAX_CONCURRENCY) * this.estimatedLatencyMs) / 1000);
        }

        return Math.ceil(((jobIndex / this.MAX_CONCURRENCY) * this.estimatedLatencyMs) / 1000);
    }

    enqueueJob(fileData, chunks, tier = 1, onScanComplete) {
        const jobId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

        this.activeJobs.set(jobId, {
            id: jobId,
            filename: fileData.name || 'Pasted Text',
            totalChunks: chunks.length,
            completedChunks: 0,
            results: new Array(chunks.length).fill(null),
            originalChunks: chunks, // Save for Sweeper
            tier: tier,
            onScanComplete
        });

        const chunkJobs = chunks.map((chunk, index) => ({
            jobId,
            chunkIndex: index,
            chunkData: chunk,
            tier: tier
        }));

        this.queue.push(...chunkJobs);
        this.queue.sort((a, b) => b.tier - a.tier);

        this._notify();
        this._spinUpWorkers();

        return jobId;
    }

    async _spinUpWorkers() {
        while (this.activeWorkers < this.MAX_CONCURRENCY && this.queue.length > 0) {
            this.activeWorkers++;
            this._runWorkerLoop().finally(() => {
                this.activeWorkers--;
                this._spinUpWorkers();
            });
        }
    }

    async _runWorkerLoop() {
        while (this.queue.length > 0) {
            const chunkJob = this.queue.shift();

            const parentJob = this.activeJobs.get(chunkJob.jobId);
            if (!parentJob) continue;

            this.telemetry.edgeProxyCalls++; // Log every single invocation sent to proxy!

            try {
                const spaceName = SPACES[(chunkJob.chunkIndex) % SPACES.length];
                const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);

                if (!result || result.error) throw new Error("Null or errored result from API");

                parentJob.results[chunkJob.chunkIndex] = result;
                parentJob.completedChunks += 1;
                this.telemetry.processedChunks += 1;

            } catch (err) {
                console.error("Queue chunk execution failure:", err);
                parentJob.results[chunkJob.chunkIndex] = null;
                parentJob.completedChunks += 1;
                this.telemetry.connectionDrops += 1;
            }

            this._notify();

            // Finish check with Auto-Sweeper array parity
            if (parentJob.completedChunks >= parentJob.totalChunks) {

                // AUTO SWEEPER RETRY MECHANISM
                const droppedIndices = [];
                parentJob.results.forEach((res, idx) => {
                    if (res === null) droppedIndices.push(idx);
                });

                if (droppedIndices.length > 0) {
                    console.log(`[Auto-Sweeper] Detected ${droppedIndices.length} drops! Injecting at Tier 999...`);
                    this.telemetry.sweeperRetries += droppedIndices.length;
                    this.MAX_CONCURRENCY = Math.max(10, Math.floor(this.MAX_CONCURRENCY / 1.5));
                    console.warn([Auto-Sweeper] Downscaling concurrency gracefully to: );

                    parentJob.completedChunks -= droppedIndices.length; // Rollback completion counter

                    const retryJobs = droppedIndices.map(idx => ({
                        jobId: parentJob.id,
                        chunkIndex: idx,
                        chunkData: parentJob.originalChunks[idx],
                        tier: 999 // Absolute Highest Priority Preemption
                    }));

                    this.queue.unshift(...retryJobs); // Unshift injects instantly to front of line!
                    this.queue.sort((a, b) => b.tier - a.tier);

                    this._notify();
                    continue; // Loop skips and picks up the injected chunks organically
                }

                if (parentJob.onScanComplete) {
                    parentJob.onScanComplete(parentJob.results);
                }
                this.activeJobs.delete(chunkJob.jobId);
                this._notify();
            }
        }
    }
}

export const QueueManager = new JotrilQueueManager();





