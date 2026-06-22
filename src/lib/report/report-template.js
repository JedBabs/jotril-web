/**
 * Jotril Report — HTML Template Builder
 * ------------------------------------------------------------------
 * buildReportHtml(data) returns a self-contained HTML document that the
 * headless-Chrome renderer (render.js) turns into the final PDF. All of the
 * "phenomenal report" design lives here as print-optimised CSS:
 *   • A4 layout with real page-break control (tables keep rows intact and
 *     repeat their headers; headings never orphan; figures stay whole)
 *   • A branded cover + donut scorecard
 *   • The faithfully-reproduced document body with AI/mixed highlight marks
 *
 * Pure function, no DOM — safe in a Node serverless route.
 */
import {
    COLORS, FONT_STACK, MONO_STACK, googleFontsLinks, escapeHtml, num, fmtInt,
    trimName, generateReportId, assessmentFor, donutSvg, wordmark,
} from './design-system.js';

// Light sanitiser — strips anything executable from the reproduced document
// HTML so the render page stays inert. (Content is the user's own document.)
function sanitizeHtml(html) {
    return String(html || '')
        .replace(/<\s*(script|iframe|object|embed|link|meta)\b[\s\S]*?(<\s*\/\s*\1\s*>|>)/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '');
}

// Rebuild a readable document body from analysed chunks (text input, or a
// past scan with no stored HTML). Groups consecutive sentences by their
// source paragraph index to preserve the original spacing, mirroring
// HeatmapViewer's grouping. AI/mixed sentences are wrapped in <mark>.
function reconstructBody(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
        return '<p class="doc-empty">No analysed content available for this report.</p>';
    }
    const paras = [];
    let cur = null;
    for (const c of chunks) {
        const p = c && (c.para ?? 0);
        if (!cur || cur.p !== p) { cur = { p, items: [] }; paras.push(cur); }
        cur.items.push(c);
    }
    return paras.map(para => {
        const inner = para.items.map(c => {
            const text = escapeHtml(c && c.text ? c.text : '');
            if (!text) return '';
            if (c.label === 'ai') return `<mark class="jt-ai">${text}</mark>`;
            if (c.label === 'mixed') return `<mark class="jt-mixed">${text}</mark>`;
            return text;
        }).filter(Boolean).join(' ');
        return `<p>${inner}</p>`;
    }).join('\n');
}

