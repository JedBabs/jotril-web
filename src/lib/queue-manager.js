/**
 * Global Jotril Queue Manager - High Concurrency Load Balancer
 * Coordinates all chunk processing natively utilizing a bounded concurrency pool
 * and priority preemption queues. Includes Auto-Sweeper and Telemetry Hooks.
 */
import { queryJotrilModel, SPACES, proxyStats } from './jotrilService.js';

class JotrilQueueManager {
    constructor() {
        if (!JotrilQueueManager.instance) {
            this.queue = [];
            this.activeJobs = new Map();
            this.activeWorkers = 0;
            // CPU Spaces queue stacked requests efficiently (validated ~30 concurrent/Space),
            // so total concurrency scales with the Space pool: 30 × SPACES.length.
            // Distribution is even (chunkIndex % SPACES.length) → ~PER_SPACE_CONCURRENCY each.
            // The auto-sweeper downscales MAX_CONCURRENCY on drops as the safety valve.
            this.PER_SPACE_CONCURRENCY = 30;
            this.MAX_CONCURRENCY = this.PER_SPACE_CONCURRENCY * SPACES.length; // 30 × 2 = 60
            this.listeners = new Set();
            this.telemetry = {
                processedChunks: 0,
                connectionDrops: 0,
                sweeperRetries: 0,
                sweeperEngagements: 0,
                edgeProxyCalls: 0 // Tracks against Vercel 100K daily limit!
            };

            // Expected latency per chunk (estimated 1200ms API round trip)
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
            // calculateJobETA returns MILLISECONDS — convert to seconds for display
            // (the bug behind "408:40": 24520ms was shown as 24520s = 408m40s).
            etaSeconds: Math.ceil(this.calculateJobETA(job.id) / 1000),
            tier: job.tier
        }));

        // Reflect the honest proxy-call tally (submit + every poll) for the dev overlay.
        this.telemetry.edgeProxyCalls = proxyStats.calls;

        for (const listener of this.listeners) {
            listener({ jobs: payload, telemetry: this.telemetry });
        }
    }

    cancelJob(jobId) {
        // Mark the job cancelled BEFORE removing it. A worker may already be awaiting
        // an in-flight query for this job; it holds a reference to the job object, so
        // the flag lets _runWorkerLoop skip the completion callback when it returns.
        const job = this.activeJobs.get(jobId);
        if (job) job.cancelled = true;
        this.activeJobs.delete(jobId);
        this.queue = this.queue.filter(j => j.jobId !== jobId);
        this._notify();
    }

    /**
     * Returns ETA in milliseconds for a specific job, or for the full pending queue
     * when jobId is unknown/absent (used by useAnalyze as "future" ETA).
     */
    calculateJobETA(jobId) {
        const workers = Math.max(1, this.activeWorkers);
        if (!jobId || !this.activeJobs.has(jobId)) {
            return Math.ceil(this.queue.length * this.estimatedLatencyMs / workers);
        }
        const job = this.activeJobs.get(jobId);
        const remaining = job.totalChunks - job.completedChunks;
        return Math.ceil(remaining * this.estimatedLatencyMs / workers);
    }

    /**
     * Registers a new analysis job, populates the queue, and spawns workers.
     *
     * @param {File|{name: string}} fileOrMeta - File object or name metadata
     * @param {Array<{text: string}>} chunkDataArray - Sentence chunks to process
     * @param {number} tier - Priority tier (higher = processed first)
     * @param {function} onScanComplete - Callback fired with full results array
     * @returns {string} jobId
     */
    enqueueJob(fileOrMeta, chunkDataArray, tier, onScanComplete) {
        const jobId = crypto.randomUUID();

        this.activeJobs.set(jobId, {
            id: jobId,
            filename: fileOrMeta?.name || 'Pasted Text',
            totalChunks: chunkDataArray.length,
            completedChunks: 0,
            results: new Array(chunkDataArray.length).fill(null),
            originalChunks: chunkDataArray,
            retries: new Array(chunkDataArray.length).fill(0), // per-chunk retry counter
            tier: tier || 1,
            onScanComplete
        });

        for (let i = 0; i < chunkDataArray.length; i++) {
            this.queue.push({
                jobId,
                chunkIndex: i,
                chunkData: chunkDataArray[i],
                tier: tier || 1
            });
        }

        this.queue.sort((a, b) => b.tier - a.tier);

        // Spawn workers up to MAX_CONCURRENCY. Stagger their starts: if all 60 fire
        // their query at once they also COMPLETE in lockstep, so the queue empties in
        // visible 60-chunk waves with a lull (all in-flight, nothing finishing) between
        // them. Spreading starts over ~500ms desyncs completions → smooth progress.
        const toSpawn = Math.min(this.MAX_CONCURRENCY - this.activeWorkers, this.queue.length);
        const spread = 500; // ms
        for (let i = 0; i < toSpawn; i++) {
            this.activeWorkers++;
            const jitter = toSpawn > 1 ? Math.floor((i / toSpawn) * spread) : 0;
            if (jitter === 0) this._runWorkerLoop();
            else setTimeout(() => this._runWorkerLoop(), jitter);
        }

        this._notify();
        return jobId;
    }

    async _runWorkerLoop() {
        while (this.queue.length > 0) {
            const chunkJob = this.queue.shift();

            const parentJob = this.activeJobs.get(chunkJob.jobId);
            if (!parentJob) continue;

            // edgeProxyCalls is synced from the honest per-request tally in _notify
            // (each query = 1 submit + ≥1 poll), not incremented once per query here.

            try {
                // Pick a Space using (chunkIndex + retryCount) so a sweeper-reinjected
                // chunk starts on a DIFFERENT Space than the one that just failed it.
                // Without this offset, a dead Space-N would keep eating its same ⅓
                // share on every sweeper pass.
                const attempt = parentJob.retries[chunkJob.chunkIndex] || 0;
                const spaceName = SPACES[(chunkJob.chunkIndex + attempt) % SPACES.length];
                const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);

                if (!result || result.error) throw new Error("Null or errored result from API");

                parentJob.results[chunkJob.chunkIndex] = result;
                parentJob.completedChunks += 1;
                this.telemetry.processedChunks += 1;

            } catch (err) {
                console.error(`Queue chunk ${chunkJob.chunkIndex} execution failed:`, err.message);
                parentJob.results[chunkJob.chunkIndex] = null;
                parentJob.completedChunks += 1;
                this.telemetry.connectionDrops += 1;
            }

            this._notify();

            // Job was cancelled mid-flight — stop touching it, don't sweep or callback.
            if (parentJob.cancelled) {
                this.activeJobs.delete(chunkJob.jobId);
                continue;
            }

            // Finish check with Auto-Sweeper array parity
            if (parentJob.completedChunks >= parentJob.totalChunks) {
                const MAX_SWEEPER_RETRIES = 3;
                const droppedIndices = [];

                parentJob.results.forEach((res, idx) => {
                    if (res === null) {
                        if (parentJob.retries[idx] >= MAX_SWEEPER_RETRIES) {
                            // Permanently failed chunk — substitute fallback to unblock the job
                            console.warn(`[Auto-Sweeper] Chunk ${idx} permanently failed after ${MAX_SWEEPER_RETRIES} retries. Substituting fallback.`);
                            parentJob.results[idx] = {
                                text: parentJob.originalChunks[idx].text,
                                label: 'mixed',
                                confidence: 0.5,
                                error: true
                            };
                        } else {
                            droppedIndices.push(idx);
                            parentJob.retries[idx]++;
                        }
                    }
                });

                if (droppedIndices.length > 0) {
                    parentJob.completedChunks -= droppedIndices.length;

                    this.telemetry.sweeperRetries += droppedIndices.length;
                    this.telemetry.sweeperEngagements += 1;
                    this.MAX_CONCURRENCY = Math.max(10, Math.floor(this.MAX_CONCURRENCY / 1.5));

                    console.warn(`[Auto-Sweeper] Recovering ${droppedIndices.length} dropped chunks. Downscaling concurrency to: ${this.MAX_CONCURRENCY}`);

                    const recoverJobs = droppedIndices.map(idx => ({
                        jobId: chunkJob.jobId,
                        chunkIndex: idx,
                        chunkData: parentJob.originalChunks[idx],
                        tier: 999 // Absolute Highest Priority Preemption
                    }));

                    this.queue.unshift(...recoverJobs);
                    this.queue.sort((a, b) => b.tier - a.tier);
                    this._notify();
                    continue; // Loop organically picks up re-injected chunks
                }

                // All chunks complete — fire callback
                if (parentJob.onScanComplete) {
                    parentJob.onScanComplete(parentJob.results);
                }
                this.activeJobs.delete(chunkJob.jobId);
                this._notify();
            }
        }

        this.activeWorkers--;
    }
}

export const QueueManager = new JotrilQueueManager();
