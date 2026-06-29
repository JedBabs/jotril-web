@AGENTS.md

---

# Jotril AI — Project Anchor Document

> This file is the single source of truth for all Claude sessions on this project.
> Update it immediately whenever architecture, bugs, fixes, or intentions change.
> Last updated: 2026-06-29. **Security + correctness audit (2026-06-29):** fixed a critical `/api/gradio-proxy` open-relay/SSRF `HF_TOKEN` leak (hostname allow-list + HMAC scan-token cookie), the doubly-broken `/api/v1/detect` public API, the soft budget reconcile (now counts real proxy calls + charges overage), plaintext API keys (now hashed), host-header injection in email links, missing security headers, and per-request middleware logging; parallelized the analyze hot-path gates; added QuotaUsage composite indexes (needs `prisma db push`); deleted dead `queryJotrilBatch`; fixed the 4 stale tests (suite now 17/17). All verified (build/tests/lint/token/SSRF). Full detail in §15 (Fixed 2026-06-29) + §8. **Also 2026-06-29 (polish + fixes):** softened multimodal marketing copy to "AI text detection (more modalities coming)"; deleted the inert queue tier-sort; made the landing page reachable while logged in (removed forced `/`→`/dashboard` redirect, added a navbar "Home" link); cleaned ~51 root scratch files (kept 6 dev tools); fixed the "sign in to upload" bug for signed-in users (`FileUploader` now derives auth from `useSession`) + replaced the toast with a designed sign-in overlay; fixed the `admin.jotril.com` subdomain auth (env-gated `COOKIE_DOMAIN` cross-subdomain session cookie + absolute admin redirect — needs `COOKIE_DOMAIN=.jotril.com` in prod). **Earlier this session (2026-06-28):** documented a previously-undocumented marketing/SEO/analytics/network-resilience layer that landed after the 2026-06-24 doc (new `/text` route, sitemap/robots/OG, GA4 + Vercel Analytics/Speed Insights, `resilient-fetch`, offline pause, ServiceWorker, GlitchFavicon, subdomains) — see new §20 and the refreshed §4 map. Also **corrected the queue tier-priority claim**: the QueueManager tier sort is effectively inert — it's a per-browser singleton (users never compete) AND the UI passes no real tier (FileUploader → useAnalyze defaults `userTier=1`), so every chunk enters at tier 1; only the sweeper's `tier:999` retry preemption ever fires. Real tier differentiation is server-side (governor depth + quota), NOT the queue — see §9. ⚠️ Marketing copy now positions Jotril as multi-modal (text/image/video/audio/deepfake) but the engine is **TEXT-ONLY** — a positioning-vs-capability gap to close before launch. **Prior, 2026-06-24 (AUTO-TUNER LIFECYCLE FIX:** stuck-run deadlock + undefined-metrics-on-deadline, see §15. Added `TuningRun.updatedAt` heartbeat (`prisma db push` — RESTART dev server for the new client); `/run` POST + SSE poller now reclaim a no-heartbeat "active" run after 2 min instead of jamming the dataset; `runExhaustiveSearch` early-deadline returns now include train/test/full metrics via `finalizeResult()`. Also fixed: score-cache poisoning guard (`MAX_NULL_RATE` abort) + force-rebuild path & "Rebuild Cache" UI; `/dev-trigger` shares the run lifecycle (no in-memory lock, keeps COMPLETE history); "best MCC"→"best obj" relabel; `apply` preserves the budget block. Earlier 2026-06-24: HF SPACE LOG CLEANUP: silenced Gradio's Starlette `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warning via a scoped `warnings.filterwarnings` at the top of `app.py` in all three Spaces — committed + pushed (Space-3 was cloned in; it wasn't local). Earlier 2026-06-24: HIGH-FIDELITY DOCX REPORT CACHE + AUTO-PREWARM via Gotenberg + GCS, see §15/§19. New: lib/gotenberg.js, lib/report-storage.js, lib/report/server-overlay.js, /api/report/prewarm, /api/report/download. DOCX scans now prewarm in the background (DOCX→PDF→highlights+cover→GCS) so fresh AND history downloads are instant high-fidelity. Persisted-scan downloads use a real `<a download>` navigation to the new GET endpoint — survives IDM/FDM (which was eating fetch+blob into a fake 204 the day before — see §16). Verified Node-side: Gotenberg IAM, GCS round-trip, server overlay. Prior: user-cancellable processes; load-time fixes; PDF report engine rebuilt on headless Chrome — see §19. Plan: Hobby now → 50-tester private beta → Pro before public launch.

---

## 1. What This Project Is

**Jotril AI** is a full-stack SaaS web application for detecting AI-generated text. Users paste text or upload documents (PDF / DOCX / TXT); the system runs them through proprietary deep learning models hosted on Hugging Face Spaces and returns sentence-level heatmaps showing which parts are human-written vs. AI-generated. The product has a quota/tiered subscription model: FREE / PRO / ULTRA / ADMIN.

Detection is done at the sentence level — each sentence gets a score 0-100 and a label (human / mixed / ai). The final heatmap overlays colors on the original document text.

---

## 2. Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.2 ⚠️ has breaking changes — always check `node_modules/next/dist/docs/` |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS v4 + PostCSS | 4.x |
| Animation | Framer Motion | 12.38.0 |
| Icons | Lucide React | 1.8.0 |
| Themes | next-themes | 0.4.6 |
| Auth | NextAuth.js v4 + Prisma Adapter | 4.24.13 |
| Database | PostgreSQL via Supabase + pgBouncer | — |
| ORM | Prisma | 5.22.0 |
| AI Client | @gradio/client | 2.2.0 |
| PDF Parse | pdf-parse, pdfjs-dist, pdf-lib | mixed |
| PDF Gen | **Headless Chrome HTML→PDF** (puppeteer-core 25.1 + @sparticuz/chromium 149) + pdf-lib overlay | — |
| DOCX Parse | mammoth | 1.12.0 |
| Email | Nodemailer | 7.0.13 |
| Password | bcrypt | 6.0.0 |
| Analytics | Vercel Analytics + Speed Insights + GA4 (@next/third-parties) | — |
| Deployment | Vercel (serverless + edge) | — |

---

## 3. Environment Variables

```
DATABASE_URL            PostgreSQL + pgBouncer (app queries — use pooled connection)
DIRECT_URL              Direct PostgreSQL (migrations only — bypass pgBouncer)
NEXTAUTH_URL            http://localhost:3000 in dev; production URL in prod
NEXTAUTH_SECRET         JWT signing secret
GOOGLE_CLIENT_ID        Google OAuth (optional)
GOOGLE_CLIENT_SECRET    Google OAuth (optional)
HF_TOKEN                Hugging Face API token — SERVER SIDE ONLY, never expose to client
EMAIL_SERVER_HOST       SMTP host
EMAIL_SERVER_PORT       SMTP port (typically 587)
EMAIL_SERVER_USER       SMTP username
EMAIL_SERVER_PASSWORD   SMTP password
EMAIL_FROM              Sender email address
CRON_SECRET             Vercel cron job authorization (used in keep-awake endpoint)
DEV_PIN                 6-digit dev admin PIN — change in production
GOTENBERG_URL           (optional) self-hosted Gotenberg base URL for high-fidelity DOCX→PDF (Cloud Run). SERVER-ONLY. Unset → prewarm 501s, downloads use standard render.
GCP_SA_KEY              (optional) base64-encoded GCP service-account JSON. Used to mint Cloud Run ID tokens (Gotenberg IAM) AND GCS access tokens for the cache. SERVER-ONLY.
GOTENBERG_AUTH          (optional) static Authorization header fallback (only used if GCP_SA_KEY unset; Gotenberg has NO built-in basic auth — only for a self-hosted auth proxy)
GCS_BUCKET              (optional) GCS bucket caching rendered reports (e.g. jotril-glutenberg-reports-eu, all lowercase). Pair with GCP_SA_KEY. Without it, prewarm is skipped and every download renders fresh.
NEXT_PUBLIC_REPORT_FIDELITY_ENGINE  (DEPRECATED 2026-06-23) the fidelity path is now server-side (prewarm + GCS cache) and no longer requires a client flag. Safe to leave unset.
NEXT_PUBLIC_GA_ID       (optional) GA4 measurement id. Unset → AnalyticsTracker not mounted (see §20).
NEXT_PUBLIC_APP_URL     (optional) canonical base URL for sitemap/robots/metadata. Defaults to https://www.jotril.com.
COOKIE_DOMAIN           (optional, PROD-ONLY) parent domain (e.g. ".jotril.com") to share the NextAuth session cookie across subdomains so admin.jotril.com (auth-gated → /admin via vercel.json) sees the login. Unset → host-only cookies (default, no-op). ⚠️ Do NOT set on *.vercel.app previews — a ".jotril.com" cookie won't be sent there and login would break.
```

---

## 4. Directory Structure

```
src/
├── app/
│   ├── layout.js                    Root layout — wraps everything in <Providers>
│   ├── page.js                      Landing page (Hero, Scanner, How It Works, Capabilities, Pricing, FAQ)
│   ├── error.js                     Global error boundary
│   ├── text/page.js                 Dedicated /text scan landing route (SEO target, priority 0.9; scanner-focused variant of page.js, same useAnalyze/FileUploader)
│   ├── sitemap.js                   Next metadata route — /, /text, auth pages (baseUrl = NEXT_PUBLIC_APP_URL || https://www.jotril.com)
│   ├── robots.js                    robots.txt metadata route
│   ├── opengraph-image.jsx          Dynamic OG image
│   ├── globals.css                  CSS variables + Tailwind — defines all theme tokens
│   ├── auth/
│   │   ├── signin/page.js
│   │   ├── signup/page.js
│   │   ├── forgot-password/page.js
│   │   ├── reset-password/page.js
│   │   └── verify-email/page.jsx
│   ├── dashboard/
│   │   ├── page.jsx                 Main user dashboard (scanner + account + queue sidebar)
│   │   └── api-keys/page.jsx        Developer API key management
│   ├── admin/
│   │   ├── layout.js                Server-side ADMIN role gate — redirects to /dashboard on fail
│   │   └── page.jsx                 Admin hub (users, engine config, auto-tuner)
│   └── api/
│       ├── auth/[...nextauth]/      NextAuth handler
│       ├── auth/register/           POST — create FREE user + send verification email
│       ├── auth/verify-email/       POST — consume token, mark emailVerified
│       ├── auth/forgot-password/    POST — send reset link
│       ├── auth/reset-password/     POST — update password hash
│       ├── analyze/route.js         POST — parse file/text → budget governor → multi-scale scenarios + reserve
│       ├── attribute/route.js        POST — full engine: attribution→smoothing→classify + budget reconcile
│       ├── estimate/route.js        POST — cost preview (no model call)
│       ├── parse/route.js           POST — legacy file parsing (5MB limit)
│       ├── report/route.js          POST — render report (inline or {scanId}); scanId branch checks GCS cache first
│       ├── report/convert/route.js  POST — proxy DOCX→PDF via Gotenberg (Cloud Run ID token via GCP_SA_KEY). Currently orphaned (kept for diagnostics)
│       ├── report/prewarm/route.js  ★ POST — fired after scan completes: convert DOCX → overlay highlights+cover → upload to GCS
│       ├── report/download/route.js ★ GET (IDM-proof, navigation download) + HEAD (preflight) — streams cached PDF or renders on the fly
│       ├── gradio-proxy/route.js    POST — Edge Runtime proxy, injects HF_TOKEN server-side
│       ├── quota/route.js           GET — current quota status
│       ├── dashboard/route.js       GET — user stats, recent scans
│       ├── scan-results/route.js    GET — paginated scan history (cursor-based) | POST — persist a completed scan (auth-gated; called by useAnalyze)
│       ├── scan-results/[id]/       GET — single scan with full chunks
│       ├── keys/route.js            GET/POST/DELETE — API key management
│       ├── admin/config/            GET/PATCH/POST — engine config read/update/undo
│       ├── admin/users/             GET — all users with stats
│       ├── admin/auto-tune/         POST/GET — dataset management
│       ├── admin/auto-tune/[id]/run POST — start tuning job | GET — SSE stream of progress
│       ├── admin/auto-tune/[id]/apply POST — apply best config to production
│       ├── admin/auto-tune/[id]/cancel POST — cancel in-progress run
│       └── cron/keep-awake/         GET — pings HF Spaces daily (requires CRON_SECRET header)
│
├── components/
│   ├── Providers.jsx                SessionProvider + ThemeProvider + ProcessProvider + ScanGuard + DevTools (dynamic, dev-gated DevDebugOverlay)
│   ├── ScanGuard.jsx                In-app "scan in progress" banner + beforeunload guard (subscribes to QueueManager)
│   ├── Navbar.jsx                   Fixed nav, auth status, tier badge, mobile hamburger, magnetic fx
│   ├── FileUploader.jsx             Drag-drop (PDF/DOCX/TXT ≤20MB) + textarea (50k chars) + cost preview
│   ├── ScoreGauge.jsx               Stacked bar: human%/mixed%/ai%, label, metadata
│   ├── HeatmapViewer.jsx            Sentence-level color map (grouped into paragraphs by chunk.para to preserve spacing); truncates to a preview past 100 sentences + points to the PDF; hover tooltips + dev metrics
│   ├── QuotaBar.jsx                 10-segment bars for points/text/doc usage + tier badge
│   ├── SignUpNudge.jsx              Conversion banner (guest→signup, free→pro), sessionStorage dismiss
│   ├── Toast.jsx                    Individual toast notification (pub-sub)
│   ├── ToastContainer.jsx           Fixed top-right container for toasts
│   ├── GlitchLogo.jsx               Animated Jotril AI logo
│   ├── ThemeSwitcher.jsx            Light/dark/colorful toggle via next-themes
│   ├── ProcessOverlay.jsx           Cinematic progress modal (analyze/upload/download variants) + Cancel button (when cancellable)
│   ├── ColdStartOverlay.jsx         GPU warmup screen with Retry button
│   ├── QueueSidebar.jsx             Background job queue display + per-job ✕ cancel — imports QueueManager at top level
│   ├── DevDebugOverlay.jsx          Dev tools overlay (imports QueueManager) — loaded dynamically + dev-gated via Providers, NOT in the global bundle
│   ├── InteractiveBackground.jsx    Particle canvas (50 desktop / 25 mobile, responsive)
│   ├── ProcessContext.jsx           Global process-overlay state + cancel registration (openProcess(variant,title,step,onCancel) / cancelProcess)
│   ├── AnalyticsTracker.jsx         GA4 pageview tracker (mounted in layout.js only when NEXT_PUBLIC_GA_ID is set)
│   ├── GlitchFavicon.jsx            Animated favicon (canvas → link rel=icon)
│   ├── OfflineBanner.jsx            window.online/offline banner; pauses/resumes the QueueManager (see §9 offline pause)
│   └── ServiceWorkerRegister.jsx    Registers the PWA service worker (offline resilience)
│
├── hooks/
│   ├── useAnalyze.js                Main analysis orchestrator hook — two-call flow: /api/analyze → queue windows → /api/attribute → persist scan (see §7)
│   ├── usePPP.js                    Purchase Power Parity pricing via geojs.io
│   └── useOnlineStatus.js           Subscribes to window.online/offline (drives OfflineBanner + queue pause)
│
└── lib/
    ├── queue-manager.js             ★ Global singleton queue + auto-sweeper (see §7 and §9)
    ├── jotrilService.js             HF Space client + load balancer + proxy wrapper (see §8)
    ├── chunking.js                  Multi-scale analysis engine + DEPTH_PROFILES + DEFAULT_BUDGET_CONFIG (see §6)
    ├── budget-governor.js           ★ Server-only. Paces full-engine live scans vs Vercel invocation budget (see §14/§15)
    ├── auto-tuner.js                Grid search optimizer (used by admin, NOT live analysis)
    ├── quota-manager.js             Dual-gate quota system (count ceiling + points budget)
    ├── auth-security.js             Brute force protection + token management
    ├── prisma.js                    Prisma singleton (avoids hot-reload connection leaks)
    ├── email.js                     Nodemailer + branded HTML email templates
    ├── file-parser.js               PDF/DOCX/TXT extraction (PDF uses pdf-parse v2 `PDFParse` class) + `htmlToProseText` (strips tables for scoring)
    ├── parse-analysis-stream.js     SSE stream parser for Gradio responses
    ├── download-report.js           ★ Client entry for "Download PDF" — PDF→overlay, scanId→GET /api/report/download (IDM-proof navigation), inline→POST /api/report (see §19)
    ├── report/                      ★ Headless-Chrome report engine: design-system, report-template, highlight-injector, render, server-overlay (see §19)
    ├── gotenberg.js                 ★ Server-only Gotenberg client (`convertDocxToPdf`); Cloud Run ID token from GCP_SA_KEY w/ GOTENBERG_AUTH fallback (see §19)
    ├── report-storage.js            ★ Server-only GCS cache for rendered reports (REST API + GCP_SA_KEY access token; no extra dep). Key `${userId}/${scanId}.pdf` (see §19)
    ├── pdf-generator.js             DEPRECATED shim — old pdfmake/html-to-pdfmake generator, replaced by report/ + /api/report
    ├── pdf-overlay.js               In-place highlight overlay on original PDFs (pdf-lib) + merged branded cover. WORD-LEVEL resyncing mapper (see §19)
    ├── empty-module.js              Build stub — aliases pdfjs-dist's require("canvas") out of the client bundle
    ├── fingerprint.js               Client-side hardware fingerprinting (15+ signals, 0-100 score)
    ├── exclusion-filter.js          Filters generic/boilerplate sentences from scoring
    └── resilient-fetch.js           Client fetch wrapper: timeout + idempotency-aware retry + backoff (getJSON/postJSON). Adopted in useAnalyze/usePPP/download-report/dashboard/QuotaBar; jotrilService.secureFetch still uses raw fetch (own timeout/retry). NOT a global override.

prisma/
├── schema.prisma
└── migrations/

public/           Static assets, favicon, branding

vercel.json       Cron: /api/cron/keep-awake daily at 0 0 * * * UTC
```

