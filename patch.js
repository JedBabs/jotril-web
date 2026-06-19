const fs = require('fs');
const path = require('path');

// 1. Patch pdf-generator.js
const pdfGenPath = path.join(__dirname, 'src/lib/pdf-generator.js');
let pdfGenText = fs.readFileSync(pdfGenPath, 'utf8');

if (!pdfGenText.includes('exportBlobCallback')) {
    pdfGenText = pdfGenText.replace(
        '// ── Generate & download ──',
        `// ── Generate & download ──\n    if (data.exportBlobCallback) { return pdfMake.createPdf(docDefinition).getBlob((blob) => data.exportBlobCallback(blob)); }`
    );
    fs.writeFileSync(pdfGenPath, pdfGenText);
    console.log('Patched pdf-generator.js');
}

// 2. Patch useAnalyze.js
const useAnalyzePath = path.join(__dirname, 'src/hooks/useAnalyze.js');
let useAnalyzeText = fs.readFileSync(useAnalyzePath, 'utf8');

if (!useAnalyzeText.includes('overlayPDFReport')) {
    const targetHook = `const { generatePDFReport } = await import("@/lib/pdf-generator");
                            generatePDFReport({`;

    const replacementHook = `const { generatePDFReport } = await import("@/lib/pdf-generator");
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
                                } catch (err) { console.error(err); }
                            }
                            generatePDFReport({`;

    useAnalyzeText = useAnalyzeText.replace(targetHook, replacementHook);
    fs.writeFileSync(useAnalyzePath, useAnalyzeText);
    console.log('Patched useAnalyze.js');
}
