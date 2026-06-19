const fs = require('fs');
console.log('--- GRADIO PROXY ---');
console.log(fs.readFileSync('src/app/api/gradio-proxy/route.js', 'utf8').substring(0, 1000));
console.log('--- JOTRIL SERVICE ---');
console.log(fs.readFileSync('src/lib/jotrilService.js', 'utf8').substring(0, 1000));