---

## 5. Database Schema (Prisma Models)

| Model | Key Fields | Purpose |
|---|---|---|
| User | id, email, password, name, role, emailVerified, purchasedPoints | Auth + tier + wallet |
| ApiKey | id, key (`jt_<32-hex>`), userId | External REST API keys |
| QuotaUsage | hash, userId, type, pointsCost, textHash, createdAt | Usage tracking per device/user |
| ScanResult | userId, filename, type, chunks (JSON), breakdown, overallLabel, **sourceHtml** (Text?, ≤2MB) | Persisted scan output; sourceHtml = reproduced DOCX HTML for high-fidelity past-scan PDFs |
| PasswordResetToken | token, userId, expiresAt (1h) | Password recovery |
| EmailVerificationToken | token, identifier, expiresAt (24h) | Email confirmation |
| AccountLockout | identifier, failedAttempts, lockedUntil | Brute force protection |
| Account | (NextAuth) OAuth provider accounts | |
| Session | (NextAuth) user sessions | |
| EngineConfig | id='global', data (JSON), previousData (JSON) | Single-row ML config + undo |
| TuningDataset | id, name, samples, scoreCache | Labeled training data |
| TuningRun | id, datasetId, status, bestConfig, bestAccuracy, bestMcc, log | Tuner job history |
| UsageBudget | month (id "YYYY-MM"), used, todayUsed, ewmaDaily, lastDay | Monthly Vercel-invocation budget for the governor (reservation model) |

---

## 6. The Chunking Engine (`src/lib/chunking.js`)

This is the heart of detection accuracy. Key exports:

- **`splitIntoSentences(text)`** — uses `Intl.Segmenter` with `granularity: 'sentence'`, filters fragments < 6 chars. **This is what `/api/analyze` uses for the live analysis path.**

- **`generateAnalysisScenarios(text)`** — generates multi-scale sliding windows (1-5 sentences), leave-one-out perturbation, full paragraph baseline. **Used by `auto-tuner.js` only, NOT the live path.**

- **`attributeScoresToSentences(sentences, scenarios, scores, burstinessNudge, engineCfg, sentenceToScenarioMap)`** — three-signal attribution:
  - Signal 1 Direct (weight 0.30): confidence-scaled weighted average of all window scores
  - Signal 2 Differential (weight 0.43): marginal contribution via delta pairs (what changes when a sentence is removed)
  - Signal 3 Anchor (weight 0.27): high-confidence windows only (≥0.85 threshold)

- **`contextualSmooth(chunks, engineCfg)`** — nudges ambiguous sentences (score 25-75) toward their neighbors' consensus. Short phrases (≤5 words) heavily inherit surroundings (80% neighbor, 20% self).

- **`classifyResults(chunks, engineCfg)`** — thresholds: human ≤62, mixed 63-75, ai ≥76. Doc-level: ai ≥60% → "Predominantly AI Generated", ai≥30% or mixed≥40% → "Mixed Content".

- **`calculateBurstinessNudge(sentences, engineCfg)`** — high sentence-length variance = more human. Returns 0/5/10 nudge subtracted from high-AI scores.

**Engine config** (`getEngineConfig()`) — loads from `EngineConfig` DB row with 30s TTL cache, falls back to hardcoded `SIGNAL_CONFIG` defaults. Admin Hub can tune all weights live.

**⚠️ Architecture note (UPDATED — live path now runs the FULL engine):** As of 2026-06-20 the live analysis path runs the *same* pipeline the auto-tuner optimizes against (`evaluateConfig`): `generateAnalysisScenarios(text, depth)` → query each multi-scale window via the client queue → `attributeScoresToSentences` → `contextualSmooth` → `classifyResults`. The model's **AI probability** (0-1) is the per-window input; the full 3-signal attribution + smoothing + burstiness then produces per-sentence scores, banded by `humanMax`/`mixedMax`. This means all ~20 tuned EngineConfig params are now live (previously 18 were tuned-but-ignored). The earlier "live path uses just the threshold band" note is obsolete. Analysis **depth** (`full`/`reduced`/`minimal`) is chosen per scan by the budget governor (§14/§15) to pace invocation cost.

---

## 7. Full Analysis Flow (Live Path) — FULL ENGINE, two-call

The live path now runs the full multi-scale engine (same as the auto-tuner), gated
by the budget governor. **Two server round-trips** bracket the client-side querying.

```
User submits text or file
  ↓
useAnalyze.handleAnalyze() [src/hooks/useAnalyze.js]
  ↓
POST /api/analyze [src/app/api/analyze/route.js]
  - Parses file (PDF/DOCX/TXT)
  - Resolves tier server-side (getServerSession → role; never trust client)
  - budget-governor.resolveScan({ tier, text }):
      • loadAndRollBudget (EWMA day-roll)  • decideDepth (tier + predictive throttle)
      • generateAnalysisScenarios(text, depth) → dedup  • cost-fit step-down
      • reserve(estimate) into UsageBudget (atomic)
  - Returns { scenarios[], sentences[], depth, estimate, monthKey, callsPerQuery, sourceHtml, filename, chunkCount }
  ↓
QueueManager.enqueueJob(meta, uniqueTexts.map(t => ({text:t})), tier, callback)
  - uniqueTexts = scenarios.map(s => s.text)  ← queries WINDOWS, not raw sentences
  - results[] come back PARALLEL to uniqueTexts (== scenarios)
  ↓
_runWorkerLoop() [concurrent] → queryJotrilModel(text, space) → { aiProbability, score, ... }
  AUTO-SWEEPER: nulls retried ≤3×, then fallback { label:'mixed', confidence:0.5, error:true }
  ↓
onScanComplete(windowResults) callback [useAnalyze.js]:
  - scores = windowResults.map(r => r?.aiProbability ?? null)   (parallel to scenarios)
  - POST /api/attribute { sentences, scenarios, scores, estimate, monthKey, callsPerQuery, executedQueries }
  ↓
POST /api/attribute [src/app/api/attribute/route.js]  (pure CPU, ~ms)
  - rebuild scores100 parallel to scenarios (+ <10-word confidence penalty, == tuner)
  - calculateBurstinessNudge → attributeScoresToSentences → contextualSmooth → classifyResults
  - reconcileScan: refund (estimate − actual) into UsageBudget
  - Returns { chunks:[{text,score,label}], breakdown, overallLabel }
  ↓
processFinalResults(chunks, html, file) [useAnalyze.js]
  - Maps labels → bgColors (ai=red, mixed=amber, human=transparent)
  - Recomputes breakdown/overallLabel from labels → HeatmapViewer + ScoreGauge render
```

**Why two calls:** the heavy window querying must stay on the client queue (Edge proxy,
no Vercel timeout); attribution + classification must stay server-side (needs Prisma-backed
`getEngineConfig()`). Scenarios round-trip to `/api/attribute` (keeps everything stateless).

---

## 8. Gradio Proxy & Service (`src/lib/jotrilService.js`)

**Three HF Spaces (load balanced):**
```js
SPACES = ['JedBabs/Jotril-Space-1', 'JedBabs/Jotril-Space-2', 'JedBabs/Jotril-Space-3']
```
Chunks are distributed by `chunkIndex % SPACES.length`. `MAX_CONCURRENCY` auto-scales
as `PER_SPACE_CONCURRENCY (30) × SPACES.length` → 90 with 3 Spaces (free CPU tier; HF
fair-use allows ~3 running free CPU Spaces). Add a 4th name here and concurrency follows.

**`queryJotrilModel(text, spaceName)`:**
1. Builds submit URL: `https://${spaceName.replace('/','-')}.hf.space/gradio_api/call/predict`
2. POSTs via `secureFetch` — wrapped call to `/api/gradio-proxy` with `body: JSON.stringify({ data: [text] })`
3. Gets back `{ event_id }` from Gradio
4. Polls status URL `gradio_api/call/predict/${eventId}` via GET through proxy ⚠️ **MUST be `/predict/` (matches the submit api_name), NOT `/batch/`** — polling `/batch/` only returns endless `event: heartbeat / data: null` and never resolves (was the recurring "Polling Timeout Extinguished" + resubmit loop, fixed 2026-06-20).
5. Parses the SSE call-API stream: `event: complete` + `data: [ {label, confidences:[{label,confidence}]}, scorePct, aiProbability ]` (NOT the old `{"msg":"process_completed"}` queue protocol). Extracts `aiProbability = payload[2]`.
6. Retries on 429 rate-limit (max 5, exponential backoff to 10s), on other errors retries up to 5 total
7. Returns `{ text, score (0-100 = round(aiProbability*100)), aiProbability, confidence, rawLabel, sourceSpace }`. **`aiProbability` is the source of truth** — the full engine consumes it; `rawLabel` (normalized ai/human) is only a fallback if probability is missing.

**`secureFetch(targetUrl, options)`** — wrapper that POSTs to `/api/gradio-proxy` with `{ targetUrl, options }`. Increments `proxyStats.calls` (exported) — the honest per-request tally (submit + every poll) that the queue reflects into `telemetry.edgeProxyCalls`.

