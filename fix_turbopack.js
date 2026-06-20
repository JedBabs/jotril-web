const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

// The file got tangled up because my targetBlock replaceBlock didn't perfectly match
// it seems it double-appended or the string was already broken.
// I'll rewrite the complete _runWorkerLoop() exactly!
const match = code.substring(code.indexOf("async _runWorkerLoop()"), code.lastIndexOf("    getGlobalQueueDepthMs"));

const correctLoop = `async _runWorkerLoop() {
        while (this.queue.length > 0) {
            const chunkJob = this.queue.shift();

            const parentJob = this.activeJobs.get(chunkJob.jobId);
            if (!parentJob) continue;

            try {
                const spaceName = SPACES[(chunkJob.chunkIndex) % SPACES.length];
                this.telemetry.activeConnections++;
                
                const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);

                if (!result || result.error) throw new Error("Null or errored result from API");

                parentJob.results[chunkJob.chunkIndex] = result;
                parentJob.completedChunks += 1;
                this.telemetry.processedChunks += 1;

            } catch (err) {
                console.error("Queue chunk " + chunkJob.chunkIndex + " execution failed:", err.message);
                parentJob.results[chunkJob.chunkIndex] = null;
                parentJob.completedChunks += 1;
            } finally {
                this.telemetry.activeConnections--;
            }

            this._notify();

            // Finish check with Auto-Sweeper array parity
            if (parentJob.completedChunks >= parentJob.totalChunks) {
                // AUTO SWEEPER RETRY MECHANISM
                const droppedIndices = [];
                const MAX_SWEEPER_RETRIES = 3;

                parentJob.results.forEach((res, idx) => {
                    if (res === null) {
                        if (parentJob.retries[idx] >= MAX_SWEEPER_RETRIES) {
                            console.warn("[Auto-Sweeper] Chunk " + idx + " permanently failed. Skipping to unblock.");
                            parentJob.results[idx] = { text: parentJob.originalChunks[idx].text, label: 'mixed', confidence: 0.5, error: true };
                        } else {
                            droppedIndices.push(idx);
                            parentJob.retries[idx]++; 
                        }
                    }
                });

                if (droppedIndices.length > 0) {
                    parentJob.completedChunks -= droppedIndices.length;
                    
                    console.warn(\`[Auto-Sweeper] Recovering \${droppedIndices.length} dropped packets synchronously\`);
                    
                    if (this.telemetry.sweeperRetries === undefined) this.telemetry.sweeperRetries = 0;
                    this.telemetry.sweeperRetries += droppedIndices.length;
                    
                    if (this.telemetry.sweeperEngagements === undefined) this.telemetry.sweeperEngagements = 0;
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

                // If perfectly complete
                if (parentJob.onScanComplete) {
                    parentJob.onScanComplete(parentJob.results);
                }
                this.activeJobs.delete(chunkJob.jobId);
            }
        }

        this.activeWorkers--;
    }

`;

code = code.replace(match, correctLoop);
fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Syntactical Turbopack fixes applied gracefully!");
