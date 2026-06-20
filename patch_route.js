const fs = require('fs');
let code = fs.readFileSync('src/app/api/gradio-proxy/route.js', 'utf8');

// I will natively log the EXACT raw body being fetched by NextJS Edge Route!
code = code.replace("        const hfResponse = await fetch(targetUrl, options);", 
`        // Log what we are sending!
        console.log("SENDING HEADERS:", options.headers);
        console.log("SENDING BODY:", options.body);
        const hfResponse = await fetch(targetUrl, options);`);

fs.writeFileSync('src/app/api/gradio-proxy/route.js', code);
console.log("Proxy injected!");