**`/api/gradio-proxy/route.js` (Edge Runtime):**
- **Scan-token gate (2026-06-29):** requires a valid `jotril_scan` HttpOnly cookie (HMAC, issued by `/api/analyze` via `lib/scan-token.js`) — without it the proxy was an open relay for `HF_TOKEN`. Fails open only if `NEXTAUTH_SECRET` is unset.
- **Host allow-list (2026-06-29):** `isAllowedTarget()` parses the URL and matches the **hostname** (`=== 'huggingface.co' || endsWith('.hf.space')`) + requires `https:`. The old `url.includes('.hf.space')` substring check was an SSRF token-exfil hole (`evil.com/?x=.hf.space` passed).
- Injects `Authorization: Bearer ${HF_TOKEN}` server-side
- Passes `options` directly to `fetch(targetUrl, options)` — body must be a pre-stringified string

**⚠️ Body serialization critical note:** The proxy round-trip deserializes the body from JSON string back to a JS object. The proxy then calls `fetch(targetUrl, options)` with that object. `fetch` cannot auto-serialize a plain object — it sends `[object Object]`, causing Gradio FastAPI to return 422. **The body MUST be `JSON.stringify(...)` before passing through `secureFetch`.** This was a recurring 422 bug.

**`pingJotrilModels()`** — checks if Space is RUNNING via HF API. Used by keep-awake cron.

**`predictBatch(texts, onProgress, checkCancel, concurrency, batchDelay)`** — multi-worker batch executor for the auto-tuner. Uses module-level `currentIndex` (potential issue with concurrent calls — not in live path).

**`queryJotrilBatch(texts, spaceName)`** — alternative batch endpoint. Has a bug (always throws — second `throw` is unconditional). Dead code, not used in live path.

---

## 9. Queue Manager Deep Dive (`src/lib/queue-manager.js`)

**Singleton** — `new JotrilQueueManager()` always returns the same instance via `JotrilQueueManager.instance`.

**Tier field REMOVED (2026-06-29).** The queue used to carry a per-chunk `tier` and re-sort `(a,b) => b.tier - a.tier`, but it was inert: a **per-browser singleton** (every chunk belongs to one user → nobody to prioritize against) AND the UI never passed a real tier (defaulted to 1). It's now deleted — `enqueueJob(fileOrMeta, chunkDataArray, onScanComplete)` (no tier param), FIFO push, no sort. Sweeper-recovered chunks are still preempted via `queue.unshift(...)` (front-loaded, no sort needed). **Real tier differentiation lives server-side, before the queue:** the budget governor maps tier→depth (how many windows get queued, §14/§15) and quota-manager maps tier→limits (§10).

**Key state:**
```js
queue: []                  // Pending chunk jobs, sorted descending by tier
activeJobs: Map            // jobId → job object
activeWorkers: number      // Currently running _runWorkerLoop instances
PER_SPACE_CONCURRENCY: 30  // Validated free-CPU-Space ceiling (empirical)
MAX_CONCURRENCY            // = PER_SPACE_CONCURRENCY × SPACES.length → 90 with 3 Spaces (downscales on drops)
estimatedLatencyMs: 1200   // Used for ETA calculations
telemetry: {
  processedChunks,         // Total successfully processed
  connectionDrops,         // Total failed chunks (before sweep)
  sweeperRetries,          // Total chunks re-queued by auto-sweeper
  sweeperEngagements,      // How many times sweeper triggered
  edgeProxyCalls           // Synced in _notify from jotrilService.proxyStats.calls (honest submit+poll tally, session-scoped)
}
```

**ETA / progress notes:**
- `calculateJobETA(jobId)` returns **milliseconds**; `_notify` converts to seconds for the sidebar (`etaSeconds`). (Bug fixed 2026-06-20: it was emitted as raw ms → "408:40".)
- Worker spawns are **staggered over ~500ms** so 60-90 queries don't fire (and complete) in lockstep — smooths the progress bar. On free CPU the residual wave is the Space's batch inference time, not idle.
- Real budget enforcement lives server-side in `UsageBudget`/budget-governor; `edgeProxyCalls` is just a dev-overlay gauge.

**Job object shape:**
```js
{
  id: string (UUID),
  filename: string,
  totalChunks: number,
  completedChunks: number,
  results: Array(totalChunks).fill(null),     // fills in as chunks complete
  originalChunks: Array<{text: string}>,       // used by sweeper for retries
  retries: Array(totalChunks).fill(0),         // per-chunk retry counter
  tier: number,
  onScanComplete: function(results)
}
```

**Chunk queue item shape:**
```js
{ jobId, chunkIndex, chunkData: {text: string}, tier }
```

**Auto-Sweeper logic (MAX_SWEEPER_RETRIES = 3):**
- When all completedChunks >= totalChunks, scan results[] for nulls
- If retries[idx] < 3: re-inject chunk at tier 999, rollback completedChunks, increment retry counter
- If retries[idx] >= 3: substitute `{label:'mixed', confidence:0.5, error:true}` — chunk is unblocked
- Each sweeper engagement: downscale `MAX_CONCURRENCY = max(10, floor(current / 1.5))`
- `continue` in while loop organically picks up re-injected chunks (no manual worker spawn needed)

**Worker lifecycle:**
- `enqueueJob` spawns `min(MAX_CONCURRENCY - activeWorkers, queue.length)` workers (staggered start)
- Each worker runs `_runWorkerLoop()` which loops until queue is empty
- On exit: `this.activeWorkers--` releases the slot
- **Space pick is failover-aware:** `SPACES[(chunkIndex + retries[idx]) % SPACES.length]` — a sweeper-reinjected chunk starts on a *different* Space than the one that failed it. Combined with `queryJotrilModel`'s per-retry rotation, one dead Space costs ~1 extra request/chunk instead of degrading ⅓ of the scan (see §8).

**Cancellation (`cancelJob(jobId)`):** sets `job.cancelled = true` **before** deleting the job from `activeJobs` and filtering the queue. Queued chunks of the job are skipped via the existing `if (!parentJob) continue` guard; a worker already awaiting an in-flight query holds a live reference to the job object, so `_runWorkerLoop` re-checks `parentJob.cancelled` before the finish/sweeper block and before firing `onScanComplete` — without the flag a cancelled job could still write results and fire its callback. Callers: `useAnalyze.cancelAnalysis` (foreground/overlay) and the per-job ✕ in `QueueSidebar` (background). See §15 (2026-06-22).

**Offline pause/resume (2026-06-28):** `pause()`/`resume()` suspend NEW chunk pickup without cancelling in-flight queries — workers `await _waitWhilePaused()` between chunks and wake when `resume()` flushes the waiter set (`_pauseWaiters`). Driven by `OfflineBanner`/`useOnlineStatus` on `window.offline`/`online` so a network drop stops hammering the proxy/Spaces instead of burning retries. No-op when nothing is queued. Concurrency is also network-adaptive: `_adaptConcurrencyToNetwork()` reads `navigator.connection.effectiveType` and lowers `MAX_CONCURRENCY` on 2g/3g (full pool on 4g/wifi/unknown). **Stale code comments:** `queue-manager.js` line ~19 still says `30 × 2 = 60` (it's 30 × SPACES.length = 90 with 3 Spaces) and line ~26 references the debunked "Vercel 100K daily limit" (it's 1M/month — see §14). Doc values are authoritative.

**Important — `QueueSidebar` imports `QueueManager` at the TOP LEVEL** (not dynamically). Any syntax or parse error in `queue-manager.js` crashes the ENTIRE client bundle including `layout.js`, taking down all pages. (`DevDebugOverlay` *used* to as well, but as of 2026-06-22 it's `dynamic(..., {ssr:false})` + dev-gated in `Providers`, so it's no longer in the global bundle — a parse error there now only surfaces for dev users when the lazy chunk loads. `ScanGuard` lazy-imports `queue-manager` inside an effect.)

---

## 10. Quota System (`src/lib/quota-manager.js`)

**Dual-gate:** count ceiling per activity type AND points budget (shared fuel tank).

| Tier | Points/day | Texts/day | Docs/week | Max file |
|---|---|---|---|---|
| UNAUTHENTICATED | 250 (lifetime) | 3 | 1 | 2MB |
| FREE | 400 | 5 | 1 | 5MB |
| PRO | 2500 | 30 | 10 | 20MB |
| ULTRA | 50000 | unlimited | unlimited | 100MB |
| ADMIN | unlimited | unlimited | unlimited | unlimited |

Point cost: `Math.max(10, Math.min(200, sentenceCount * 3))`

Quota is tracked per device (hardware fingerprint hash) for unauthenticated users, per userId for authenticated users. Results are cached for 24h by text SHA-256 hash (so re-scanning the same text is free).

**⚠️ Enforcement lives in `/api/analyze`, NOT `/api/estimate`.** `checkQuota` + `recordQuotaUsage` are called on the analyze route (the binding gate); `/api/estimate` only previews cost and records nothing. The device hash uses a **stable-signal subset** (`hashFingerprint` → `STABLE_FP_KEYS`) so a single volatile signal can't reset the quota. Unauthenticated scans also pass a generous per-IP/hour flood breaker (`checkIpFloodGate`, reuses the `AnalysisRequest` table). See §15 (2026-06-22).

---

## 11. Authentication

- **Email/password** via NextAuth Credentials provider + bcrypt hashing
- **Google OAuth** via NextAuth Google provider
- **Dev PIN** — 6-digit pin from `DEV_PIN` env var for dev/admin access without email verification
- **Brute force protection** — 10 failed attempts → 3-minute lockout (AccountLockout model)
- **Session** — JWT + Prisma Adapter persistence
- **Role hierarchy** — FREE < PRO < ULTRA < ADMIN

Middleware (`src/middleware.js`) protects `/dashboard` and `/admin`. Admin routes additionally server-side check role in layout.

---

## 12. Admin Features

- **User management** — view all users, change tier, mint purchased points
- **Engine config** — tune all 20+ signal weights live (saves to EngineConfig DB row, supports undo)
- **Auto-tuner** — upload labeled datasets (JSON: `[{text, label: "human"|"ai"}, ...]`), run exhaustive 4-phase grid search, SSE-stream progress, apply winning config to production

**Auto-tuner pipeline** (runs via Next.js `after()` hook, background):
1. Prepare documents (normalize, stitch)
2. Score cache — generate multi-scale scenarios, deduplicate, batch-query HF Space (16 workers), cache results in DB
3. Baseline evaluation against current config
4. Grid search — Phase 1 coarse (~50k combos), Phase 2 medium (all 20+ params), Phase 2.5 interaction pairs, Phase 3 fine refinement. 4.5 min hard deadline.
5. Final validation — train/test/full metrics + top 20 trials
6. Save to TuningRun. Admin can apply or revert.

