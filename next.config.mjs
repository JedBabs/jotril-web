/** @type {import('next').NextConfig} */
const nextConfig = {
  // These must stay server-side (native deps / large binaries) and never be bundled.
  // puppeteer-core + @sparticuz/chromium power the headless-Chrome PDF report engine.
  serverExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer-core', '@sparticuz/chromium', 'pdfjs-dist', 'pdf-lib', 'google-auth-library'],

  // Ensure assets referenced via runtime fs paths are traced into the serverless
  // function bundles on Vercel (the static tracer can't see dynamic path.join
  // strings, so we hint them explicitly here).
  outputFileTracingIncludes: {
    // Headless-Chrome PDF renderer — needs the brotli-compressed chromium binaries.
    '/api/report': ['./node_modules/@sparticuz/chromium/bin/**'],
    // Prewarm renders the branded cover via headless Chrome too.
    '/api/report/prewarm': ['./node_modules/@sparticuz/chromium/bin/**'],
    // Auto-tuner training data (admin-only). Moved out of /public so it isn't
    // publicly fetchable / shipped to the client; needs explicit tracing so the
    // serverless function can still read it via fs.readFileSync.
    '/api/admin/auto-tune': ['./internal-data/**'],
  },

  turbopack: {
    // pdfjs-dist (used by pdf-overlay.js for in-place PDF highlighting) does a
    // require("canvas") in its Node code path. That path never runs in the
    // browser, so alias it to an empty stub to keep it out of the client bundle.
    resolveAlias: {
      canvas: './src/lib/empty-module.js',
    },
  },

  // Baseline security headers applied to every response. Deliberately does NOT set a
  // strict Content-Security-Policy yet — a correct CSP for this app (inline styles,
  // framer-motion, Vercel/GA analytics, Google Fonts, the same-origin gradio proxy)
  // needs its own tested pass, and a wrong one silently breaks the page. These headers
  // are safe and high-value on their own.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
