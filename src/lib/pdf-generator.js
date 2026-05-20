import html2pdf from 'html2pdf.js';

/**
 * Premium PDF Report Generator for Jotril AI — V2 Formatting Engine
 * 
 * Uses html2pdf.js + html2canvas to perfectly preserve DOM formatting, 
 * tables, charts, pictures, and styles from the source document, while
 * overlaying the AI heatmap dynamically.
 */

// ─── CHUNK-TO-CHARACTER MAP ─────────────────────────────────
// Maps every character position in the full text to a chunk label.
function buildChunkMap(chunks) {
    const map = [];
    for (const chunk of chunks) {
        const text = chunk.text;
        for (let i = 0; i < text.length; i++) {
            map.push(chunk.label);
        }
    }
    return map;
}

// Fuzzy-forward match: walks through targetText and chunkMap simultaneously
function matchTextToChunkMap(targetText, fullAnalysisText, chunkMap) {
    const result = [];
    let aPtr = 0;
    for (let t = 0; t < targetText.length; t++) {
        const tChar = targetText[t];
        while (aPtr < fullAnalysisText.length && /\s/.test(fullAnalysisText[aPtr]) && !(/\s/.test(tChar))) {
            aPtr++;
        }
        if (/\s/.test(tChar) && aPtr < fullAnalysisText.length && !(/\s/.test(fullAnalysisText[aPtr]))) {
            result.push(chunkMap[Math.max(0, aPtr - 1)] || 'human');
            continue;
        }
        if (aPtr < fullAnalysisText.length && tChar.toLowerCase() === fullAnalysisText[aPtr].toLowerCase()) {
            result.push(chunkMap[aPtr] || 'human');
            aPtr++;
        } else {
            let found = false;
            const maxScan = Math.min(20, fullAnalysisText.length - aPtr);
            for (let scan = 1; scan <= maxScan; scan++) {
                if (tChar.toLowerCase() === fullAnalysisText[aPtr + scan].toLowerCase()) {
                    aPtr += scan;
                    result.push(chunkMap[aPtr] || 'human');
                    aPtr++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const lookAhead = targetText.substring(t, t + 15).replace(/\s+/g, '').toLowerCase();
                if (lookAhead.length >= 6) {
                    const searchStart = Math.max(0, aPtr - 30);
                    const searchEnd = Math.min(fullAnalysisText.length, aPtr + 200);
                    const searchWindow = fullAnalysisText.substring(searchStart, searchEnd).replace(/\s+/g, '').toLowerCase();
                    const resyncIdx = searchWindow.indexOf(lookAhead.substring(0, 6));
                    if (resyncIdx >= 0) {
                        let realIdx = searchStart;
                        let stripped = 0;
                        while (realIdx < searchEnd && stripped < resyncIdx) {
                            if (!/\s/.test(fullAnalysisText[realIdx])) stripped++;
                            realIdx++;
                        }
                        aPtr = realIdx;
                        result.push(chunkMap[aPtr] || 'human');
                        aPtr++;
                        continue;
                    }
                }
                result.push(chunkMap[Math.min(aPtr, chunkMap.length - 1)] || 'human');
            }
        }
    }
    return result;
}

// ─── DOM HIGHLIGHT INJECTOR ─────────────────────────────────
// Walks a live DOM tree and replaces text nodes with highlighted <mark> spans
function applyHighlightsToDOM(container, chunks) {
    const fullText = chunks.map(c => c.text).join('');
    const chunkMap = buildChunkMap(chunks);
    const htmlText = container.textContent || '';
    const charLabels = matchTextToChunkMap(htmlText, fullText, chunkMap);

    let globalCharIdx = 0;

    function walk(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent;
            if (!text || text.trim() === '') {
                globalCharIdx += text.length;
                return;
            }

            const labels = charLabels.slice(globalCharIdx, globalCharIdx + text.length);

            const spans = [];
            let currentLabel = labels[0];
            let currentText = text[0];

            for (let i = 1; i < text.length; i++) {
                if (labels[i] === currentLabel) {
                    currentText += text[i];
                } else {
                    spans.push({ text: currentText, label: currentLabel });
                    currentLabel = labels[i];
                    currentText = text[i];
                }
            }
            if (currentText) spans.push({ text: currentText, label: currentLabel });

            const fragment = document.createDocumentFragment();
            for (const span of spans) {
                if (span.label === 'ai' || span.label === 'mixed') {
                    const mark = document.createElement('mark');
                    mark.textContent = span.text;
                    // Transparent highlights with visible color
                    mark.style.backgroundColor = span.label === 'ai'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : 'rgba(245, 158, 11, 0.25)';
                    mark.style.color = 'inherit';
                    fragment.appendChild(mark);
                } else {
                    fragment.appendChild(document.createTextNode(span.text));
                }
            }

            node.replaceWith(fragment);
            globalCharIdx += text.length;
            return;
        }

        if (node.nodeType === 1) {
            // Only walk elements we care about, skip scripts/styles
            if (['SCRIPT', 'STYLE', 'BUTTON'].includes(node.tagName)) return;

            // Mammoth sometimes creates empty spans, copy array so iteration doesn't break
            const children = Array.from(node.childNodes);
            for (const child of children) {
                walk(child);
            }
        }
    }

    walk(container);
}

