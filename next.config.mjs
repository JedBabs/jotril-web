/** @type {import('next').NextConfig} */
const nextConfig = {
  // These must stay server-side (native deps / large binaries) and never be bundled.
  // puppeteer-core + @sparticuz/chromium power the headless-Chrome PDF report engine.
  serverExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer-core', '@sparticuz/chromium'],

  // Ensure the brotli-compressed Chromium binaries are traced into the serverless
  // function for the report renderer on Vercel (dev uses a local Chrome instead).
  outputFileTracingIncludes: {
    '/api/report': ['./node_modules/@sparticuz/chromium/bin/**'],
  },

  turbopack: {
    // pdfjs-dist (used by pdf-overlay.js for in-place PDF highlighting) does a
    // require("canvas") in its Node code path. That path never runs in the
    // browser, so alias it to an empty stub to keep it out of the client bundle.
    resolveAlias: {
      canvas: './src/lib/empty-module.js',
    },
  },
};

export default nextConfig;
