const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
code = code.replace(/gradio_api\/call\/predict/g, 'gradio_api/call/batch');
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Fixed endpoint");
