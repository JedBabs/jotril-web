const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
console.log(code.substring(code.indexOf('queryJotrilBatch'), code.indexOf('export async function predictBatch')));
