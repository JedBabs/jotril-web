const fs = require('fs');

let qm = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

qm = qm.replace('import { queryJotrilModel, SPACES } from "\\.\/jotrilService.js";', 'import { queryJotrilModel, queryJotrilBatch, SPACES } from "./jotrilService.js";');

const loopTarget =             const chunkJob = this.queue.shift();

            const parentJob = this.activeJobs.get(chunkJob.jobId);
            if (!parentJob) continue;;

const loopReplace =             if(this.queue.length === 0) break;
            const batchWindow = [];
            while(this.queue.length > 0 && batchWindow.length < 10) {
                const peek = this.queue[0];
                const p = this.activeJobs.get(peek.jobId);
                if (!p) { this.queue.shift(); continue; }
                batchWindow.push(this.queue.shift());
            }
            if(batchWindow.length === 0) continue;
            const parentJob = this.activeJobs.get(batchWindow[0].jobId);
;

qm = qm.replace(loopTarget, loopReplace);

const queryTarget =                 const spaceName = SPACES[(chunkJob.chunkIndex) % SPACES.length];
                const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);

                if (!result || result.error) throw new Error("Null or errored result from API");

                parentJob.results[chunkJob.chunkIndex] = result;
                parentJob.completedChunks += 1;
                this.telemetry.processedChunks += 1;;

const queryReplace =                 const spaceName = SPACES[Math.floor(Math.random() * SPACES.length)];
                
                // Fire batch of 10 chunks!
                const texts = batchWindow.map(c => c.chunkData.text);
                const batchResults = await queryJotrilBatch(texts, spaceName);
                
                if (!batchResults || !Array.isArray(batchResults)) {
                    throw new Error("Batch API Error or non-array returned natively");
                }

                batchWindow.forEach((cJob, i) => {
                    parentJob.results[cJob.chunkIndex] = batchResults[i] || null;
                    parentJob.completedChunks += 1;
                    this.telemetry.processedChunks += 1;
                });;
                
qm = qm.replace(queryTarget, queryReplace);

const catchTarget =             } catch (err) {
                console.error("Queue chunk " + chunkJob.chunkIndex + " execution completely failed natively:", err.message);
                parentJob.results[chunkJob.chunkIndex] = null;
                parentJob.completedChunks += 1;
            };

const catchReplace =             } catch (err) {
                console.error("Batch Queue execution completely failed natively:", err.message);
                batchWindow.forEach(cJob => {
                    parentJob.results[cJob.chunkIndex] = null;
                    parentJob.completedChunks += 1;
                });
            };

qm = qm.replace(catchTarget, catchReplace);

fs.writeFileSync('src/lib/queue-manager.js', qm);
console.log("Queue manager batched.");
