const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

// Revert import back to original
code = code.replace(
  "import { queryJotrilModel, queryJotrilBatch, SPACES } from './jotrilService.js';",
  "import { queryJotrilModel, SPACES } from './jotrilService.js';"
);

// Find and replace the entire batch window logic back to the simple single-chunk flow
// The batch code starts with "if(this.queue.length === 0) break;" and ends before the try block
const batchBlock = /if\(this\.queue\.length === 0\) break;\s*const batchWindow = \[\];[\s\S]*?const chunkJob = batchWindow\[0\];/;
code = code.replace(batchBlock, "const chunkJob = this.queue.shift();");

// Restore parentJob
code = code.replace(
  /if\(batchWindow\.length === 0\) continue;\s*const parentJob = this\.activeJobs\.get\(batchWindow\[0\]\.jobId\);\s*/,
  ''
);

// Restore single query call
code = code.replace(
  /const texts = batchWindow\.map\(c => c\.chunkData\.text\);\s*const batchResults = await queryJotrilBatch\(texts, spaceName\);\s*const result = batchResults\[0\]; \/\/ just for variable mock/,
  "const result = await queryJotrilModel(chunkJob.chunkData.text, spaceName);"
);

// Restore single result assignment
code = code.replace(
  /if \(!result \|\| result\.error\) throw new Error\("Null or errored result from API"\);\s*if \(!batchResults \|\| !Array\.isArray\(batchResults\)\)[\s\S]*?batchWindow\.forEach[\s\S]*?this\.telemetry\.processedChunks \+= 1;\s*\}\);/,
  'if (!result || result.error) throw new Error("Null or errored result from API");\n\n                parentJob.results[chunkJob.chunkIndex] = result;\n                parentJob.completedChunks += 1;\n                this.telemetry.processedChunks += 1;'
);

// Try simpler replacements for the result/catch blocks
code = code.replace(
  /batchWindow\.forEach\(\(cJob, i\) => \{\s*parentJob\.results\[cJob\.chunkIndex\] = batchResults\[i\] \|\| null;\s*parentJob\.completedChunks \+= 1;\s*this\.telemetry\.processedChunks \+= 1;\s*\}\);/g,
  'parentJob.results[chunkJob.chunkIndex] = result;\n                parentJob.completedChunks += 1;\n                this.telemetry.processedChunks += 1;'
);

code = code.replace(
  /batchWindow\.forEach\(cJob => \{\s*parentJob\.results\[cJob\.chunkIndex\] = null;\s*parentJob\.completedChunks \+= 1;\s*\}\);/g,
  'parentJob.results[chunkJob.chunkIndex] = null;\n                parentJob.completedChunks += 1;'
);

// Fix error log message
code = code.replace(
  'console.error("Batch Queue execution completely failed natively:", err.message);',
  'console.error("Queue chunk " + chunkJob.chunkIndex + " execution failed:", err.message);'
);

// Add back parentJob declaration if missing after chunkJob
if (!code.includes('const parentJob = this.activeJobs.get(chunkJob.jobId);')) {
  code = code.replace(
    'const chunkJob = this.queue.shift();',
    'const chunkJob = this.queue.shift();\n\n            const parentJob = this.activeJobs.get(chunkJob.jobId);\n            if (!parentJob) continue;'
  );
}

fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Reverted to single-request flow successfully");