// ─── STYLES ─────────────────────────────────────────────────────────
function styles() {
    return `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
        background: ${COLORS.paper};
        font-family: ${FONT_STACK};
        color: ${COLORS.navy};
        font-size: 10.5pt;
        line-height: 1.62;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    h1, h2, h3, h4 { margin: 0; font-weight: 800; letter-spacing: -0.01em; line-height: 1.25; }
    p { margin: 0 0 10px; }
    a { color: ${COLORS.blue}; text-decoration: none; }

    /* ── Section scaffolding ── */
    .section-label {
        font-size: 8pt; font-weight: 800; letter-spacing: 0.18em;
        text-transform: uppercase; color: ${COLORS.muted}; margin: 0 0 10px;
    }
    .rule { height: 1px; background: ${COLORS.ghost}; border: 0; margin: 22px 0; }

    /* ── COVER ── */
    .cover { break-after: page; }
    .cover.solo { break-after: auto; }
    .cover-hero {
        position: relative; overflow: hidden;
        background: linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.navyLight} 55%, ${COLORS.blue} 130%);
        color: #fff; border-radius: 20px; padding: 38px 40px 34px;
    }
    .cover-hero::after {
        content: ''; position: absolute; top: -60px; right: -40px;
        width: 260px; height: 260px; border-radius: 50%;
        background: radial-gradient(circle, rgba(16,185,129,0.30), transparent 70%);
    }
    .cover-hero .mark { position: relative; z-index: 1; }
    .cover-hero h1 {
        position: relative; z-index: 1; font-size: 30pt; margin: 20px 0 6px;
        font-weight: 900; letter-spacing: -0.025em;
    }
    .cover-hero .sub { position: relative; z-index: 1; font-size: 10.5pt; color: rgba(255,255,255,0.78); font-weight: 500; }
    .cover-hero .file { position: relative; z-index: 1; margin-top: 14px; font-size: 11pt; font-weight: 700; }
    .cover-hero .file span { color: rgba(255,255,255,0.6); font-weight: 600; }

    /* Verdict band */
    .verdict { display: flex; align-items: center; gap: 14px; margin: 26px 0 22px; }
    .verdict-badge {
        display: inline-flex; align-items: center; gap: 9px;
        padding: 11px 20px; border-radius: 999px; font-weight: 800; font-size: 14pt;
    }
    .verdict-badge .glyph {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 50%; font-size: 12pt; color: #fff;
    }
    .verdict-conf { font-size: 9.5pt; font-weight: 700; color: ${COLORS.muted}; }
    .verdict-conf b { color: ${COLORS.navy}; }

    .narrative {
        font-size: 11pt; line-height: 1.6; color: ${COLORS.slate};
        background: ${COLORS.surface}; border: 1px solid ${COLORS.ghost};
        border-left: 4px solid ${COLORS.blue}; border-radius: 12px; padding: 16px 18px; margin: 0 0 26px;
    }

    /* Scorecard */
    .scorecard {
        display: flex; align-items: center; gap: 30px;
        border: 1px solid ${COLORS.ghost}; border-radius: 18px; padding: 26px 28px; break-inside: avoid;
    }
    .scorecard .donut { flex: 0 0 auto; }
    .scorecard .side { flex: 1 1 auto; }
    .legend-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
    .legend-row + .legend-row { border-top: 1px solid ${COLORS.mist}; }
    .legend-dot { width: 12px; height: 12px; border-radius: 4px; flex: 0 0 auto; }
    .legend-name { font-size: 10.5pt; font-weight: 600; color: ${COLORS.slate}; flex: 1 1 auto; }
    .legend-pct { font-size: 13pt; font-weight: 800; color: ${COLORS.navy}; }
    .legend-count { font-size: 8.5pt; font-weight: 600; color: ${COLORS.muted}; width: 96px; text-align: right; }

    .tiles { display: flex; gap: 12px; margin-top: 24px; }
    .tile { flex: 1 1 0; background: ${COLORS.surface}; border: 1px solid ${COLORS.ghost}; border-radius: 12px; padding: 14px 12px; text-align: center; }
    .tile .v { font-size: 19pt; font-weight: 800; color: ${COLORS.navy}; line-height: 1.1; }
    .tile .l { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${COLORS.muted}; margin-top: 4px; }

    /* ── DOCUMENT ANALYSIS ── */
    .doc-section { break-before: page; }
    .how-to-read {
        font-size: 9pt; color: ${COLORS.slate}; background: ${COLORS.surface};
        border: 1px solid ${COLORS.ghost}; border-radius: 10px; padding: 11px 14px; margin: 0 0 18px;
    }
    .how-to-read .chip { display: inline-block; padding: 1px 7px; border-radius: 5px; font-weight: 700; }

    .doc-body { font-size: 10.5pt; line-height: 1.65; color: ${COLORS.ink}; }
    .doc-body p { margin: 0 0 11px; }
    .doc-body h1 { font-size: 16pt; margin: 20px 0 8px; break-after: avoid; }
    .doc-body h2 { font-size: 13.5pt; margin: 18px 0 7px; break-after: avoid; }
    .doc-body h3 { font-size: 11.5pt; margin: 15px 0 6px; break-after: avoid; }
    .doc-body h4, .doc-body h5, .doc-body h6 { font-size: 10.5pt; margin: 12px 0 5px; break-after: avoid; }
    .doc-body ul, .doc-body ol { margin: 0 0 11px; padding-left: 22px; }
    .doc-body li { margin: 0 0 4px; }
    .doc-body img { max-width: 100%; height: auto; display: block; margin: 12px auto; break-inside: avoid; }
    .doc-body figure { margin: 12px 0; break-inside: avoid; }
    .doc-body blockquote { margin: 12px 0; padding: 4px 16px; border-left: 3px solid ${COLORS.silver}; color: ${COLORS.slate}; }

    /* Tables: allow page splits but keep rows whole + repeat the header row */
    .doc-body table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9.5pt; }
    .doc-body thead { display: table-header-group; }
    .doc-body tr { break-inside: avoid; }
    .doc-body th, .doc-body td { border: 1px solid ${COLORS.silver}; padding: 6px 9px; text-align: left; vertical-align: top; }
    .doc-body th { background: ${COLORS.surface}; font-weight: 700; color: ${COLORS.navy}; }
    .doc-body tr:nth-child(even) td { background: #FCFDFE; }
    .doc-empty { color: ${COLORS.muted}; font-style: italic; }

    /* Highlight marks (AI / mixed). box-decoration-break keeps wrapped runs tidy. */
    mark.jt-ai, mark.jt-mixed {
        border-radius: 3px; padding: 0.5px 1.5px;
        -webkit-box-decoration-break: clone; box-decoration-break: clone;
    }
    mark.jt-ai { background: ${COLORS.aiMark}; color: ${COLORS.aiInk}; }
    mark.jt-mixed { background: ${COLORS.mixedMark}; color: ${COLORS.mixedInk}; }

    /* ── METHODOLOGY / DISCLAIMER ── */
    .panel { background: ${COLORS.surface}; border: 1px solid ${COLORS.ghost}; border-radius: 14px; padding: 20px 22px; break-inside: avoid; }
    .panel h3 { font-size: 12pt; margin: 0 0 8px; color: ${COLORS.navy}; }
    .panel p { font-size: 9.5pt; color: ${COLORS.slate}; line-height: 1.6; }
    .panel ul { margin: 8px 0 0; padding-left: 18px; }
    .panel li { font-size: 8.7pt; color: ${COLORS.muted}; margin-bottom: 5px; line-height: 1.5; }

    /* ── VERIFICATION FOOTER BLOCK ── */
    .verify { display: flex; justify-content: space-between; align-items: flex-end;
        margin-top: 24px; padding-top: 16px; border-top: 1px solid ${COLORS.ghost}; }
    .verify .k { font-size: 8.5pt; color: ${COLORS.muted}; }
    .verify .id { font-family: ${MONO_STACK}; font-size: 9pt; color: ${COLORS.slate}; font-weight: 700; }
    `;
}

