const fs = require('fs');
const p = 'src/lib/jotrilService.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/f'Bearer\s*\{process\.env\.NEXT_PUBLIC_HF_TOKEN\}'/g, '`Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`');
c = c.replace(/process\.env\.HF_TOKEN/g, 'process.env.NEXT_PUBLIC_HF_TOKEN');

// Just in case the previous python script wrote "f'Bearer {process.env.HF_TOKEN}'"
c = c.replace(/f'Bearer\s*\{process\.env\.HF_TOKEN\}'/g, '`Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`');

fs.writeFileSync(p, c);
console.log('Fixed token string mappings safely.');
