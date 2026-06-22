/**
 * Jotril Report — Headless-Chrome Renderer
 * ------------------------------------------------------------------
 * Turns the report HTML (report-template.js) into a pixel-perfect PDF via a
 * real Chromium print engine. Server-only (Node runtime).
 *
 *   • Production / serverless (Vercel) → @sparticuz/chromium binary
 *   • Local dev                         → a locally-installed Chrome/Edge
 *     (auto-detected, or PUPPETEER_EXECUTABLE_PATH)
 *
 * For DOCX bodies the per-sentence highlights are injected INSIDE the page
 * (real DOM) after the original HTML is laid out — see highlight-injector.js.
 */
import { existsSync } from 'fs';
import { buildReportHtml, headerFooterTemplates } from './report-template.js';
import { injectHighlights } from './highlight-injector.js';
import { trimName } from './design-system.js';

const LOCAL_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

// Common local Chrome/Edge install paths across platforms (dev only).
const LOCAL_CANDIDATES = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
].filter(Boolean);

async function resolveBrowser() {
    // Prefer a locally-installed Chrome/Edge (incl. the override env vars at the
    // head of LOCAL_CANDIDATES). Detecting by presence — rather than VERCEL/AWS
    // env flags — is robust even when a local .env contains VERCEL=1 (e.g. from
    // `vercel env pull`). On Vercel's Lambda no local browser exists, so we fall
    // through to the bundled @sparticuz/chromium binary.
    const found = LOCAL_CANDIDATES.find((p) => p && existsSync(p));
    if (found) {
        return { executablePath: found, args: LOCAL_ARGS, headless: true, defaultViewport: null };
    }
    const chromium = (await import('@sparticuz/chromium')).default;
    return {
        executablePath: await chromium.executablePath(),
        args: chromium.args,
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
    };
}

/**
 * Render a Jotril report to a PDF Buffer.
 * @param {object} data  buildReportHtml() input { filename, breakdown, overallLabel,
 *                       chunks, sentenceCount, wordCount, sourceHtml, coverOnly, date, reportId }
 * @returns {Promise<Buffer>}
 */
export async function renderReportPdf(data = {}) {
    const html = buildReportHtml(data);
    const coverOnly = !!data.coverOnly;
    const { headerTemplate, footerTemplate } = headerFooterTemplates({
        fname: trimName(data.filename || 'document'),
    });

    // Highlights are baked in for reconstructed bodies; for DOCX sourceHtml we
    // map them onto the laid-out DOM in-page.
    const injectChunks =
        !coverOnly && data.sourceHtml && Array.isArray(data.chunks) && data.chunks.length
            ? data.chunks
            : null;

    const puppeteer = (await import('puppeteer-core')).default;
    const launchOpts = await resolveBrowser();

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: launchOpts.executablePath,
            args: launchOpts.args,
            headless: launchOpts.headless ?? true,
            defaultViewport: launchOpts.defaultViewport ?? { width: 794, height: 1123, deviceScaleFactor: 2 },
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(60000);

        // Lock the render page down: the report HTML can contain user-supplied
        // document markup, so only allow inline (data:/blob:) resources and the
        // Inter web font. Everything else — remote URLs, file:// — is aborted to
        // prevent SSRF / local-file disclosure during rendering.
        await page.setRequestInterception(true);
        page.on('request', (reqI) => {
            const u = reqI.url();
            if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return reqI.continue();
            if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return reqI.continue();
            return reqI.abort();
        });

        // networkidle0 lets the Inter web font load before we measure/paint.
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
        try { await page.evaluateHandle('document.fonts && document.fonts.ready'); } catch { /* fonts best-effort */ }

        if (injectChunks) {
            await page.evaluate(injectHighlights, injectChunks);
        }

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: !coverOnly,
            headerTemplate: coverOnly ? '<span></span>' : headerTemplate,
            footerTemplate: coverOnly ? '<span></span>' : footerTemplate,
            margin: coverOnly
                ? { top: '40px', bottom: '40px', left: '46px', right: '46px' }
                : { top: '64px', bottom: '54px', left: '46px', right: '46px' },
            timeout: 120000,
        });

        return Buffer.from(pdf);
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
