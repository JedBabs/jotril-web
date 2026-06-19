const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

const badCode = `const chunkJob = batchWindow[0];

            const parentJob = this.activeJobs.get(chunkJob.jobId);`;

const goodCode = `const chunkJob = batchWindow[0];`;

code = code.replace(badCode, goodCode);
fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Fixed duplicate parentJob.");
