const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
code = code.replace(/if \(rawResponse\.includes\(\"error\"\)\).*?/, 'if(rawResponse.includes("error")) { console.log(rawResponse); throw new Error("Batch API Error"); }');
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Patched");
