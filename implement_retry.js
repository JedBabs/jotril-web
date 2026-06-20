const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

// Inject the `retries: new Array(chunks.length).fill(0),` explicitly inside enqueueJob
code = code.replace(
    /results: new Array\(chunks.length\).fill\(null\),\s*originalChunks: chunks,/,
    "results: new Array(chunks.length).fill(null),\n            retries: new Array(chunks.length).fill(0),\n            originalChunks: chunks,"
);

// Completely replace the Auto-Sweeper check dynamically inside _runWorkerLoop
const targetBlock = `            // Finish check with Auto-Sweeper array parity
            if (parentJob.completedChunks >= parentJob.totalChunks) {
                if (parentJob.results.includes(null)) {
                    const droppedIndices = [];
                    parentJob.results.forEach((res, idx) => {
                        if (res === null) droppedIndices.push(idx);
                    });

                    parentJob.completedChunks -= droppedIndices.length;
                    
                    console.log("[Auto-Sweeper] Recovering", droppedIndices.length, "dropped packets synchronously");
                    this.telemetry.sweeperEngagements++;

                    const recoverJobs = droppedIndices.map(idx => ({
                        jobId: chunkJob.jobId,
                        chunkIndex: idx,
                        chunkData: parentJob.originalChunks[idx],
                        tier: 999 
                    }));

                    this.queue.unshift(...recoverJobs);
                    this._notify();
                    return; 
                }

                // If perfectly complete`;

const replaceBlock = `            // Finish check with Auto-Sweeper array parity
            if (parentJob.completedChunks >= parentJob.totalChunks) {
                // AUTO SWEEPER RETRY MECHANISM
                const droppedIndices = [];
                const MAX_SWEEPER_RETRIES = 3;

                parentJob.results.forEach((res, idx) => {
                    if (res === null) {
                        if (parentJob.retries[idx] >= MAX_SWEEPER_RETRIES) {
                            console.warn("[Auto-Sweeper] Chunk " + idx + " permanently failed. Skipping to unblock.");
                            // Fallback dummy result so the scan can finish
                            parentJob.results[idx] = { text: parentJob.originalChunks[idx].text, label: 'mixed', confidence: 0.5, error: true };
                        } else {
                            droppedIndices.push(idx);
                            parentJob.retries[idx]++; // Increment retry count
                        }
                    }
                });

                if (droppedIndices.length > 0) {
                    parentJob.completedChunks -= droppedIndices.length;
                    
                    console.log("[Auto-Sweeper] Recovering", droppedIndices.length, "dropped packets synchronously");
                    this.telemetry.sweeperEngagements++;

                    const recoverJobs = droppedIndices.map(idx => ({
                        jobId: chunkJob.jobId,
                        chunkIndex: idx,
                        chunkData: parentJob.originalChunks[idx],
                        tier: 999 
                    }));

                    this.queue.unshift(...recoverJobs);
                    this._notify();
                    return; 
                }

                // If perfectly complete`;

code = code.replace(targetBlock, replaceBlock);

fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Auto-Sweeper Retry Tracking injected locally!");
