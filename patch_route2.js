const fs = require("fs");
const req = {
    json: async () => ({
        targetUrl: 'https://huggingface.co',
        options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({data: [['T1', 'T2']]})
        }
    })
};
import('./src/app/api/gradio-proxy/route.js').then(async m => {
    try {
        const _m = m.POST(req);
    } catch(e) {}
});
