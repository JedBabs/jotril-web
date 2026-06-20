@AGENTS.md

---

# Jotril AI — Project Anchor Document

> This file is the single source of truth for all Claude sessions on this project.
> Update it immediately whenever architecture, bugs, fixes, or intentions change.
> Last updated: 2026-06-20 (full-engine live path + budget governor)

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
| PDF Gen | jsPDF + jspdf-autotable, pdfmake | 4.2.1 |
| DOCX Parse | mammoth | 1.12.0 |
| Email | Nodemailer | 7.0.13 |
| Password | bcrypt | 6.0.0 |
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
```

---

## 4. Directory Structure

```
src/
├── app/
│   ├── layout.js                    Root layout — wraps everything in <Providers>
│   ├── page.js                      Landing page (Hero, Scanner, How It Works, Capabilities, Pricing, FAQ)
│   ├── error.js                     Global error boundary
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
│       ├── gradio-proxy/route.js    POST — Edge Runtime proxy, injects HF_TOKEN server-side
│       ├── quota/route.js           GET — current quota status
│       ├── dashboard/route.js       GET — user stats, recent scans
│       ├── scan-results/route.js    GET — paginated scan history (cursor-based)
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
│   ├── Providers.jsx                SessionProvider + ThemeProvider + ProcessProvider + DevDebugOverlay
│   ├── Navbar.jsx                   Fixed nav, auth status, tier badge, mobile hamburger, magnetic fx
│   ├── FileUploader.jsx             Drag-drop (PDF/DOCX/TXT ≤20MB) + textarea (50k chars) + cost preview
│   ├── ScoreGauge.jsx               Stacked bar: human%/mixed%/ai%, label, metadata
│   ├── HeatmapViewer.jsx            Sentence-level color map with hover tooltips + dev metrics mode
│   ├── QuotaBar.jsx                 10-segment bars for points/text/doc usage + tier badge
│   ├── SignUpNudge.jsx              Conversion banner (guest→signup, free→pro), sessionStorage dismiss
│   ├── Toast.jsx                    Individual toast notification (pub-sub)
│   ├── ToastContainer.jsx           Fixed top-right container for toasts
│   ├── GlitchLogo.jsx               Animated Jotril AI logo
│   ├── ThemeSwitcher.jsx            Light/dark/colorful toggle via next-themes
│   ├── ProcessOverlay.jsx           Cinematic progress modal (analyze/upload/download variants)
│   ├── ColdStartOverlay.jsx         GPU warmup screen with Retry button
│   ├── QueueSidebar.jsx             Background job queue display — imports QueueManager at top level
│   ├── DevDebugOverlay.jsx          Dev tools overlay — imports QueueManager at top level
│   ├── InteractiveBackground.jsx    Particle canvas (50 desktop / 25 mobile, responsive)
│   └── ProcessContext.jsx           Global context for process overlay state
│
├── hooks/
│   ├── useAnalyze.js                Main analysis orchestrator hook (see §7 for full flow)
│   └── usePPP.js                    Purchase Power Parity pricing via geojs.io
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
    ├── file-parser.js               PDF/DOCX/TXT extraction
    ├── parse-analysis-stream.js     SSE stream parser for Gradio responses
    ├── pdf-generator.js             PDF report generation for scan results
    ├── pdf-overlay.js               PDF heatmap overlay on original document
    ├── fingerprint.js               Client-side hardware fingerprinting (15+ signals, 0-100 score)
    └── exclusion-filter.js          Filters generic/boilerplate sentences from scoring

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
| ScanResult | userId, filename, type, chunks (JSON), breakdown, overallLabel | Persisted scan output |
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
- Whitelist: only `.hf.space` or `huggingface.co` URLs allowed
- Injects `Authorization: Bearer ${HF_TOKEN}` server-side
- Passes `options` directly to `fetch(targetUrl, options)` — body must be a pre-stringified string

**⚠️ Body serialization critical note:** The proxy round-trip deserializes the body from JSON string back to a JS object. The proxy then calls `fetch(targetUrl, options)` with that object. `fetch` cannot auto-serialize a plain object — it sends `[object Object]`, causing Gradio FastAPI to return 422. **The body MUST be `JSON.stringify(...)` before passing through `secureFetch`.** This was a recurring 422 bug.

**`pingJotrilModels()`** — checks if Space is RUNNING via HF API. Used by keep-awake cron.

**`predictBatch(texts, onProgress, checkCancel, concurrency, batchDelay)`** — multi-worker batch executor for the auto-tuner. Uses module-level `currentIndex` (potential issue with concurrent calls — not in live path).

**`queryJotrilBatch(texts, spaceName)`** — alternative batch endpoint. Has a bug (always throws — second `throw` is unconditional). Dead code, not used in live path.

