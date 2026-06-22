/**
 * Jotril Report — Shared Design System
 * ------------------------------------------------------------------
 * Single source of truth for the PDF report's visual language. Mirrors the
 * app's globals.css tokens (brand navy + green "AI", score colours) so the
 * downloadable report and the on-screen dashboard read as one product.
 *
 * Pure data + string helpers only — safe to import from a Node serverless
 * route (no DOM, no React).
 */

// ─── BRAND + SEMANTIC COLOURS ───────────────────────────────────────
export const COLORS = {
    // Brand / neutrals (from globals.css :root)
    navy: '#0A1628',
    navyLight: '#1B2D4A',
    ink: '#142035',
    slate: '#334155',
    ash: '#4A5568',
    muted: '#64748B',
    light: '#94A3B8',
    silver: '#CBD5E1',
    ghost: '#E2E8F0',
    mist: '#EEF2F7',
    surface: '#F8FAFC',
    paper: '#FFFFFF',

    // Accents
    blue: '#2563EB',
    blueLight: '#3B82F6',
    purple: '#7C3AED',
    cyan: '#06B6D4',

    // Score semantics (must match --color-score-* in globals.css)
    human: '#10B981',
    humanSoft: '#D1FAE5',
    humanInk: '#065F46',
    humanMark: '#DCFCE7',

    mixed: '#F59E0B',
    mixedSoft: '#FEF3C7',
    mixedInk: '#92400E',
    mixedMark: '#FEF08A',

    ai: '#EF4444',
    aiSoft: '#FEE2E2',
    aiInk: '#991B1B',
    aiMark: '#FECACA',
};

// Premium type stack. Inter is pulled from Google Fonts at render time
// (see googleFontsLinks); the stack degrades gracefully if the network blips.
export const FONT_STACK =
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO_STACK =
    "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export function googleFontsLinks() {
    return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">`;
}

// ─── SAFE STRING HELPERS ────────────────────────────────────────────
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function num(v, fallback = 0) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
}

export function fmtInt(v) {
    const n = Math.round(num(v));
    return n.toLocaleString('en-US');
}

// Trim a long filename for headers/footers without losing the extension.
export function trimName(name, max = 46) {
    const s = String(name || 'document');
    if (s.length <= max) return s;
    const dot = s.lastIndexOf('.');
    if (dot > 0 && s.length - dot <= 6) {
        const ext = s.slice(dot);
        return s.slice(0, max - ext.length - 1) + '…' + ext;
    }
    return s.slice(0, max - 1) + '…';
}

export function generateReportId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `JTR-${ts.slice(-4)}-${rand}`;
}

// ─── VERDICT / ASSESSMENT ───────────────────────────────────────────
/**
 * Derive the headline verdict styling from the composition breakdown.
 * Thresholds mirror the app's ScoreGauge.getOverallConfig so the badge
 * colour on screen matches the report.
 */
export function assessmentFor(breakdown = {}, overallLabel = '') {
    const ai = num(breakdown.ai);
    const mixed = num(breakdown.mixed);
    const human = num(breakdown.human);

    let tone;
    if (ai >= 60) tone = 'ai';
    else if (ai >= 30 || mixed >= 40) tone = 'mixed';
    else tone = 'human';

    const map = {
        ai: { color: COLORS.ai, soft: COLORS.aiSoft, ink: COLORS.aiInk, glyph: '!' },
        mixed: { color: COLORS.mixed, soft: COLORS.mixedSoft, ink: COLORS.mixedInk, glyph: '~' },
        human: { color: COLORS.human, soft: COLORS.humanSoft, ink: COLORS.humanInk, glyph: '✓' },
    };

    const dominant = Math.max(ai, mixed, human);
    const confidence = dominant >= 75 ? 'High' : dominant >= 50 ? 'Medium' : 'Moderate';

    // Prefer the server-provided label; fall back to a sensible default.
    const label = overallLabel && overallLabel.trim()
        ? overallLabel.trim()
        : tone === 'ai' ? 'AI Generated'
            : tone === 'mixed' ? 'Mixed Content'
                : 'Human Authored';

    return { tone, label, confidence, ...map[tone] };
}

// ─── DONUT CHART (inline SVG) ───────────────────────────────────────
/**
 * Three-segment composition donut. Returns an inline <svg> string with the
 * AI percentage called out in the centre (the headline risk figure).
 */
export function donutSvg(breakdown = {}, { size = 168, stroke = 26 } = {}) {
    const human = Math.max(0, num(breakdown.human));
    const mixed = Math.max(0, num(breakdown.mixed));
    const ai = Math.max(0, num(breakdown.ai));
    const total = human + mixed + ai || 1;

    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;

    const segs = [
        { v: human, c: COLORS.human },
        { v: mixed, c: COLORS.mixed },
        { v: ai, c: COLORS.ai },
    ];

    let acc = 0;
    const arcs = segs
        .filter(s => s.v > 0)
        .map(s => {
            const dash = (s.v / total) * C;
            const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${s.c}" stroke-width="${stroke}" stroke-linecap="butt"
                stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
                stroke-dashoffset="${(-acc).toFixed(2)}" />`;
            acc += dash;
            return arc;
        })
        .join('');

    const aiPct = ai.toFixed(ai % 1 === 0 ? 0 : 1);

    return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Composition donut">
        <g transform="rotate(-90 ${cx} ${cy})">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS.ghost}" stroke-width="${stroke}" />
            ${arcs}
        </g>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="${FONT_STACK}"
            font-size="38" font-weight="800" fill="${COLORS.navy}">${aiPct}%</text>
        <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="${FONT_STACK}"
            font-size="11" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">AI CONTENT</text>
    </svg>`;
}

// Small inline JotrilAI wordmark (navy "Jotril" + green "AI").
export function wordmark({ size = 20, color = COLORS.navy } = {}) {
    return `<span style="font-weight:900;font-size:${size}px;letter-spacing:-0.02em;color:${color}">Jotril<span style="color:${COLORS.human}">AI</span></span>`;
}