**Objective (UPDATED 2026-06-20 — was doc-level binary MCC):** `evaluateConfig` now scores at the **sentence level** (valid because synthetic docs are same-label stitched, so every sentence's truth = the doc label — ~5x more signal). It optimizes `objective = balancedAccuracy − mixedPenalty × mixedFraction` where `balancedAccuracy = (aiRecall + humanRecall)/2`. This rewards high, balanced ai+human accuracy and penalizes "mixed" (mixed never matches a true label), so the tuner pushes **tighter mixed margins + more decisive labels** — what the product wants. `DEFAULT_MIXED_PENALTY = 0.30` (constant, NOT in PARAM_SPACE — tuning the penalty that defines the objective would be circular). `PARAM_SPACE` mixed band also tightened (humanMax max 78, mixedMax max 80). Doc-level MCC/accuracy still computed and returned for reporting (`bestMcc`).

---

## 13. Theming & Design System

**Three themes** via `next-themes` + `data-theme` on `<html>`:
- `light` — "Frost" (white/blue)
- `dark` — "Obsidian" (dark navy/purple)
- `colorful` — "Neon Cosmos" (neon accents)

CSS variables defined in `globals.css`: `--dyn-accent-blue`, `--dyn-glass-bg`, `--dyn-glass-border`, etc. All components use these tokens, never hardcoded colors.

Semantic score colors: `score-human` (#10B981 green), `score-ai` (#EF4444 red), `score-mixed` (#F59E0B amber).

Design language: glassmorphism (`backdrop-filter: blur(24px)`), gradient buttons, Framer Motion springs, magnetic hover effects, Tailwind `rounded-2xl`/`rounded-3xl` cards.

**InteractiveBackground** — particle canvas, responsive: 50 particles desktop / 25 mobile (isMobile = width < 768), connection distance 120 desktop / 80 mobile. Reacts to CSS theme variable changes.

---

## 14. Platform Constraints & Limits

### Vercel — CURRENT PLAN: **Hobby (free)** ⚠️
- Serverless function timeout: 10s default / 60s max (Hobby) vs 300s (Pro). Cold-start GPU init takes 30-60s → **must use Edge Runtime or background/queue processing, NOT synchronous await in serverless functions**.
- `/api/gradio-proxy` uses `export const runtime = 'edge'`. Edge requests have a 120s proxied-request timeout (not unlimited).
- **🚩 INVOCATION BUDGET (the binding constraint):** Every `/api/gradio-proxy` call = 1 Function Invocation. Hobby includes **1,000,000 invocations per MONTH** (NOT a daily limit — the old "~100K/day" comment in `queue-manager.js` is a myth and should be ignored). Verified against https://vercel.com/docs/limits (2026-05-20).
  - Each model query = 1 submit + ≥1 poll ≈ **2+ invocations**. `telemetry.edgeProxyCalls` currently counts 1-per-query (undercounts) and is session-scoped (resets per page load) — it does NOT track the real global monthly total.
  - **Exhaustion PAUSES the whole deployment** (no overage billing on Hobby) — site goes fully dark until the month resets. This is why the full-engine path needs a budget governor (see §15 Ongoing).
- **🚩 Hobby is NON-COMMERCIAL ONLY.** Jotril has paid tiers / purchased points / PPP pricing = commercial use, which violates Hobby ToS. **A production launch requires upgrading to Pro ($20/seat/mo).** Pro also raises invocations to usage-based ($0.60 per 1M after credit) and Edge Requests included to 10M.
- Cron jobs protected by `CRON_SECRET` header check.

### Hugging Face Spaces
- Free-tier / ZeroGPU spaces sleep after 48h inactivity → 30-60s cold start.
- `vercel.json` cron pings `/api/cron/keep-awake` daily at midnight UTC to prevent sleep.
- Three spaces (`Jotril-Space-1/2/3`) load-balanced by chunk index modulo (free CPU tier, ~30 concurrent each → MAX_CONCURRENCY 90).
- **Failover routing:** `queryJotrilModel` rotates to the next Space on each retry (`SPACES[(startIdx + retryCount) % SPACES.length]`); 429 rate limits stay put (others share the quota), but cold-start/5xx/timeout/network errors trigger Space rotation. The queue worker also offsets its pick by `parentJob.retries[chunkIndex]` so a sweeper-reinjected chunk starts on a DIFFERENT Space than the one that failed it. Net effect: one dead Space costs ~1 extra request per affected chunk instead of degrading ⅓ of every scan to the `mixed` fallback.
- **keep-awake** (`/api/cron/keep-awake`) warms every Space with a real `queryJotrilModel` request (a real inference call resets the 48h sleep timer; a Hub *status* check does NOT). Now imports the shared `SPACES` from jotrilService (was a hardcoded 2-Space list → Space-3 wouldn't have been kept awake). The standalone `pingJotrilModels` was likewise fixed to fire a warmup submit at all Spaces.

### Supabase PostgreSQL
- App uses `DATABASE_URL` (pgBouncer pooled) for all queries.
- Migrations use `DIRECT_URL` (direct connection, bypasses pooler).
- Serverless concurrency can exhaust free-tier connections — pgBouncer pooling is essential.

### Pricing (PPP via geojs.io)
- Global: $19 | Eastern Europe/SEA: $9 | LATAM/Africa: $7 | India: $5 | Nigeria: ₦5,000
- Falls back to $19 on geo-API failure. `usePPP.js` handles this gracefully.

---

## 15. Known Issues & History

### Fixed 2026-06-29 (security + correctness audit pass — all verified: build exit 0, tests 17/17, lint clean, scan-token 12/12, SSRF allowlist 11/11)
- **🚩🚩 `/api/gradio-proxy` was an unauthenticated open relay that leaked `HF_TOKEN` (critical).** Two compounding holes: (1) the target allow-list was a substring check — `targetUrl.includes('.hf.space')` — so `https://evil.com/?x=.hf.space` passed and the proxy then sent the injected `Authorization: Bearer HF_TOKEN` to the attacker (token exfiltration); (2) no auth at all, so anyone could drive the server's HF token (cost/abuse) and bypass the budget governor entirely. **Fix:** (a) `isAllowedTarget()` now parses the URL and matches the **hostname** (`=== 'huggingface.co' || endsWith('.hf.space')`) and requires `https:` — verified against 11 vectors incl. substring/suffix/non-https; (b) the proxy now requires a valid **scan token** (HttpOnly, SameSite=Strict cookie `jotril_scan`) issued by `/api/analyze` after the governor admits the scan. New `src/lib/scan-token.js` (Web-Crypto HMAC of `{exp}` with `NEXTAUTH_SECRET`; runs in BOTH node + edge). `/api/analyze` sets the cookie on its success response; the edge proxy verifies it. **Fails OPEN only if no `NEXTAUTH_SECRET`** (so a misconfig can't brick scans; in practice it's always set). Works for guests + authed (cookie auto-sent, same-origin). **Chosen over threading a token through the queue** — the cookie has far lower blast radius (no `queue-manager`/`jotrilService` plumbing). Residual: the token is a "came through the front door" gate, not a per-call cap — an HttpOnly cookie is replayable within its 2h TTL but not XSS-readable; the authoritative invocation budget still lives in `UsageBudget`.
- **🚩 The public REST API `/api/v1/detect` was doubly broken (returned garbage).** It read `result.aiScore`/`result.humanScore`/`result.label`, but `queryJotrilModel` returns `{ score, aiProbability, confidence, rawLabel }` → `ai_probability`/`human_probability` were `NaN`→`null` and `label` `undefined`. Worse, it called `queryJotrilModel(text)` with **no Space**, so `currentSpace.replace(...)` threw before any result (→ 500). **Fix:** `queryJotrilModel` now defaults `spaceName = SPACES[0]`; the route maps `ai_probability = round(result.score)`, `human_probability = 100 - that`, and bands `label` with the engine's default thresholds (human ≤62 / mixed 63-75 / ai ≥76). Added a null-score 502 guard BEFORE charging quota (no charge for a failed scan).
- **🚩 Budget reservation undercounted real invocations (governor was "soft").** Reserve = `uniqueWindows × callsPerQuery` (2), but a query is 1 submit + up to 15 polls + up to 5 Space retries + 3 sweeper retries; `reconcileScan` only ever **refunded**, so retry/poll-heavy scans (exactly when Spaces are flaky) silently overshot the cap. **Fix:** the queue now tallies the TRUE per-job proxy-call count (`queryJotrilModel` calls an `onProxyCall` hook on every submit/poll/retry; the worker accumulates `parentJob.proxyCalls`, concurrency-safe via per-job closures), passes it through `onScanComplete(results, {proxyCalls})` → `useAnalyze` → `/api/attribute` as `actualInvocations`. `reconcileScan` is now **two-directional** — refunds when under, **reserves the overage when over** — so the monthly budget reflects reality. Falls back to the old estimate for older clients. Residual: `reconcile`/`reserve` aren't strictly idempotent under client retries (pre-existing class; drift bounded and biased safe).
- **API keys were stored in plaintext.** A DB read exposed every usable key. **Fix:** `/api/keys` POST now persists `sha256(rawKey)` and returns the raw key ONCE; `/api/v1/detect` looks up by hash with a plaintext fallback so legacy keys still work until rotated. GET masking updated (can't show real chars of a hashed key). No schema change; no migration run (beta has ~no real API consumers; the API was broken anyway).
- **Host-header injection in email links.** `register` + `forgot-password` built verification/reset URLs from the client-controlled `Host` header (spoofable → poisoned links). **Fix:** prefer `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`, fall back to Host only when neither is set (dev).
- **No security headers.** Added a `headers()` block in `next.config.mjs`: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`. **Deliberately NOT a strict CSP** — a correct CSP (inline styles, framer-motion, Vercel/GA analytics, Google Fonts, same-origin proxy) needs its own tested pass; a wrong one silently breaks the page. Follow-up.
- **Middleware logged token role/keys on every request.** Removed the per-request `console.log`s (noise + minor info disclosure + hot-path cost).
- **`/api/analyze` hot path:** the IP flood breaker and dual-gate quota check (independent reads) now run in one `Promise.all` wave instead of two serial Supabase round-trips.
- **Composite indexes** added to `QuotaUsage` (`[userId, type, createdAt]`, `[hash, type, createdAt]`) matching the dual-gate reads. ⚠️ **Schema only — needs `prisma db push` (NOT run) to take effect.**
- **Dead code removed:** `queryJotrilBatch` (unconditional `throw`, zero importers) deleted.
- **Stale tests fixed:** the 4 pre-existing failures (asserted `SPACES.length===2`, `MAX_CONCURRENCY===10`, `estimatedLatencyMs===1500`, removed `getGlobalQueueDepthMs`) updated to current reality → suite green 17/17.
- **Still open (not code):** strict CSP (above); `prisma db push` for the new indexes; rotate the `.git/config` HF token.

### Polish 2026-06-29 (product/UX/cleanup — verified: build exit 0, tests 17/17, lint clean)
- **Multimodal copy softened to "AI text detection (more modalities coming)"** — `layout.js` metadata, `page.js` hero + feature cards, `opengraph-image.jsx`. The Image/Video/Audio cards were already honest (`status:"coming"`). See §20.
- **Inert queue tier-sort deleted** — `enqueueJob` lost its `tier` param; FIFO push, no sort; sweeper preemption via `unshift`. Updated `useAnalyze` (dropped `userTier`), `QueueSidebar` (removed dead "Priority Pro Access" badge), and the queue test. See §9.
- **Landing page reachable when logged in.** Removed the middleware `/`→`/dashboard` forced redirect (middleware no longer matches `/`); first-login still routes to `/dashboard` via the sign-in flow's `router.push`. Added a **"Home"** link to the authenticated navbar (desktop `MagneticLink`, mobile `next/link`).
- **🚩 Signed-in users were told to "sign in to upload."** `FileUploader`'s upload gate read an `isLoggedIn` **prop** that the dashboard never passed (`undefined` → falsy). Now it derives auth from `useSession()` directly (prop still overrides), so a caller can't break it. Also replaced the warning toast with a **designed sign-in overlay** (glass card + gradient CTAs, Framer Motion, click-outside / Esc / X to dismiss, `role="dialog"`) prompting guests to sign up / sign in — guests can still paste text. Dropzone click short-circuits to the overlay for guests. Plus a pre-existing lint nit cleanup (`set-state-in-effect` in the cost-preview effect → state writes moved into the debounced callback).
- **🚩 Dead landing-page navigation ("click does nothing / just refreshes").** (a) The live "Text Scanner" product card + 3 CTAs ("Launch Text Scanner", "Try Text Scanner Free", footer) all hard-linked to `https://textscanner.ai.jotril.com`, which serves the root route (→ looked like a refresh) — repointed to the `/text` route (card uses `next/link`). (b) The shared `Navbar` anchor links (`#how-it-works`/`#capabilities`/`#pricing`/`#faq`) target sections that live on `/text`, not the landing hub (`/` only has `#products`), so they silently did nothing on the landing page — `handleClick` now falls back to `/text#section` when the anchor isn't on the current page (smooth-scroll preserved on `/text`).
- **Root scratch pile cleaned** (~51 one-off debug/patch/tmp files deleted; 6 genuine dev tools kept). See §15 "Scratch Files in Root".
- **Admin subdomain (`admin.jotril.com`) couldn't authenticate.** `vercel.json` rewrites the host's `/*` → `/admin/*`, but `/admin` is auth-gated (`admin/layout.js` → `getServerSession`) while NextAuth set a **host-only** session cookie — so a login on the main domain wasn't visible on `admin.jotril.com` → layout redirected every time, and the relative `redirect('/dashboard')` got rewritten to `/admin/dashboard` (404). (The `textscanner.*` subdomain was fine because `/text` is public.) **Fix:** (a) env-gated cross-subdomain cookies in `[...nextauth]` — set `COOKIE_DOMAIN=.jotril.com` (prod only) to scope the session/csrf/callback cookies to the parent domain; unset = host-only default (no-op). (b) `admin/layout.js` unauthorized redirect is now absolute (`NEXT_PUBLIC_APP_URL`) so it lands on the main app instead of a rewritten 404. **Requires:** `admin.jotril.com` added as a domain in the Vercel project, `COOKIE_DOMAIN` set in Production, redeploy (existing sessions re-log-in once).

### Fixed 2026-06-24
- **🚩 Auto-tuner runs could permanently jam a dataset (stuck-run deadlock) + time-limited runs reported `undefined` metrics.** Two lifecycle bugs in the admin auto-tuner (`/api/admin/auto-tune/[id]/run`):
  - **Stuck-run deadlock (A).** The tuning work runs in an in-process `after()` task. In local dev any dev-server restart / Turbopack Fast Refresh / crash kills it mid-run **without** writing a terminal status, leaving the row stuck at `CACHING`/`TUNING` forever. The POST handler's `activeRun` guard then returned "Continuing active run" indefinitely (dataset permanently un-runnable), the startup `deleteMany` only swept `FAILED`/`CANCELLED` (never stale-active), and the SSE poller streamed frozen progress forever. **Fix:** added a `updatedAt @updatedAt` heartbeat to `TuningRun` (every throttled progress write bumps it). POST now reclaims an "active" run with no heartbeat for `STALE_RUN_MS` (2 min) — flips it to `FAILED` and starts fresh instead of blocking. The SSE GET poller does the same so a jammed run surfaces as FAILED → the client closes + refreshes. Applied via `prisma db push` (gave `updatedAt` a `@default(now())` so the 3 existing rows backfilled — required column otherwise blocked the push). ⚠️ **A running dev server must be restarted** to pick up the regenerated Prisma client (the push's auto-generate showed the known harmless `EPERM ... query_engine-windows.dll.node` rename — client still regenerated). Residual: a genuinely-wedged-but-alive worker (>2 min with no heartbeat, vs heartbeats every ~2.5s → 48× margin) could be reclaimed and later resurrect its own FAILED row; accepted as unlikely.
  - **Early-deadline returns dropped train/test metrics (C).** When `runExhaustiveSearch` hit its deadline in Phase 1/2/2.5 it returned an object **without** `trainMetrics`/`testMetrics`/`splitInfo`, so the finalizer wrote `"Train: undefined% | Test: undefined%"`, stored `metrics.train/test` as undefined (broken before/after panel), and reported a train-set (overfit) "best" with no held-out check. **Fix:** added a `finalizeResult()` helper in `auto-tuner.js` that computes full/train/test metrics + splitInfo; all three early returns now use it, matching a normal completion. (`/dev-trigger` has no deadline so it always dodged this — which is why dev results looked fine but the normal button didn't.)
  - **Score-cache poisoning + no rebuild (D).** Once `dataset.scoreCache` was written it was reused on EVERY future run with no way to refresh — re-tuning never re-queried the model, and a cache built during a flaky-Space window (failed queries silently cached as neutral 50) poisoned the dataset permanently. **Fix:** `buildScoreCache` now aborts with a clear error if the query failure rate exceeds `MAX_NULL_RATE` (35%) — the run FAILs loudly and the bad cache is NOT saved (the throw precedes the `tuningDataset.update`). Added a force-rebuild path: `/run` POST accepts `{ rebuildCache: true }` → `runTuningInBackground(..., forceRebuild)` ignores the stored cache and re-queries. New "Rebuild Cache" button in the admin Auto-Tuner (shown when `hasCachedScores`); GET listing now returns `hasCachedScores` via a `$queryRaw` `IS NOT NULL` check (doesn't load the heavy blob).
  - **`/run` vs `/dev-trigger` coordination (B).** `/dev-trigger` used a fragile in-memory `runningRunId` lock (lost on restart) and `deleteMany`'d ALL runs including COMPLETE history. **Fix:** rewritten to share the same lifecycle — DB-based active check with the 2-min heartbeat staleness reclaim, and it now only clears `FAILED`/`CANCELLED` runs (COMPLETE history preserved).
  - **Cosmetic/correctness (E).** Progress messages said "best MCC" but the value is the sentence-level **objective** → relabeled "best obj". `apply` overwrote `EngineConfig.data` wholesale, silently resetting the budget-governor block to defaults → now carries the existing `data.budget` forward (the tuner never optimizes budget). NOTE: §8/§15's `predictBatch` "shared module-level `currentIndex`" warning was **stale** — code uses a local `localIndex` closure (already fixed; corrected in Ongoing).
- **HF Space logs spammed with a Starlette deprecation warning (cosmetic).** Every queue-join (i.e. every model query the web app makes) logged `StarletteDeprecationWarning: 'HTTP_422_UNPROCESSABLE_ENTITY' is deprecated. Use 'HTTP_422_UNPROCESSABLE_CONTENT' instead.` from inside Gradio (`gradio/routes.py:1528`). The deprecated constant is referenced by **Gradio itself**, not our code — a newer Starlette renamed it — so it can't be fixed at the call site on a Space. **Fix:** added a narrowly-scoped `warnings.filterwarnings("ignore", message=".*HTTP_422_UNPROCESSABLE_ENTITY.*")` at the top of `app.py` (right after `import os`, before the gradio import) in **all three** Spaces (`Jotril-Space-1/2/3`). The filter only matches that one message, so genuine future deprecations still surface. Considered + rejected: pinning Starlette down (risks conflicting with Gradio's range / stale-insecure version) and pinning/upgrading Gradio (none currently pinned; unknown fixed version). Remove the block once Gradio updates upstream. **Deployed:** committed + pushed to all three HF Space git remotes (Space-1 `94c7f4d`, Space-2 `c5f7dde`, Space-3 `5c9b01a`); Spaces rebuild on push. **Note:** `Jotril-Space-3` had to be cloned into the repo (it wasn't present locally; the other two already were). ⚠️ **Security debt (deferred by user):** Space-1/2 (and now Space-3, after this push) store the HF write token in plaintext in `.git/config`'s remote URL — should be rotated and moved to a git credential helper (token was also exposed in session output).
- **🚩 Gotenberg prewarm silently failed — `pdfjs-dist/legacy/build/pdf.mjs` does not exist.** `server-overlay.js` `loadPdfjs()` tried `import('pdfjs-dist/legacy/build/pdf.mjs')` first (with a `.js` fallback in a try/catch). The installed `pdfjs-dist` v3.11.174 has no `.mjs` in `legacy/build/`. While the try/catch pattern works in plain Node, **Turbopack statically analyzes dynamic imports at compile time** and emitted `Module not found: Can't resolve 'pdfjs-dist/legacy/build/pdf.mjs'` — the compiled import stub fails at runtime regardless of the catch. Since the prewarm is fire-and-forget (`.catch(() => {})`), the failure was completely silent; the GCS bucket stayed empty; every download fell through to the minimalist HTML→PDF renderer. **Fix:** removed the `.mjs` attempt, import `.js` directly. Also added `console.warn` logging to the prewarm call in `useAnalyze.js` (was silently swallowed) and step-by-step `[Prewarm]` logging to the prewarm route handler. **Verified end-to-end:** a real DOCX scan now runs step 1/4→4/4 and caches `{userId}/{scanId}.pdf` in GCS (the `Cannot polyfill DOMMatrix/Path2D — Cannot find module 'canvas'` warnings from pdf.js are benign; `server-overlay` only calls `getTextContent()`, which needs no canvas). **Lesson:** never try/catch speculative module paths in Next.js — Turbopack resolves them at compile time, not runtime.
- **⚡ Prewarm parallelized — Gotenberg conversion now overlaps the scan instead of trailing it.** Previously the DOCX→PDF conversion (the slow, cold-start-prone step, ~6s warm / 17–30s cold) didn't even *start* until the entire HF scan finished, saved, and fired prewarm — fully serialized after the slowest part of the flow. But the conversion depends only on the file bytes, not the scan results (only highlight+cover+upload need `chunks`/`scanId`). Split `POST /api/report/prewarm` into two phases keyed by a content hash:
  - **Phase A** (fired at upload in `handleAnalyze`, **no scanId**): convert DOCX→PDF, cache at `conversions/{sha256(file)}.pdf` in the same bucket. Runs in parallel with the scan, absorbing the Cloud Run cold start while the HF queries run.
  - **Phase B** (scan-complete prewarm in `processFinalResults`, file + scanId): `downloadReport(conversionKey)` — if Phase A finished (the common case, scan is slower), **skip Gotenberg entirely** and go straight to highlight+cover+upload; else convert inline as fallback (and cache it). The file hash links the phases without a scanId at upload time; idempotent, dedupes re-scans, content-addressed (safe — bucket is private, hash requires the file). Same one Gotenberg invocation, just overlapped → high-fidelity report ready ~17–30s sooner, usually before the heatmap finishes painting. New `conversionKey(hash)` in `report-storage.js`; `isDocxFile()` hoisted to module scope in `useAnalyze.js`. New log lines: `[Prewarm] convert-only…` (Phase A) and `[Prewarm] step 1/4: reusing parallel conversion (Gotenberg skipped)` (Phase B hit). ✅ **Lifecycle rule applied (2026-06-24):** the bucket `jotril-glutenberg-reports-eu` now has a GCS Object Lifecycle rule — `Delete` any object with `matchesPrefix: ["conversions/"]` and `age: 1` (day). The intermediate is only needed between upload and scan-complete; the final `{userId}/{scanId}.pdf` is the durable artifact and is NOT matched (a userId-prefixed path never starts with `conversions/`). **Note:** the app SA `vercel-gotenberg@jotril-app` only has `objectAdmin` (no `storage.buckets.update`), so this could NOT be set with the app credential — it was applied with the owner account (`babalolajedidiah@gmail.com`) via `gcloud storage buckets update --lifecycle-file`. Re-apply the same way if the bucket is ever recreated.

### 2026-06-23
- **🚩 0-byte browser downloads were caused by Internet Download Manager (IDM), NOT our code.** After a long hunt (file-logging proved the route rendered & streamed the full 3.4 MB every time), the DevTools console showed `status 204 Intercepted by the IDM Advanced Integration`. IDM hooks any `Content-Disposition: attachment` response, swallows the body, and hands JS a fake 204 → `BLOB SIZE: 0`. curl always worked (no IDM). **Fix is on the user's machine** (exclude localhost in IDM / disable its browser extension), not in code. The `Content-Length` collision theory from the day before was a red herring — though the cleaner streaming `Response` we landed on is kept. Lesson: download empty in-browser but fine via curl → suspect a download-accelerator/AV extension first; get the response status string early.
- **High-fidelity report caching + auto-prewarm (GCS).** New architecture so DOCX reports are Gotenberg-quality on BOTH fresh and history downloads, cold start absorbed in the background:
  - `src/lib/gotenberg.js` — shared Gotenberg client (`convertDocxToPdf`); mints a Cloud Run ID token from `GCP_SA_KEY` (IAM), `GOTENBERG_AUTH` static fallback.
  - `src/lib/report-storage.js` — GCS cache via JSON REST + access token from `GCP_SA_KEY` (no new dep). Key `${userId}/${scanId}.pdf`, bucket `GCS_BUCKET`.
  - `src/lib/report/server-overlay.js` — Node port of the client overlay: pdf.js layout + word-level resync mapper + pdf-lib rects + cover prepend. (pdf.js/pdf-lib/google-auth-library added to `serverExternalPackages`.)
  - `POST /api/report/prewarm` (FormData: file+scanId) — convert → highlight+cover → upload to GCS. Idempotent. Fired fire-and-forget from `useAnalyze.processFinalResults` after the scan saves (awaits save for `scanId`).
  - `/api/report` ({scanId}) checks GCS first → streams cached PDF, else standard render. `useAnalyze` exposes `lastScanId`; fresh-download buttons (page.js, dashboard) pass `scanId` to hit the cache. Client-side DOCX convert/overlay branch in `download-report.js` REMOVED (superseded); `/api/report/convert` now orphaned; PDF-upload overlay path unchanged.
  - **Verified in Node:** `convertDocxToPdf` (IAM-locked Gotenberg → 200), `buildHighlightedReport` (native charts+tables+highlights, 1.2s). **NOT yet run end-to-end** — needs GCS bucket created + dev restart.
  - **Requires:** create `gs://jotril-glutenberg-reports-eu` (lowercase only) + `objectAdmin` to `vercel-gotenberg@jotril-app` + `GCS_BUCKET` env. **Bucket + GCS round-trip verified** against the live bucket. Cosmetic known issue: chart-internal data-label text gets highlighted (real text in the LibreOffice PDF); fine for beta.
- **IDM-proof downloads (`GET /api/report/download?scanId=…`).** Any persisted scan (fresh-with-id OR history) now downloads via a real browser navigation (`<a download href=…>`) instead of `fetch`+blob, with a `HEAD` preflight for error surfacing. Download managers (IDM/FDM) and the browser handle the bytes directly, so JS never reads the response — this *works WITH IDM running* (IDM does its normal download), fixing the 0-byte class of bug for all testers, not just by asking them to disable IDM. The endpoint serves the GCS-cached PDF or renders on the fly. `download-report.js`: `scanId` → navigation download; inline (text scan before save) and PDF-upload overlay paths unchanged. `lastScanId` is set for text scans too, so they're also covered once saved.

### Fixed 2026-06-22
- **🚩 Unauthenticated abuse gate was a no-op — fingerprint quota now actually enforced.** The client computed + sent the hardware vector on every scan, but the live path threw it away: `/api/analyze` never read `hardwareFootprint`, never called `checkQuota`, and **`recordQuotaUsage` was only ever called by `/api/v1/detect`** (the API-key path). So the `QuotaUsage` table got **zero rows** from the web UI → every `checkQuota` aggregate read 0 → `allowed:true` forever. The only place quota was *checked*, `/api/estimate`, is an advisory client-triggered preview an abuser just skips. Net: unauthenticated (and FREE) users had **effectively unlimited scans**. Three-part fix:
  - **Enforcement wired into `/api/analyze`** (`route.js`) — the binding gate now lives on the route that triggers the HF queries (charging up-front closes the "never call `/api/attribute`" bypass). Flow: `hashFingerprint` → `checkCache` (same text/24h = free re-scan, no double-charge) → unauth-only IP flood breaker → `checkQuota` (429 on block) → `resolveScan` → `recordQuotaUsage` (+ IP log). Applies to authed tiers too (FREE/PRO limits were equally unenforced). Returns 429 `{error}` which `useAnalyze` already toasts.
  - **Fingerprint hardened against reset (`quota-manager.js` `hashFingerprint`)** — was `SHA-256(JSON.stringify(wholeVector))`, so ANY signal change (timezone while travelling, font/plugin install, docking-station monitor remap, 4G↔wifi) minted a fresh identity → trivial quota reset AND punished honest users. Now hashes a **fixed-order STABLE subset** (`STABLE_FP_KEYS`: webgl/audio/canvas/domRect/math/hwConcurrency/deviceMemory/maxTouchPoints/scrollbarWidth/displayGamut/screenRatio/platform); volatile signals excluded. Achieves the "fuzzy allowance" the vector was built for via stable-subset hashing — the `calculateFuzzyMatchScore` matcher in `fingerprint.js` remains **dead code** (never imported; the stable hash supersedes it). Validated: flipping all volatile fields → SAME hash; different GPU/CPU → different hash; key-order independent; missing vector → `unknown-device` (fails closed).
  - **IP flood breaker (`quota-manager.js`: `hashIp`/`checkIpFloodGate`/`recordIpRequest`)** — SECONDARY net only. Product is **school-first**: 30 personal laptops behind one NAT IP = 30 distinct fingerprints, so the device hash is the real defense; a classroom's legit free scans can route 100+ req/hr through one IP, so a tight per-IP quota would punish real users. Ceiling is deliberately generous (`UNAUTH_IP_HOURLY_CEILING = 200`, set 0 to disable) — only scripted single-IP volume trips it; VPN+spoofed-fingerprint is accepted residual risk (backstop: small free allowance, heavy use needs sign-in). **Reuses the orphaned `AnalysisRequest` table** (`hash = "ip:<sha256>"`) so **NO migration needed**; fails OPEN on any DB error. Unauthenticated only — never throttles signed-in users by network.
- **User-cancellable processes (analyze / download / background scans).** Every long-running flow now has a Cancel control instead of forcing the user to wait or hard-refresh.
  - `ProcessContext` gained a 4th `openProcess(variant, title, step, onCancel)` arg + a `cancelProcess()` action + a `cancellable` flag. The handler is stored in a ref (never stale inside the overlay's onClick). `cancelProcess` runs the handler, clears `simulateProgress` timers, and tears the overlay down immediately (no "100% then fade"). `closeProcess` also nulls the handler.
  - `ProcessOverlay` renders a glassy **Cancel** button (below the warning footer) whenever `cancellable && onCancel`.
  - **Analyze** (`useAnalyze`): a per-run `AbortController` is passed to both `/api/analyze` and `/api/attribute`; the queue `jobId` is captured; a `cancelledRef` guards the queue callback so late results can't paint. `cancelAnalysis` aborts the fetches, calls `QueueManager.cancelJob`, and toasts. `AbortError` / cancelled state is swallowed quietly (no error toast). Background-detoured scans (overlay already closed) are cancelled from the QueueSidebar instead.
  - **Download** (`downloadReport` + the 3 call sites in `page.js`/`dashboard/page.jsx`): `downloadReport` now takes a `signal` (threaded to `/api/report` and `/api/report/convert`) and returns silently on `AbortError`; each Download button makes an `AbortController` and passes `() => controller.abort()` as `onCancel`. The `overlayPDFReport` (in-place pdf-lib) path is synchronous and not interruptible — acceptable (fast); the server-render path is fully abortable.
  - **QueueSidebar**: replaced the dead/misplaced `handleCancel` stub (it was defined inside `useEffect` and never used, plus a stray-indentation artifact) with a working per-job **✕** button → `QueueManager.cancelJob(jobId)`. This is the cancel path for heavy scans detoured to the background.
  - `QueueManager.cancelJob` **hardened**: it now sets `job.cancelled = true` *before* deleting the job, and `_runWorkerLoop` checks the flag before the finish/sweeper block and before firing `onScanComplete`. Previously a worker already awaiting an in-flight query held a live reference to the job object and could still write results + fire the completion callback after a cancel (queued items were already skipped via the `if (!parentJob) continue` guard, but the in-flight one wasn't).
- **Load-time fixes (root cause was slow APIs, NOT bundle size).** A network waterfall showed all JS chunks loading in 100-360 ms while three API calls blocked the page: `/api/quota` at **13 s** (called **twice**), `/api/dashboard` at **10.5 s**, `/api/auth/session` ~660 ms.
  - **Sequential DB queries → parallel.** `/api/dashboard` ran **6** independent Prisma reads sequentially (count, aggregate, apiKey count, user, recentScans, pastScanResults); `getQuotaStatus` ran **4** (points aggregate, text count, doc count, user). Against remote Supabase/pgBouncer each is a network round-trip, so they stacked into seconds. Both rewritten to a single `Promise.all` wave (~1 round-trip instead of 4-6). The dev-admin `user.upsert` in `/api/dashboard` still runs first (the others depend on the user existing), then the batch.
  - **Duplicate `/api/quota` fetch killed.** `QuotaBar` only renders for logged-in users, whose quota is keyed by `userId` — the device fingerprint (`fp`) is irrelevant. But the effect depended on `deviceHash`, which resolves async, so it fired once with no `fp` and again once the fingerprint computed (the two quota rows). Removed `deviceHash` from the fetch + deps → **one** call, and the server skips the `JSON.parse` + SHA-256 (`hashFingerprint`) work. (`/api/quota` still accepts `fp` for any other caller; QuotaBar just no longer sends it. Note: React StrictMode still double-invokes the effect in `next dev`, so dev may show 2 calls — production is 1.)
  - **`DevDebugOverlay` removed from the global first-load bundle.** It lived in `Providers` (global, every route) and **statically imported `QueueManager` → `jotrilService`** + framer-motion + installed error/fetch interceptors, yet renders `null` unless `session.user.isDev`. Now `dynamic(() => import('./DevDebugOverlay'), { ssr:false })` **and** gated behind a `DevTools` wrapper that checks the session — normal visitors never download it on any route. (`ScanGuard` already lazy-imports `queue-manager`, so that pattern is unchanged.)
  - **⚠️ The reported timings were from `next dev`** (granular `node_modules_next_dist_*` / `turbopack-*.js` chunks in the waterfall confirm it). The dev server compiles each API route **on first request**, adding seconds that don't exist in production. Always benchmark load time with `next build && next start`.
  - **Follow-up (prod build, `/api/dashboard` still ~2.3-2.6 s warm):** trimmed the route from **6 reads + 1 write to 4 reads**. (a) Removed the dev-admin `user.upsert` — it's redundant, the row is already created at login by `authorize()` in the NextAuth config (a missing row now just yields zeros/null until next sign-in, no crash). (b) Dropped `apiKey.count` (`keyCount`) and the QuotaUsage "recent activity" `findMany` (`recentScans`) — both were fetched but **never rendered** (the "Previous Uploads" table uses `pastScanResults`; `recentScans` was assigned to a dead const). Remaining reads (count, aggregate, user, scanResult.findMany) are all `userId`-indexed; residual cost is one parallel round-trip to remote Supabase. Session is JWT strategy, so `getServerSession` does **no** DB hit. Possible further wins if needed at beta scale: composite `@@index([userId, createdAt])` on QuotaUsage/ScanResult (needs `prisma db push`), client-side caching/SWR, or server-rendering the dashboard so data is fetched during SSR instead of a post-hydration round-trip.

### Fixed 2026-06-21
- **🚩 0-byte PDF downloads — initially MIS-DIAGNOSED as a `Content-Length` collision; the actual cause was IDM (see 2026-06-23 entry).** History download POSTs went `200 + bytes` through curl/node-fetch, but the browser saw "status 204, blob size 0". I chased response framing for hours — removed manual `Content-Length`, switched to `new Uint8Array(pdf)`, then streaming `Response`, all of which were defensible but **not the bug**. The real cause turned out to be Internet Download Manager's browser integration silently intercepting any `fetch` to a `Content-Disposition: attachment` response and handing JS a fake 204. The response-framing changes are kept anyway (cleaner code, more robust against intermediaries), and the streaming `Response` pattern is now in §16 #14. **Lesson: ask for `r.status` / `r.statusText` early on download bugs (IDM names itself in `statusText`); see §16 #15.**
- **Report fidelity pass (from real user QA on a 163-image/23-table DOCX):**
  - **Tables now exempt from the scan.** `/api/analyze` derives the scored text for DOCX from the reproduced HTML with `<table>` blocks stripped (`htmlToProseText()` in `file-parser.js`) instead of `mammoth.extractRawText` — so tabular data is NOT scored, NOT counted in the breakdown, and NOT highlighted. On the SABER file this exempted **2,837 words (~20%)** that were previously scored as prose. PDFs/TXT (no `sourceHtml`) are unchanged.
  - **Half-word highlighting fixed.** `report/highlight-injector.js` char-aligner could drift a few chars mid-word, splitting one word across two colors (e.g. "Yo"=ai + "be"=mixed). Added `snapLabelsToWords()` — majority vote per whitespace-delimited word, ties broken ai>mixed>human (mirrors `pdf-overlay.js`'s per-item vote, which never had the bug). Marks are now word-atomic.
  - **Injector skips tables.** Alignment text is now built via `textContentExcludingTables()` and `walk()` early-returns on `TABLE` — keeps the chunk↔DOM mapping in sync now that table text is absent from the analysed chunks, and leaves tables unhighlighted.
  - **High-fidelity DOCX path SCAFFOLDED (dormant behind a flag) — fixes native charts + formatting.** mammoth drops native Office charts/shapes (VML `v:fill/v:path/...`, DrawingML, `c:chart`) → "missing charts" + stray data-label text, and emits generic `<table>` with no Word column widths/merges/alignment. The fix needs a real Office renderer, so a **Gotenberg (LibreOffice)** path was added:
    - `POST /api/report/convert` (NEW, nodejs/maxDuration 60) proxies a DOCX to `GOTENBERG_URL` (`/forms/libreoffice/convert`), returns a faithful PDF. Returns **501 when `GOTENBERG_URL` is unset** → client falls back to the standard `/api/report` renderer. Server-only env; optional `GOTENBERG_AUTH` header.
    - `download-report.js` (client): for a **fresh DOCX scan with the original File in hand** AND `NEXT_PUBLIC_REPORT_FIDELITY_ENGINE === 'gotenberg'`, it calls convert → wraps the PDF as a File → runs the existing `overlayPDFReport` (same path uploaded PDFs use: in-place highlights + branded cover). Any failure (501/network/overlay) falls through to `/api/report`. **Past scans** (no original file, only chunks+sourceHtml) still use `/api/report`.
    - `pdf-overlay.js` `mapChunksToItems` **rewritten to WORD-LEVEL resyncing alignment** (was naive char consumption with no resync). The chunk pointer advances only on a whole-word match, so PDF text absent from the analysed chunks — **table cells (now exempt from scoring), page numbers, repeated headers/footers LibreOffice emits — stays 'human'/unhighlighted and doesn't desync** prose that follows. Char-level resync was tried first and failed (a stray table letter spuriously matched upcoming prose); word-level passed a desync unit test (table block + page number between an AI and a mixed sentence, both kept correct labels).
    - **DEPLOYED on Google Cloud Run** (project `jotril-app`, `europe-west1`, 2GB, scale-to-zero, image `gotenberg/gotenberg:8`, URL `https://gotenberg-975472873234.europe-west1.run.app`). Conversion verified against the real SABER DOCX (native charts + tables preserved, ~1.18 MB, ~17-30s cold). **Secured via Cloud Run IAM**: service is `--no-allow-unauthenticated` (public `allUsers` invoker binding removed); a dedicated SA `vercel-gotenberg@jotril-app` has `roles/run.invoker`; the convert route mints a Google ID token from `GCP_SA_KEY` (base64 SA JSON) per request — verified the locked service returns 403 without a token and 200 with the minted token. **Gotenberg has NO built-in basic auth** (the earlier `--api-enable-basic-auth` attempt crashed the container — don't retry it). Remaining: set `GCP_SA_KEY` + `GOTENBERG_URL` + `NEXT_PUBLIC_REPORT_FIDELITY_ENGINE=gotenberg` in Vercel and redeploy; restart local dev to load them; then in-app end-to-end test. Cold-start cost is borne by the convert route (`maxDuration=60`).
- **PDF report engine fully rebuilt (the old output had no images/tables, broken spacing/page-breaks).** Root cause was `pdfmake` + `html-to-pdfmake` (lossy converter that drops `<img>`, collapses `<table>`, ignores CSS spacing/`page-break-*`). Replaced with a **headless-Chrome HTML→PDF engine** — see new §19. The old `pdf-generator.js` is now a deprecated shim. In-app `ScoreGauge`/`HeatmapViewer` were redesigned to match the report (donut gauge; human text left unmarked, AI/mixed highlighted). Build verified (`/api/report` route + serverless externalization). **DOCX (table+image) fidelity verified end-to-end on 2026-06-21** by rendering a real 163-image/23-table report — but ONLY once `sourceHtml` actually reaches the renderer; see the `ScanResult.sourceHtml` entry below for the persistence gap that made early past-scan downloads fall back to text-only chunk reconstruction.
- **`file-parser.js` PDF parsing was broken** — called `require('pdf-parse')()` but v2 exports a `PDFParse` class (no callable default). Fixed to `new PDFParse({ data }).getText()`.
- **`ScanResult.sourceHtml` column added** (Text?, ≤2MB) so past-scan downloads keep DOCX tables/images. ✅ **`npx prisma db push` was run against the live DB on 2026-06-21 — the column now exists and the client knows the field (verified).** New scans persist `sourceHtml`; past-scan downloads render full fidelity. ⚠️ **Rows saved *before* the push have `sourceHtml = null` and do NOT backfill** — re-scan the file to get a high-fidelity PDF (or download from the fresh-result button, which uses the in-memory HTML and never needed the DB). After running the push, **restart the dev server** — a running server keeps the old generated Prisma client in memory (and locks `query_engine-windows.dll.node`, which is why the push's auto-`generate` showed a harmless EPERM rename error; the client code still regenerated).
  - **Root cause of the "poor report" reports (diagnosed 2026-06-21):** before the push the column didn't exist, so `POST /api/scan-results` hit its graceful fallback ([route.js:102-106](src/app/api/scan-results/route.js:102)) and re-saved **without** `sourceHtml` → every persisted scan had null HTML → `POST /api/report` with `{scanId}` fell back to `reconstructBody(chunks)` (text-only `<p>` blocks, no images, flattened tables). Confirmed by rendering a real 163-image/23-table DOCX (mammoth output 0.73 MB, well under both the 8 MB report cap and 2 MB DB cap) through the actual engine: with `sourceHtml` present it embeds all 163 images + real table grids + chart figures (4.4 MB PDF). The engine was never the bug — the missing column was.
- **⚠️ Local `.env.local` contains `VERCEL="1"`** (from `vercel env pull`). The report renderer therefore detects the browser by *presence* (local Chrome/Edge → @sparticuz/chromium fallback) rather than `VERCEL`/`AWS_*` env flags, which would mis-route dev to the Linux serverless binary.

### Fixed 2026-06-20
- **BLOCKER: SyntaxError in queue-manager.js line 179** — `console.warn([Auto-Sweeper] Downscaling concurrency gracefully to: )` was invalid JS. Crashed entire client bundle via `QueueSidebar → DevDebugOverlay → Providers → layout.js`. Fixed: proper template literal.
- **BLOCKER: `enqueueJob` method missing** — `JotrilQueueManager` had no `enqueueJob`. `useAnalyze.js` called it. App appeared to work until analysis was triggered, then `TypeError: QueueManager.enqueueJob is not a function`. Fixed: implemented full method.
- **BLOCKER: `calculateJobETA` method missing** — called inside `_notify()` and in `useAnalyze.js`. Fixed: implemented.
- **CRITICAL: Duplicate `_runWorkerLoop`** — class defined the method twice. Second definition overwrote first. The first version (with `MAX_SWEEPER_RETRIES = 3`) was dead code — the recent "fix Chunk 134 infinite loop" commit never actually ran. Fixed: merged into single correct definition taking retry logic from v1 and telemetry from v2.
- **CRITICAL: `activeWorkers` never decremented** — the active (second) `_runWorkerLoop` never called `this.activeWorkers--`. Worker slots leaked permanently, making `MAX_CONCURRENCY` enforcement useless over time. Fixed.
- **MEDIUM: Request body not stringified through proxy → 422s** — `jotrilService.js` passed `body: { data: [text] }` as a plain object. The proxy round-trip (JSON.stringify → req.json()) turned it back into a JS object. `fetch(targetUrl, options)` sent `[object Object]` as body → Gradio FastAPI 422. Fixed: `body: JSON.stringify({ data: [text] })`. (Verified against the live Space: a correct string body returns 200 + `{event_id}`; `[object Object]` reproduces the exact `json_invalid` 422.)
- **CRITICAL: Live path never resolved — wrong poll endpoint + wrong SSE protocol.** `queryJotrilModel` submitted to `/gradio_api/call/predict` but polled `/gradio_api/call/batch/<eid>`. For a `/predict` job the `/batch` stream only emits `event: heartbeat / data: null` forever, so `result` stayed null → "Polling Timeout Extinguished" → outer retry resubmitted endlessly. Compounding it, the parser looked for the old queue protocol (`{"msg":"process_completed","output":...}`) while the call API actually returns `event: complete` + a raw `data: [ {label,confidences}, scorePct, aiProbability ]` array. Fixed both: poll `/gradio_api/call/predict/<eid>` and parse the `event:`/`data:` SSE pairs (handling `complete`/`error`/`heartbeat`). Confirmed end-to-end against the live Space.
- **CRITICAL: Classification rewired to probability → engine thresholds (was: raw label, all results showed as human).** The HF model's real signal is the **AI probability** (`payload[2]`, 0-1); it also emits a human-facing label (`"AI GENERATED"`/`"HUMAN WRITTEN"`) which the old code lowercased to `"ai generated"` — matching none of the canonical `"ai"`/`"human"`/`"mixed"` tokens, so every sentence fell to `transparent` (human). Correct design (per product intent): the site takes the probability and runs it through the **engine's tuned thresholds** to band ai/mixed/human. Implemented:
  - `jotrilService.queryJotrilModel` now returns `{ text, score (0-100 = round(aiProbability*100)), aiProbability, confidence, rawLabel, sourceSpace }` — no pre-baked classification. `rawLabel` (via `normalizeLabel()`) is a fallback only if `score` is unavailable.
  - `/api/analyze` calls `getEngineConfig()` and returns `classification: { humanMax, mixedMax }` to the client.
  - `useAnalyze.processFinalResults(finalResults, html, file, classification)` bands each sentence: `score ≤ humanMax → human`, `≤ mixedMax → mixed`, else `ai` (defaults 62/75). The sweeper fallback's literal `label:'mixed'` and `null` results are handled separately.
  - **This means `mixed` IS now produced at the live sentence level** (whenever a probability lands in the 63-75 band) — superseding the prior "live path only emits ai/human" note.
- **MAJOR: Live path upgraded to the FULL engine + budget governor** (supersedes the client-side threshold banding two bullets up — classification is now server-side in the full pipeline). The lightweight path consumed only 2 of ~20 tuned params and applied thresholds to a distribution the tuner never calibrated against. Now the live path mirrors the tuner's `evaluateConfig` exactly. Changes:
  - `chunking.js`: `generateAnalysisScenarios(text, depth)` + `generateSentenceCombinations(paragraph, depth)` take a depth cap via `DEPTH_PROFILES` (`full`=1-5 windows+LOO+paragraph, `reduced`=1-3+paragraph, `minimal`=single-sentence). `DEFAULT_BUDGET_CONFIG` added; `getEngineConfig()` now surfaces an admin-tunable `budget` block.
  - `budget-governor.js` (NEW, server-only): `resolveScan` (decide depth → generate → cost-fit → reserve) + `reconcileScan` (refund). Blends tier policy (FREE→reduced, PRO/BETA→full, ADMIN→uncapped), **predictive EWMA throttle** (steps depth down when projected month-end usage exceeds the reserve-adjusted budget; θ≥0.85 keep, 0.5–0.85 step down one, <0.5 minimal), 25% reserve, and exact per-doc cost-fit.
  - `UsageBudget` Prisma model (reservation model: reserve at `/api/analyze`, reconcile at `/api/attribute`; ~2-3 DB writes/scan, never per proxy call). Applied via `prisma db push` (project has no migrations dir).
  - `/api/analyze` rewritten: governor → returns `scenarios[]`+`sentences[]`+budget meta. `/api/attribute` (NEW): runs `attributeScoresToSentences→contextualSmooth→classifyResults` + reconcile. `useAnalyze` enqueues window texts and posts scores to `/api/attribute`. `processFinalResults(chunks,...)` now consumes pre-classified chunks.
  - `edgeProxyCalls` made honest: counted in `secureFetch` (submit + every poll) via exported `proxyStats`, reflected in `telemetry` by `_notify`.
  - **Verified:** DB reservation queries (upsert/atomic increment/decrement/day-roll) against live Supabase; governor decision math across fresh/on-track/overshoot/severe/ADMIN cases. NOT yet run end-to-end in the browser (dev server was down).
- **Scan persistence (was: nothing ever wrote a ScanResult).** `/api/scan-results` was GET-only — scans were never saved, so "previous uploads" was always empty. Added `POST /api/scan-results` (auth-gated) + a best-effort fire-and-forget save in `useAnalyze.processFinalResults` (guests get a silent 401). Enables history + PDF download of past scans. PDF generation itself (`generatePDFReport` in `pdf-generator.js`) already worked and is wired to a button above the heatmap.
- **Heatmap: long-doc truncation + preserved spacing.** `HeatmapViewer` now groups chunks into `<p>` blocks by `chunk.para` (paragraph index threaded from `/api/attribute` via the scenarios' `paragraphIndex`) so original paragraph spacing is restored; and truncates to a leading preview past **100 sentences** with a banner pointing to the full PDF (the PDF still gets all sentences).
- **Refresh guard.** New `ScanGuard` component (mounted in `Providers`) shows an in-app "scan in progress — don't refresh" banner whenever the queue has active jobs (browsers ignore custom `beforeunload` text, so the clear message is in-app) + arms `beforeunload` as a backstop. A hard refresh mid-scan still wipes the client-side queue singleton.
- **Concurrency tied to Space count.** `MAX_CONCURRENCY = PER_SPACE_CONCURRENCY(30) × SPACES.length`. Empirically a free CPU Space handles ~30 concurrent efficiently (it queues, doesn't choke), so total scales with the pool (90 at 3 Spaces). My earlier "drop to 8" instinct was wrong — user tested it.
- **Third HF Space + multi-Space hardening.** Added `JedBabs/Jotril-Space-3` to `SPACES` (HF fair-use allows ~3 free CPU Spaces; user confirmed the 3-running cap). Fixed keep-awake (cron had a hardcoded 2-Space list → now imports shared `SPACES` and warms via real `queryJotrilModel`; standalone `pingJotrilModels` also warms all). Added **failover rotation** so a dead/cold Space costs ~1 extra request/chunk instead of ⅓ of the scan (see §8/§9).
- **Dev-bundle staleness gotcha:** several of the above edits required a **hard refresh** before they took effect — Turbopack Fast Refresh kept the old `QueueManager` singleton in memory. Symptom: "can't monitor the scan on the panel" / stale 422s in console. Hard refresh fixed it.

### Ongoing / Background Issues
- **`queryJotrilBatch`** always throws (unconditional `throw` after the if block). Dead code — not in the live path. Leave for now.
- ~~**`predictBatch` shared `currentIndex`** at module scope~~ **NOT A BUG (corrected 2026-06-24)** — the current code uses a local `localIndex` closure per call ([jotrilService.js](src/lib/jotrilService.js)), so there is no cross-call state to corrupt. This warning was stale.
- ~~**Chunking pipeline gap**~~ **RESOLVED 2026-06-20** — the live path now runs the full multi-scale engine (see the "MAJOR" entry in Fixed). Analysis depth is governed per-scan by the budget governor to control invocation cost. Remaining knob: tuning `DEPTH_PROFILES` (what `reduced` includes) and the governor's reserve/throttle thresholds as real usage data comes in.
- **HF Space cold-start** — 30-60s GPU init on first request after inactivity. `ColdStartOverlay` handles UX. Keep-awake cron mitigates but doesn't eliminate.
- **Vercel timeout risk** — any server-side code that awaits the full HF inference chain synchronously will hit the 10s/60s limit. All inference must go through the client-side queue + Edge proxy path.

### Scratch Files in Root — CLEANED 2026-06-29
The root debug-script pile (~51 files: `patch*`, `fix_*`, `find_*`, `check[2-4].js`, `tmp_*`, `revert_batch`, `rewrite_qm`, `_monitor.cjs`, old `tests/tmp_*_read.js`, `build_log.txt`, etc.) was deleted. **Kept** (genuine local dev tools, all read from `process.env`, no hardcoded secrets): `run-tuner.cjs` (standalone auto-tuner), `test-grid.mjs` (standalone grid search), `query-db.js` + `check-roles.js` (DB inspectors), `test_hf_token.mjs` + `test-hf.js` (HF connectivity; `test-hf.js` has a stale 2-Space list). These aren't imported by the app or the test runner (`tests/*.test.mjs`).

---

## 16. Key Patterns & Gotchas

1. **Never import `queue-manager.js` from a server component.** It uses `crypto.randomUUID()`, `fetch`, and browser-only patterns. It's a client-only module.

2. **`QueueSidebar` imports QueueManager at the TOP LEVEL** — any parse error in `queue-manager.js` crashes the entire app. Always validate the file compiles before saving. (`DevDebugOverlay` also imports it, but is now lazy-loaded + dev-gated via `Providers`, so it's out of the global bundle — see §9/§15.)

3. **The gradio proxy body must be a string, not an object.** Always `JSON.stringify` before passing to `secureFetch`. The proxy does NOT auto-serialize.

4. **`getEngineConfig()` is async** and has a 30s cache. Don't call it in a tight loop. Invalidate with `invalidateEngineConfigCache()` after admin config changes.

5. **Prisma singleton in `src/lib/prisma.js`** — always import from there, never `new PrismaClient()` directly. Hot-reload creates duplicate connections otherwise.

6. **Two connection strings** — `DATABASE_URL` (pooled via pgBouncer, for app) and `DIRECT_URL` (direct, for migrations). Swap them and migrations will fail or the app will bypass the pool.

7. **`Intl.Segmenter`** is used in `splitIntoSentences`. It's available in Node.js 16+ and all modern browsers. If targeting older environments, this needs a polyfill.

8. **ESLint uses flat config** (`eslint.config.mjs`) — not `.eslintrc`. Don't create `.eslintrc` files.

9. **Tailwind v4** — config is in `postcss.config.mjs` via `@tailwindcss/postcss`. There is no `tailwind.config.js`. Class naming is standard but some v3 utilities may behave differently.

10. **`next.config.mjs` `serverExternalPackages`** includes `pdf-parse` and `mammoth` — these must stay server-side only. Don't import them in client components.

11. **After editing `queue-manager.js`/`jotrilService.js` (or anything feeding the QueueManager singleton), HARD REFRESH the browser.** Turbopack Fast Refresh keeps the old singleton in memory, so edits appear not to work (stale progress panel, phantom old errors). This burned a debugging session — the code was fine, the bundle was stale.

12. **`SPACES` (jotrilService) is the single source of truth for the Space pool.** Concurrency, load balancing, failover rotation, and keep-awake all derive from it. Add/remove a Space there and everything follows. Don't hardcode Space lists elsewhere (the keep-awake cron used to, and Space-3 silently wasn't kept awake). The Space must actually exist + be RUNNING before adding it, or ⅓ of traffic 404s (failover now softens this, but don't rely on it).

13. **`/api/gradio-proxy` calls = Vercel Function Invocations.** Current plan is **Hobby (free) = 1M/month** (NOT a daily limit; exhaustion PAUSES the whole deployment). Hobby is also **non-commercial-only** — Jotril is commercial, so Pro is required before public launch. Budget is governed server-side via `UsageBudget`/budget-governor (§14/§15).

14. **Hand-setting `Content-Length` on a binary `NextResponse` is usually fine, BUT** the symptoms can be confusing: with a buffered `NextResponse(Buffer, …)` we observed cases where the dev server simultaneously emitted `Transfer-Encoding: chunked` and the manual `Content-Length`, which some clients can't reconcile. Current pattern: **stream a `ReadableStream` with chunked enqueues** (`Response(stream, { headers: { 'Content-Type', 'Content-Length', 'Content-Disposition' } })`) — bytes flow eagerly, length is honest, downloads are robust. To repro download bugs use `curl` (honors `Content-Length` like a browser), NOT node `fetch` (lenient — hides bugs). See §15.

15. **🚨 Download-accelerator extensions (IDM, FDM, some AVs) silently break `fetch`+blob downloads of attachments.** They hook ANY response with `Content-Disposition: attachment` received via `fetch()` and hand JavaScript a fake **204 / 0 bytes** while writing the real file to disk via their own UI. Symptoms: download works in curl, browser shows "0 bytes" / empty file via `fetch().blob()`; DevTools Response shows `204 Intercepted by the IDM Advanced Integration` or similar. **Rule: for any file the user is meant to save, trigger an `<a download href=…>` NAVIGATION to a GET endpoint instead of `fetch`+blob+`URL.createObjectURL`.** Native navigation downloads are what download managers expect; JS never reads the bytes so they can't be intercepted. We added `GET /api/report/download` precisely to give scanId downloads a navigation target (see §19). When debugging a "download is empty" bug: ALWAYS ask for the response status string (`console.log(r.status, r.statusText)`) early — IDM's interception is named in `statusText`.

16. **GCS access from server routes uses the SAME service-account key as Cloud Run IAM (`GCP_SA_KEY`, base64-encoded JSON in env).** We deliberately don't add `@google-cloud/storage` — `lib/report-storage.js` mints an access token via `google-auth-library` and calls the GCS JSON REST API directly, keeping the dep surface small and the bundle thin. The same SA needs `roles/storage.objectAdmin` on the bucket in addition to `roles/run.invoker` on the Cloud Run service.

---

## 17. Commit History Context (recent)

| Commit | What it fixed |
|---|---|
| `4a3b53b` | Implement max Auto-Sweeper retries per chunk — INTENDED to fix Chunk 134 infinite loop, but the method was in the dead first `_runWorkerLoop`. Fix completed 2026-06-20. |
| `4c86878` | Revert to single-request proxy routing with 30-limit to fix batch 422 errors |
| `4f28d6b` | Fix FastAPI 422 crash by injecting Content-Type header on batch predictions |
| `6d776e5` | Fix missing import queryJotrilBatch in QueueManager module |
| `716b1f8` | Fix Gradio stream JSON parsing for headless Batch endpoint |

---

## 18. How to Update This File

After every session where code changes are made:
1. Update §15 (Known Issues) — move fixed issues to "Fixed" section with date, add new issues
2. Update §9 / §7 if queue or analysis flow changes
3. Update §8 if proxy or service logic changes
4. Add a row to §17 (Commit History) for significant changes
5. Update the "Last updated" date at the top

---

## 19. PDF Report Engine (rebuilt 2026-06-21, fidelity cache + IDM-proof downloads 2026-06-23)

**Goal:** premium, faithful PDF reports — real tables/images, proper spacing & page-breaks — beating Turnitin on both fidelity and design. **Two co-existing engines:**
1. **Headless Chrome** renders the branded HTML template (cover + reconstructed body) — used as the standard/fallback path and for the cover page.
2. **Gotenberg + LibreOffice** (self-hosted Cloud Run) converts the *original DOCX* to a faithful PDF with native charts/tables/formatting that mammoth can't reproduce. Run server-side as a background prewarm, output cached in GCS for instant downloads.

**Flow:**
```
SCAN COMPLETES → useAnalyze.processFinalResults:
  POST /api/scan-results              → persisted, returns scanId
  if DOCX:
    POST /api/report/prewarm (file + scanId)  → background
      → Gotenberg.convertDocxToPdf(file)      [DOCX → faithful PDF, slow on cold]
      → buildHighlightedReport(pdf, chunks,   [pdf.js layout + word-level resync
          coverPdf)                            mapper + pdf-lib rectangles + cover]
      → uploadReport({userId}/{scanId}.pdf)   [GCS cache]

"Download PDF" → downloadReport() [src/lib/download-report.js]
  ├─ PDF upload (File in hand) → overlayPDFReport() [pdf-overlay.js]: highlight original
  │                                in-place (pdf-lib) + prepend cover from /api/report?cover=1
  ├─ scanId present (fresh-after-save OR history) → IDM-PROOF DOWNLOAD:
  │     HEAD /api/report/download?scanId=… (auth/ownership preflight)
  │     <a href download> navigation to that GET endpoint
  │       → GCS hit → stream cached high-fidelity PDF (Gotenberg + highlights + cover)
  │       → GCS miss → headless Chrome render of stored sourceHtml/chunks
  └─ No scanId (text scan before save) → POST /api/report → headless Chrome → blob download
```

Highlight mapping for both the client overlay (`pdf-overlay.js`) and the server overlay
(`report/server-overlay.js`) is **WORD-LEVEL resyncing**: non-chunk PDF text (table
cells exempt from scoring, page numbers, repeated headers) stays unhighlighted and
never desyncs prose. The fidelity path activates whenever `GOTENBERG_URL`,
`GCP_SA_KEY`, and `GCS_BUCKET` are set; otherwise prewarm is a 501 no-op and downloads
silently use the standard render.

**Pieces (additive in 2026-06-23):**
- `src/lib/report/design-system.js` — tokens (brand navy/green, score colours), Inter (Google Fonts), `assessmentFor`, `donutSvg`, `escapeHtml`. Mirrors `globals.css`.
- `src/lib/report/report-template.js` — `buildReportHtml(data)`: self-contained HTML + print CSS. Also exports `headerFooterTemplates` (puppeteer running header/footer + page numbers).
- `src/lib/report/highlight-injector.js` — `injectHighlights(chunks)` runs **inside the page via `page.evaluate`** (real DOM); wraps AI/mixed runs in `<mark>` with the same word-level resyncing mapper. Used for the DOCX `sourceHtml` body in the standard path.
- `src/lib/report/render.js` — `renderReportPdf(data)`: resolves Chrome (local exe in dev → `@sparticuz/chromium` on Vercel by presence, not env flags), request-interception locks the page to `data:` / Google Fonts only, `page.pdf()` A4 with header/footer.
- `src/lib/report/server-overlay.js` **(NEW 2026-06-23)** — Node port of the client overlay: pdf.js text-layout extraction, word-level resyncing chunk-to-item mapper (mirrors `pdf-overlay.js`), pdf-lib rectangle drawing, optional cover prepend. Used by the prewarm to bake highlights into the Gotenberg PDF before caching.
- `src/lib/gotenberg.js` **(NEW 2026-06-23)** — `convertDocxToPdf(buffer, name)`. Mints a Google ID token (`GoogleAuth`) for an IAM-locked Cloud Run service with `GCP_SA_KEY`; falls back to `GOTENBERG_AUTH` static header. `gotenbergConfigured()` returns true iff `GOTENBERG_URL` is set.
- `src/lib/report-storage.js` **(NEW 2026-06-23)** — GCS cache: `reportExists`, `uploadReport`, `downloadReport`. Uses the GCS JSON REST API + an access token minted from `GCP_SA_KEY` (no `@google-cloud/storage` dep added). `storageConfigured()` requires both `GCS_BUCKET` and `GCP_SA_KEY`. Key convention `${userId}/${scanId}.pdf`.
- `src/app/api/report/route.js` — `runtime='nodejs'`, `maxDuration=60`. POST `{scanId}` (auth + ownership; **checks GCS cache first** when configured, then falls back to stored `sourceHtml`/chunks render); POST inline payload (guests OK); `?cover=1` = single cover page. Size caps: sourceHtml ≤8MB, chunks ≤50k.
- `src/app/api/report/convert/route.js` — POST multipart `file` (DOCX) → Gotenberg → faithful PDF. **Currently orphaned** (kept for diagnostics; the prewarm path replaced its in-flow use).
- `src/app/api/report/prewarm/route.js` **(NEW 2026-06-23)** — `runtime='nodejs'`, `maxDuration=60`. POST multipart `file` + `scanId` (auth + ownership). Idempotent (returns `{cached:true}` if the GCS object already exists). On miss: converts via Gotenberg → renders a cover-only PDF via headless Chrome → `buildHighlightedReport` → uploads to GCS. Returns 501 when fidelity engine or storage isn't configured.
- `src/app/api/report/download/route.js` **(NEW 2026-06-23)** — `runtime='nodejs'`, `maxDuration=60`. **GET `?scanId=…`** (IDM-proof navigation download): auth + ownership → GCS cache → fallback render → stream PDF as attachment. **HEAD** = cheap preflight (auth/ownership only, no render) so the client can surface 401/404 before triggering the actual download.

**Why the GET + navigation matters (IDM bug):**
Internet Download Manager and similar extensions intercept any `Content-Disposition: attachment` response received by a `fetch()` and hand JavaScript a fake **204 / 0 bytes**, so `.blob()` reads empty. We saw this for hours before the DevTools console explicitly showed `Intercepted by the IDM Advanced Integration`. The fix is to never read attachment bodies via `fetch` from JS: a real `<a download>` navigation lets IDM/FDM/the browser handle the bytes natively. The GET endpoint exists specifically to give scanId downloads that navigation target. (See §16 gotcha.)

**Auto-prewarm timing:**
Fired in `useAnalyze.processFinalResults` AFTER `POST /api/scan-results` resolves (we need the `scanId`). Fire-and-forget — failure never blocks the UI. The Cloud Run cold start (~3–8s) happens while the user is reading the heatmap, so the eventual download is usually warm. If the user clicks Download before prewarm finishes, the GCS lookup misses and falls back to the standard render that one time; the cache is populated for next time.

**Cost / capacity (beta):**
- Cloud Run: scale-to-zero, free-tier covers ~50 testers easily.
- GCS Standard EU: ~$0.02/GB-month; ~1–4MB per cached PDF; 50 testers × 20 docs ≈ 100MB ≈ $0.002/month. Lifecycle rule auto-deletes after 90 days to keep storage bounded.
- Gotenberg invocations: roughly 1 per DOCX scan (not per download), because cache.

**Gotchas:**
- `next.config.mjs` adds `puppeteer-core`, `@sparticuz/chromium`, `pdfjs-dist`, `pdf-lib`, `google-auth-library` to `serverExternalPackages`; traces the chromium binary for both `/api/report` and `/api/report/prewarm`; and aliases `canvas` → `src/lib/empty-module.js` for Turbopack.
- pdf.js in Node emits two cosmetic "Cannot polyfill DOMMatrix/Path2D" warnings (it tries to require `canvas`). Harmless — text extraction works without it.
- Bucket name must be **all lowercase** (`jotril-glutenberg-reports-eu`). GCS rejects mixed case.
- If the headless render fails in prod, verify the chromium binary was traced (size limit) — consider `@sparticuz/chromium-min` + remote brotli pack.
- Data shape: `chunks=[{text,label('human'|'mixed'|'ai'),score,para}]`, `breakdown={human,mixed,ai}` (string %), `overallLabel`, `sourceHtml` (DOCX only).

---

## 20. Marketing / SEO / Analytics / Resilience Layer (landed 2026-06-25→28, documented 2026-06-28)

A non-detection surface landed *after* the 2026-06-24 doc and was previously undocumented (commits: "added vercel analytics and speed insight", "fixed glitchy fav icon", "added sub domains", "dark mode default", "G search", "GA4"). **None of it touches the detection pipeline.**

**Routes & SEO**
- `src/app/text/page.js` — dedicated **/text scan landing route**, a scanner-focused variant of `page.js` (same `useAnalyze`/`FileUploader`); primary SEO target (sitemap priority 0.9).
- `src/app/sitemap.js`, `src/app/robots.js` — Next metadata routes (`baseUrl = NEXT_PUBLIC_APP_URL || https://www.jotril.com`).
- `src/app/opengraph-image.jsx` — dynamic OG image.
- `src/app/layout.js` — enriched `metadata` (title template, keywords, OG/Twitter cards, robots) + `GlitchFavicon`, `<Analytics/>`, `<SpeedInsights/>`, and conditional `<AnalyticsTracker/>`.
- **Positioning-vs-capability gap — SOFTENED 2026-06-29.** Copy used to advertise full-spectrum "text, image, video, audio / deepfake" detection while the engine is **TEXT-ONLY** (claims risk). Reworded to "AI text detection (more modalities coming)": `layout.js` metadata (title/description/keywords/OG/Twitter), `page.js` hero badge + subheading + the two "why" feature cards, and `opengraph-image.jsx` ("AI Text Detection"). The Image/Video/Audio product cards were already honest (`status:"coming"` → "Coming Soon" badge + "Notify Me") and were left as-is.

**Analytics** (all client, no-op without env)
- `components/AnalyticsTracker.jsx` — GA4, mounted in `layout.js` only when `NEXT_PUBLIC_GA_ID` is set.
- `@vercel/analytics` + `@vercel/speed-insights` always mounted in `layout.js`.

**Network resilience / offline**
- `lib/resilient-fetch.js` — fetch wrapper: AbortController timeout (20s) composed with the caller's signal, retry on network errors + 408/425/429/5xx (honors `Retry-After`), exp backoff + jitter, **idempotency-aware** (GET/HEAD retry; POST only with `{retry:true}`). `getJSON`/`postJSON` helpers. **Adopted** in `useAnalyze`, `usePPP`, `download-report`, `dashboard/page`, `QuotaBar`; **NOT** in `jotrilService.secureFetch` (the proxy hot path keeps its own AbortController timeout + retry in `queryJotrilModel`). Not a global override.
- `hooks/useOnlineStatus.js` + `components/OfflineBanner.jsx` — banner on `window.offline`; **pauses the QueueManager** (resume on `online`) — see §9 offline pause.
- `components/ServiceWorkerRegister.jsx` — registers the PWA service worker.

**Env (new):** `NEXT_PUBLIC_GA_ID` (GA4 measurement id; unset → tracker not mounted), `NEXT_PUBLIC_APP_URL` (canonical base for sitemap/robots/metadata; defaults to `https://www.jotril.com`).
