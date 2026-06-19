const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
let queryMatch = code.substring(code.indexOf('export async function queryJotrilModel'), code.indexOf('export async function predictBatch'));
console.log(queryMatch);
