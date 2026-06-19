const fs = require('fs');
const path = require('path');

const targetHook = `const { generatePDFReport: libGen } = await import("@/lib/pdf-generator");
                                                libGen({`;

const replacementHook = `const { generatePDFReport: libGen } = await import("@/lib/pdf-generator");
                                                const { overlayPDFReport } = await import("@/lib/pdf-overlay");
                                                if (scannedFile && scannedFile.type === 'application/pdf') {
                                                    try {
                                                        const overlaySuccess = await overlayPDFReport({
                                                            file: scannedFile,
                                                            filename: scannedFile.name,
                                                            breakdown,
                                                            chunks: results,
                                                            sentenceCount: results.length,
                                                            wordCount: results.reduce((s, c) => s + c.text.trim().split(/\\s+/).length, 0)
                                                        });
                                                        if (overlaySuccess) return;
                                                    } catch (e) { console.error("Overlay failed", e); }
                                                }
                                                libGen({`;

const pagePath = path.join(__dirname, 'src/app/page.js');
let pageText = fs.readFileSync(pagePath, 'utf8');
if (pageText.includes('libGen({') && !pageText.includes('overlayPDFReport')) {
    pageText = pageText.replace(targetHook, replacementHook);
    fs.writeFileSync(pagePath, pageText);
    console.log('Patched page.js');
}

const dashPath = path.join(__dirname, 'src/app/dashboard/page.jsx');
if (fs.existsSync(dashPath)) {
    let dashText = fs.readFileSync(dashPath, 'utf8');

    // In dashboard it might be named differently or indented differently
    dashText = dashText.replace(
        /const\s*\{\s*generatePDFReport:\s*libGen\s*\}\s*=\s*await\s*import\("@\/lib\/pdf-generator"\);\s*libGen\(\{/g,
        replacementHook.replace(/scannedFile/g, 'file').replace(/results/g, 'chunks') // dashboard might use 'file' instead of 'scannedFile'
    );
    if (dashText.includes('overlayPDFReport')) {
        fs.writeFileSync(dashPath, dashText);
        console.log('Patched dashboard/page.jsx');
    }
}
