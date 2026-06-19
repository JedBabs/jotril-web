const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');
code = code.replace(/console\.warn\(\[Auto-Sweeper\] Downscaling concurrency gracefully to: \);/g, "console.warn(`[Auto-Sweeper] Downscaling concurrency gracefully to: ${this.MAX_CONCURRENCY}`);");
fs.writeFileSync('src/lib/queue-manager.js', code);
