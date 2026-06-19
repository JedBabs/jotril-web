const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

code = code.replace(/const chunkJob = batchWindow\[0\];[\s\r\n]+const parentJob = this\.activeJobs\.get\(chunkJob\.jobId\);/, 'const chunkJob = batchWindow[0];');

fs.writeFileSync('src/lib/queue-manager.js', code);
console.log("Fixed cleanly!");
