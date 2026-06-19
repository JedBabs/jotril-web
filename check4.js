const fs = require('fs');
let text = fs.readFileSync('src/lib/jotrilService.js', 'utf8');
let queryMatch = text.substring(text.indexOf('export async function queryJotrilModel'), text.indexOf('export async function predictBatch'));
console.log(queryMatch.replace(/\r/g, ''));