// ─── SECTION BUILDERS ───────────────────────────────────────────────
function coverSection(m) {
    const a = m.assessment;
    const legend = [
        { name: 'Human', pct: m.bHuman, color: COLORS.human, count: m.counts.human },
        { name: 'Mixed', pct: m.bMixed, color: COLORS.mixed, count: m.counts.mixed },
        { name: 'AI-generated', pct: m.bAi, color: COLORS.ai, count: m.counts.ai },
    ].map(r => `
        <div class="legend-row">
            <span class="legend-dot" style="background:${r.color}"></span>
            <span class="legend-name">${r.name}</span>
            <span class="legend-pct">${r.pct}%</span>
            <span class="legend-count">${fmtInt(r.count)} segments</span>
        </div>`).join('');

    return `
    <section class="cover${m.coverOnly ? ' solo' : ''}">
        <div class="cover-hero">
            <div class="mark">${wordmark({ size: 22, color: '#fff' })}</div>
            <h1>AI Content Analysis Report</h1>
            <div class="sub">Sentence-level AI-detection assessment</div>
            <div class="file">${escapeHtml(m.fname)} <span>&nbsp;•&nbsp; ${escapeHtml(m.date)} &nbsp;•&nbsp; ${escapeHtml(m.reportId)}</span></div>
        </div>

        <div class="verdict">
            <span class="verdict-badge" style="background:${a.soft};color:${a.ink}">
                <span class="glyph" style="background:${a.color}">${a.glyph}</span>
                ${escapeHtml(a.label)}
            </span>
            <span class="verdict-conf">Confidence: <b>${a.confidence}</b></span>
        </div>

        ${m.coverOnly ? '' : `<div class="narrative">${m.narrative}</div>`}

        <div class="scorecard">
            <div class="donut">${donutSvg(m.breakdown, { size: 172, stroke: 27 })}</div>
            <div class="side">
                ${legend}
                <div class="tiles">
                    <div class="tile"><div class="v">${fmtInt(m.sentenceCount)}</div><div class="l">Sentences</div></div>
                    <div class="tile"><div class="v">${fmtInt(m.wordCount)}</div><div class="l">Words</div></div>
                    <div class="tile"><div class="v">${fmtInt(m.chunks.length)}</div><div class="l">Segments</div></div>
                </div>
            </div>
        </div>
    </section>`;
}

function documentSection(m) {
    const body = m.sourceHtml
        ? `<div id="jotril-doc-body" class="doc-body">${sanitizeHtml(m.sourceHtml)}</div>`
        : `<div id="jotril-doc-body" class="doc-body">${reconstructBody(m.chunks)}</div>`;

    return `
    <section class="doc-section">
        <p class="section-label">Document Analysis</p>
        <div class="how-to-read">
            <b>How to read:</b> passages on a
            <span class="chip" style="background:${COLORS.aiMark};color:${COLORS.aiInk}">red</span>
            background were flagged as AI-generated;
            <span class="chip" style="background:${COLORS.mixedMark};color:${COLORS.mixedInk}">amber</span>
            indicates mixed signals. Unmarked text is assessed as human-written. The original
            document's structure, tables, and images are preserved below.
        </div>
        ${body}
    </section>`;
}

