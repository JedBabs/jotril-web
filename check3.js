const fs = require('fs');
let text = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
let queryMatch = text.substring(text.indexOf('export async function queryJotrilModel'), text.indexOf('export async function predictBatch'));
// Remove newlines and output cleanly
console.log(JSON.stringify(queryMatch));
