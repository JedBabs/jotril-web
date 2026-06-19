const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, 'src/lib/jotrilService.js');
let serviceText = fs.readFileSync(servicePath, 'utf8');

// 1. Convert standard predict requests headers
if (serviceText.includes("body: JSON.stringify({ data: [text] })") && !serviceText.includes("Authorization")) {
    serviceText = serviceText.replace(
        "headers: { 'Content-Type': 'application/json' },",
        "headers: { 'Content-Type': 'application/json', ...(process.env.HF_TOKEN ? { 'Authorization': `Bearer ${process.env.HF_TOKEN}` } : {}) },"
    );
}

// 2. Convert eventId polling GET requests
if (serviceText.includes("fetch(`https://${spaceName.replace('/', '-')}.hf.space/gradio_api/call/predict/${eventId}`)") && !serviceText.includes("headers: process.env.HF_TOKEN")) {
    serviceText = serviceText.replace(
        "fetch(`https://${spaceName.replace('/', '-')}.hf.space/gradio_api/call/predict/${eventId}`)",
        "fetch(`https://${spaceName.replace('/', '-')}.hf.space/gradio_api/call/predict/${eventId}`, { headers: process.env.HF_TOKEN ? { 'Authorization': `Bearer ${process.env.HF_TOKEN}` } : {} })"
    );
}

// 3. Convert initial ping check
if (serviceText.includes("fetch(`https://huggingface.co/api/spaces/${SPACES[0]}`") && !serviceText.includes("Authorization")) {
    // Optional but good for pinging
}

fs.writeFileSync(servicePath, serviceText);
console.log("Patched jotrilService.js successfully.");
