const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');
const lines = code.split('\n');
const idx = lines.findIndex(l => l.includes('await queryJotrilBatch'));
console.log(JSON.stringify(lines.slice(idx-2, idx+3), null, 2));
