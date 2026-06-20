const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
code = code.replace(/} catch\(e\) {/g, '} catch(e) { console.log(e);');
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Patched catch");