---

## 9. Queue Manager Deep Dive (`src/lib/queue-manager.js`)

**Singleton** — `new JotrilQueueManager()` always returns the same instance via `JotrilQueueManager.instance`.

**Key state:**
```js
queue: []                  // Pending chunk jobs, sorted descending by tier
activeJobs: Map            // jobId → job object
activeWorkers: number      // Currently running _runWorkerLoop instances
MAX_CONCURRENCY: 60        // Max simultaneous workers (downscales on drops)
estimatedLatencyMs: 1200   // Used for ETA calculations
telemetry: {
  processedChunks,         // Total successfully processed
  connectionDrops,         // Total failed chunks (before sweep)
  sweeperRetries,          // Total chunks re-queued by auto-sweeper
  sweeperEngagements,      // How many times sweeper triggered
  edgeProxyCalls           // Total proxy calls made (watch Vercel 100K/day limit)
}
```

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
- `enqueueJob` spawns `min(MAX_CONCURRENCY - activeWorkers, queue.length)` workers
- Each worker runs `_runWorkerLoop()` which loops until queue is empty
- On exit: `this.activeWorkers--` releases the slot

**Important — `QueueSidebar` and `DevDebugOverlay` import `QueueManager` at the TOP LEVEL** (not dynamically). Any syntax or parse error in `queue-manager.js` crashes the ENTIRE client bundle including `layout.js`, taking down all pages.

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

Metrics optimized: MCC (Matthews Correlation Coefficient) as primary, accuracy/precision/recall/F1 as secondary.

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

### Ongoing / Background Issues
- **`queryJotrilBatch`** always throws (unconditional `throw` after the if block). Dead code — not in the live path. Leave for now.
- **`predictBatch` shared `currentIndex`** at module scope — resets incorrectly across calls. Only used by auto-tuner. Leave for now.
- ~~**Chunking pipeline gap**~~ **RESOLVED 2026-06-20** — the live path now runs the full multi-scale engine (see the "MAJOR" entry in Fixed). Analysis depth is governed per-scan by the budget governor to control invocation cost. Remaining knob: tuning `DEPTH_PROFILES` (what `reduced` includes) and the governor's reserve/throttle thresholds as real usage data comes in.
- **HF Space cold-start** — 30-60s GPU init on first request after inactivity. `ColdStartOverlay` handles UX. Keep-awake cron mitigates but doesn't eliminate.
- **Vercel timeout risk** — any server-side code that awaits the full HF inference chain synchronously will hit the 10s/60s limit. All inference must go through the client-side queue + Edge proxy path.

### Scratch Files in Root (untracked, from debugging sessions)
`find_bug.js`, `fix_import.js`, `fix_turbopack.js`, `implement_retry.js`, `patchErr.js`, `patchErr2.js`, `patchHeaders.js`, `patchRgx.js`, `patchRgx2.js`, `patch_route.js`, `patch_route2.js`, `patch_spaces.js`, `revert_batch.js`, `rewrite_qm.js` — safe to delete if cleanup is needed.

---

## 16. Key Patterns & Gotchas

1. **Never import `queue-manager.js` from a server component.** It uses `crypto.randomUUID()`, `fetch`, and browser-only patterns. It's a client-only module.

2. **`QueueSidebar` and `DevDebugOverlay` import QueueManager at the TOP LEVEL** — any parse error in `queue-manager.js` crashes the entire app. Always validate the file compiles before saving.

3. **The gradio proxy body must be a string, not an object.** Always `JSON.stringify` before passing to `secureFetch`. The proxy does NOT auto-serialize.

4. **`getEngineConfig()` is async** and has a 30s cache. Don't call it in a tight loop. Invalidate with `invalidateEngineConfigCache()` after admin config changes.

5. **Prisma singleton in `src/lib/prisma.js`** — always import from there, never `new PrismaClient()` directly. Hot-reload creates duplicate connections otherwise.

6. **Two connection strings** — `DATABASE_URL` (pooled via pgBouncer, for app) and `DIRECT_URL` (direct, for migrations). Swap them and migrations will fail or the app will bypass the pool.

7. **`Intl.Segmenter`** is used in `splitIntoSentences`. It's available in Node.js 16+ and all modern browsers. If targeting older environments, this needs a polyfill.

8. **ESLint uses flat config** (`eslint.config.mjs`) — not `.eslintrc`. Don't create `.eslintrc` files.

9. **Tailwind v4** — config is in `postcss.config.mjs` via `@tailwindcss/postcss`. There is no `tailwind.config.js`. Class naming is standard but some v3 utilities may behave differently.

10. **`next.config.mjs` `serverExternalPackages`** includes `pdf-parse` and `mammoth` — these must stay server-side only. Don't import them in client components.

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