// ─── MAIN EXPORT ────────────────────────────────────────────
export async function generatePDFReport(data) {
    const {
        filename,
        breakdown,
        overallLabel,
        chunks,
        sentenceCount,
        wordCount,
        sourceHtml = null,
        date = new Date().toLocaleDateString()
    } = data;

    // 1. Create a hidden container attached to body so it gets styles
    const wrapper = document.createElement('div');
    // Position off-screen but keep it visible to html2canvas
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '800px';
    wrapper.style.backgroundColor = 'white';
    wrapper.style.color = '#0F172A';
    wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    // We use inline styles for the header so it renders perfectly without relying on external classes
    const getBarWidth = (pct) => Math.max(0, pct || 0) + '%';
    const assessColor = breakdown.ai >= 60 ? '#EF4444' : (breakdown.ai >= 30 || breakdown.mixed >= 40 ? '#F59E0B' : '#10B981');
    const fname = filename.length > 35 ? filename.substring(0, 32) + '...' : filename;

    wrapper.innerHTML = `
        <style>
            /* Document Styles Mapped from Mammoth */
            #pdf-body-content p { margin-top: 0.8em; margin-bottom: 0.8em; }
            #pdf-body-content h1.docx-title { font-size: 32px; text-align: center; font-weight: bold; margin-bottom: 30px; }
            #pdf-body-content p.docx-subtitle { font-size: 20px; text-align: center; color: #475569; margin-bottom: 30px; }
            #pdf-body-content .align-center { text-align: center !important; }
            #pdf-body-content .align-right { text-align: right !important; }
            #pdf-body-content .align-justify { text-align: justify !important; }
            #pdf-body-content .align-left { text-align: left !important; }
            
            /* General Elements */
            #pdf-body-content img { max-width: 100%; height: auto; border-radius: 4px; margin: 15px 0; display: block; page-break-inside: avoid; }
            #pdf-body-content ul, #pdf-body-content ol { padding-left: 2rem; margin: 1em 0; }
            #pdf-body-content li { margin-bottom: 0.5em; }
            
            /* Table Styling */
            #pdf-body-content table { border-collapse: collapse; width: 100%; margin: 20px 0; page-break-inside: avoid; font-size: 13px; }
            #pdf-body-content th, #pdf-body-content td { border: 1px solid #CBD5E1; padding: 10px 14px; text-align: left; }
            #pdf-body-content th { background-color: #F1F5F9; font-weight: bold; color: #0F172A; }
            #pdf-body-content tr:nth-child(even) td { background-color: #F8FAFC; }
        </style>
        <div style="padding: 40px; box-sizing: border-box;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                <div>
                    <h1 style="margin: 0; font-size: 32px; font-weight: 800; color: #0F172A;">Jotril<span style="color: #10B981;">AI</span></h1>
                    <p style="margin: 4px 0 0; font-size: 14px; color: #64748B;">Premium PDF Report</p>
                </div>
                <div style="text-align: right; color: #64748B; font-size: 14px;">
                    <p style="margin: 0;">Date: ${date}</p>
                </div>
            </div>
            
            <hr style="border: 0; height: 1px; background: #E2E8F0; margin-bottom: 30px;" />
            
            <!-- Assessment Banner -->
            <div style="background-color: ${assessColor}; color: white; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
                <p style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Document Assessment</p>
                <h2 style="margin: 4px 0 0; font-size: 24px; font-weight: 800; text-transform: uppercase;">${overallLabel}</h2>
            </div>
            
            <!-- Stats -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
                <div style="flex: 1;">
                    <h3 style="margin: 0; font-size: 28px; font-weight: 800; color: #0F172A;">${sentenceCount}</h3>
                    <p style="margin: 2px 0 0; font-size: 12px; color: #64748B; font-weight: bold; text-transform: uppercase;">Sentences</p>
                </div>
                <div style="flex: 1;">
                    <h3 style="margin: 0; font-size: 28px; font-weight: 800; color: #0F172A;">${wordCount}</h3>
                    <p style="margin: 2px 0 0; font-size: 12px; color: #64748B; font-weight: bold; text-transform: uppercase;">Words</p>
                </div>
                <div style="flex: 1.5; text-align: right;">
                    <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fname}</h3>
                    <p style="margin: 2px 0 0; font-size: 12px; color: #64748B; font-weight: bold; text-transform: uppercase;">File</p>
                </div>
            </div>
            
            <!-- Composition Bar -->
            <div style="margin-bottom: 50px;">
                <p style="margin: 0 0 8px; font-size: 12px; font-weight: bold; color: #64748B; text-transform: uppercase;">Composition Breakdown</p>
                <div style="display: flex; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                    <div style="width: ${getBarWidth(breakdown.human)}; background-color: #10B981;"></div>
                    <div style="width: ${getBarWidth(breakdown.mixed)}; background-color: #F59E0B;"></div>
                    <div style="width: ${getBarWidth(breakdown.ai)}; background-color: #EF4444;"></div>
                </div>
                <div style="display: flex; gap: 30px; font-size: 13px; color: #64748B;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 10px; height: 10px; border-radius: 2px; background: #10B981;"></span>
                        <span style="font-weight: bold; color: #0F172A;">${breakdown.human}%</span> Human
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 10px; height: 10px; border-radius: 2px; background: #F59E0B;"></span>
                        <span style="font-weight: bold; color: #0F172A;">${breakdown.mixed}%</span> Mixed
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 10px; height: 10px; border-radius: 2px; background: #EF4444;"></span>
                        <span style="font-weight: bold; color: #0F172A;">${breakdown.ai}%</span> AI
                    </div>
                </div>
            </div>

            <!-- Content Title -->
            <h2 style="font-size: 18px; font-weight: bold; color: #0F172A; margin-bottom: 20px;">
                ${sourceHtml ? 'Formatted Document Analysis' : 'Sentence-Level Heatmap'}
            </h2>
            
            <!-- Document Body -->
            <div id="pdf-body-content" style="line-height: 1.8; font-size: 14px; text-align: justify;">
                <!-- Content injected via JS below -->
            </div>
        </div>
    `;

    document.body.appendChild(wrapper);

    // Inject content dynamically
    const bodyContent = wrapper.querySelector('#pdf-body-content');

    if (sourceHtml) {
        bodyContent.innerHTML = sourceHtml;
        // Apply highlights accurately over the DOM
        applyHighlightsToDOM(bodyContent, chunks);
    } else {
        // Plain text rendering: loop chunks and wrap in spans manually
        chunks.forEach(chunk => {
            const span = document.createElement('span');
            span.textContent = chunk.text + ' ';

            if (chunk.label === 'ai') {
                span.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
            } else if (chunk.label === 'mixed') {
                span.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
            }

            bodyContent.appendChild(span);
        });
        bodyContent.style.whiteSpace = 'pre-wrap';
    }

    // Capture with html2pdf
    const pdfOptions = {
        margin: 0,
        filename: `Jotril_Report_${filename.replace(/\.[^/.]+$/, "")}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(pdfOptions).from(wrapper).save();
    } finally {
        // Always clean up the DOM!
        document.body.removeChild(wrapper);
    }
}
