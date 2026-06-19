const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

code = code.replace('import { queryJotrilModel, SPACES } from "\\.\/jotrilService.js";', 'import { queryJotrilModel, queryJotrilBatch, SPACES } from "./jotrilService.js";');

const loopTarget = 'const chunkJob = this.queue.shift();';
const loopReplace = 'if(this.queue.length === 0) break;\n            const batchWindow = [];\n            while(this.queue.length > 0 && batchWindow.length < 10) {\n                const peek = this.queue[0];\n                const p = this.activeJobs.get(peek.jobId);\n                if (!p) { this.queue.shift(); continue; }\n                batchWindow.push(this.queue.shift());\n            }\n            if(batchWindow.length === 0) continue;\n            const parentJob = this.activeJobs.get(batchWindow[0].jobId);\n            const chunkJob = batchWindow[0];';

code = code.replace(loopTarget, loopReplace);

const queryTarget = 'const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);';
const queryReplace = 'const texts = batchWindow.map(c => c.chunkData.text);\n                const batchResults = await queryJotrilBatch(texts, spaceName);\n                const result = batchResults[0]; // just for variable mock';

code = code.replace(queryTarget, queryReplace);

const matchSuccess = 'parentJob.results[chunkJob.chunkIndex] = result;\n                  parentJob.completedChunks += 1;\n                  this.telemetry.processedChunks += 1;';
const replaceSuccess = 'batchWindow.forEach((cJob, i) => {\n                      parentJob.results[cJob.chunkIndex] = batchResults[i] || null;\n                      parentJob.completedChunks += 1;\n                      this.telemetry.processedChunks += 1;\n                  });';

code = code.replace(matchSuccess, replaceSuccess);

const matchCatch = 'parentJob.results[chunkJob.chunkIndex] = null;\n                  parentJob.completedChunks += 1;';
const replaceCatch = 'batchWindow.forEach(cJob => {\n                      parentJob.results[cJob.chunkIndex] = null;\n                      parentJob.completedChunks += 1;\n                  });';

code = code.replace(matchCatch, replaceCatch);

fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Batching queue-manager natively success");
