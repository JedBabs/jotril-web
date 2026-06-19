const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');

const badUrl = 'const submitUrl = https://.hf.space/gradio_api/call/predict;';
const goodUrl = 'const submitUrl = `https://${spaceName.replace("/", "-")}.hf.space/gradio_api/call/predict`;';

code = code.replace(badUrl, goodUrl);
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("jotrilService fixed!");
