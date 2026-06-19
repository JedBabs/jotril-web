const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
code = code.replace(/function queryJotrilModel\([\s\S]*?hf\.space\/gradio_api\/call\/batch/m, (match) => match.replace('call/batch', 'call/predict'));
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Restored single endpoint");
