const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');

const tTarget = `            const response = await secureFetch(submitUrl, {
                method: "POST",
                body: JSON.stringify({ data: [texts] })
            });`;

const tReplace = `            const response = await secureFetch(submitUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: [texts] })
            });`;

code = code.replace(tTarget, tReplace);
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Headers patched cleanly!");
