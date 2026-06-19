const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

if (!code.includes('sweepCount')) {
    code = code.replace(/parentJob = {\s*id:[^,]+,/g, "parentJob = { id: jobId, sweepCount: 0,");
    code = code.replace('if (droppedIndices.length > 0)', 'if (droppedIndices.length > 0 && parentJob.sweepCount < 3)');
    code = code.replace('const retryJobs = droppedIndices', 'parentJob.sweepCount = (parentJob.sweepCount || 0) + 1;\n                    const retryJobs = droppedIndices');
    code = code.replace('// AUTO SWEEPER RETRY MECHANISM', 'parentJob.sweepCount = parentJob.sweepCount || 0;\n                  // AUTO SWEEPER RETRY MECHANISM');
    fs.writeFileSync('src/lib/queue-manager.js', code);
    console.log("Added sweep limit.");
} else {
    console.log("Sweep limit already exists.");
}