function methodologySection() {
    return `
    <hr class="rule" />
    <p class="section-label">Methodology &amp; Disclaimer</p>
    <div class="panel">
        <h3>About this analysis</h3>
        <p>This report was produced by the Jotril AI engine, which evaluates text at the sentence
        level using a proprietary multi-scale deep-learning pipeline. Each sentence is scored and
        banded as Human, Mixed, or AI-generated from linguistic, structural, and statistical signals,
        then smoothed against its surrounding context.</p>
        <ul>
            <li>No AI-detection tool is 100% accurate. Treat these results as one signal among many, not a sole determination.</li>
            <li>Short passages (under ~100 words) carry less signal and may score less reliably.</li>
            <li>Heavily edited or paraphrased AI text can score differently from raw AI output.</li>
            <li>This report is confidential and intended only for the requesting party.</li>
        </ul>
    </div>`;
}

function verificationSection(m) {
    return `
    <div class="verify">
        <div>
            <div class="k">Report verification</div>
            <div class="id">${escapeHtml(m.reportId)}</div>
            <div class="k" style="margin-top:3px">Generated ${escapeHtml(m.date)}</div>
        </div>
        <div style="text-align:right">
            <div class="k">Powered by</div>
            <div style="margin-top:2px">${wordmark({ size: 14 })} <span style="color:${COLORS.light};font-size:9pt"> Engine</span></div>
            <div style="color:${COLORS.blue};font-size:8.5pt;margin-top:2px">jotril.com</div>
        </div>
    </div>`;
}

// ─── PUPPETEER HEADER / FOOTER TEMPLATES ────────────────────────────
// Returned for render.js to pass into page.pdf({ headerTemplate, footerTemplate }).
// Note: puppeteer renders these in an isolated context with NO access to the
// page's CSS — every style must be inline, and a font-size must be set or it
// collapses to ~0.
export function headerFooterTemplates(m) {
    const headerTemplate = `
    <div style="width:100%; font-size:7px; color:#94A3B8; font-family:${FONT_STACK};
                padding:0 48px; display:flex; justify-content:space-between; align-items:center;
                -webkit-print-color-adjust:exact;">
        <span style="font-weight:800; color:#0A1628;">Jotril<span style="color:#10B981">AI</span></span>
        <span>${escapeHtml(m.fname)}</span>
    </div>`;

    const footerTemplate = `
    <div style="width:100%; font-size:7px; color:#94A3B8; font-family:${FONT_STACK};
                padding:0 48px; display:flex; justify-content:space-between; align-items:center;
                -webkit-print-color-adjust:exact;">
        <span>Jotril<span style="color:#10B981;font-weight:700">AI</span> &nbsp;•&nbsp; Confidential Report</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;

    return { headerTemplate, footerTemplate };
}

// ─── MAIN ───────────────────────────────────────────────────────────
export function buildReportHtml(data = {}) {
    const {
        filename = 'document',
        breakdown = { human: 0, mixed: 0, ai: 0 },
        overallLabel = '',
        chunks = [],
        sentenceCount = chunks.length,
        wordCount = 0,
        sourceHtml = null,
        coverOnly = false,
        date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reportId = generateReportId(),
    } = data;

    const bHuman = num(breakdown.human);
    const bMixed = num(breakdown.mixed);
    const bAi = num(breakdown.ai);
    const fmtPct = (v) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1));

    const counts = {
        human: chunks.filter(c => c && c.label === 'human').length,
        mixed: chunks.filter(c => c && c.label === 'mixed').length,
        ai: chunks.filter(c => c && c.label === 'ai').length,
    };

    const assessment = assessmentFor(breakdown, overallLabel);

    const narrative =
        `This ${fmtInt(sentenceCount)}-sentence document is assessed as <b style="color:${assessment.ink}">` +
        `${escapeHtml(assessment.label)}</b>. Sentence-level analysis attributes ` +
        `<b>${fmtPct(bAi)}%</b> of content to AI generation, <b>${fmtPct(bMixed)}%</b> to mixed authorship, ` +
        `and <b>${fmtPct(bHuman)}%</b> to human writing.`;

    const m = {
        filename, fname: trimName(filename), breakdown,
        bHuman: fmtPct(bHuman), bMixed: fmtPct(bMixed), bAi: fmtPct(bAi),
        counts, assessment, narrative,
        chunks, sentenceCount, wordCount, sourceHtml, coverOnly, date, reportId,
    };

    const body = coverOnly
        ? coverSection(m)
        : [coverSection(m), documentSection(m), methodologySection(), verificationSection(m)].join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>JotrilAI Report — ${escapeHtml(m.fname)}</title>
${googleFontsLinks()}
<style>${styles()}</style>
</head>
<body>
${body}
</body>
</html>`;
}
