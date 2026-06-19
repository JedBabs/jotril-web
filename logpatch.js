const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');
code = code.replace(/console\.error\("Queue chunk execution failure:", err\);/g, 'console.error("Queue chunk " + chunkJob.chunkIndex + " execution completely failed natively:", err.message);');
fs.writeFileSync('src/lib/queue-manager.js', code);
