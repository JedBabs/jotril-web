const fs = require('fs');
let code = fs.readFileSync('src/lib/queue-manager.js', 'utf8');

const target = "import { queryJotrilModel, SPACES } from './jotrilService.js';";
const replacement = "import { queryJotrilModel, queryJotrilBatch, SPACES } from './jotrilService.js';";

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/lib/queue-manager.js', code);
    console.log("Import patched cleanly");
} else if (code.includes('queryJotrilBatch')) {
    console.log("Already has queryJotrilBatch somewhere in file.");
    // In case it used double quotes or something else:
    code = code.replace(/import\s*\{[^}]*SPACES[^}]*\}\s*from\s*['"].\/jotrilService.*?['"];?/, 
                        "import { queryJotrilModel, queryJotrilBatch, SPACES } from './jotrilService.js';");
    fs.writeFileSync('src/lib/queue-manager.js', code);
    console.log("Import patched via regex fallback");
} else {
    console.log("Could not find import statement to replace!");
}
