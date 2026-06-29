export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { extractTextFromDocument, extractHtmlFromDocument, htmlToProseText } from '@/lib/file-parser';
import { resolveScan } from '@/lib/budget-governor';
import { signScanToken, SCAN_TOKEN_COOKIE } from '@/lib/scan-token';
import {
    hashFingerprint, hashText, estimateCost, checkCache, checkQuota,
    recordQuotaUsage, hashIp, checkIpFloodGate, recordIpRequest,
} from '@/lib/quota-manager';

/** First hop in X-Forwarded-For (Vercel sets it); falls back to X-Real-IP. */
function getClientIp(req) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'unknown';
}

/** Safely parse the client-supplied hardware vector from the multipart body. */
function parseFootprint(formData) {
    const raw = formData.get('hardwareFootprint');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        let text = formData.get('text') || '';
        let sourceHtml = null;
        let fileName = 'Pasted Text';

        if (file) {
            fileName = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());
            sourceHtml = await extractHtmlFromDocument(buffer, file.type);
            // DOCX: score the prose only — table content is exempt from analysis
            // (derived from the reproduced HTML with tables stripped, so it isn't
            // scored, counted in the breakdown, or highlighted). PDFs/TXT have no
            // sourceHtml and fall through to plain extraction unchanged.
            if (sourceHtml) {
                text = htmlToProseText(sourceHtml);
            }
            if (!text || !text.trim()) {
                text = await extractTextFromDocument(buffer, file.type);
            }
        }

        if (!text || text.trim().length === 0) {
            return NextResponse.json({ error: "No parsable text found in payload" }, { status: 400 });
        }

        // Resolve the user's tier server-side (never trust a client-supplied tier for
        // budget depth). The governor decides analysis depth, generates the multi-scale
        // scenarios, and reserves the estimated invocation budget.
        const session = await getServerSession(authOptions);
        const tier = session?.user?.role || 'UNAUTHENTICATED';
        const userId = session?.user?.id || null;
        const isAuthed = !!userId;

        // ── Abuse gate ────────────────────────────────────────────────────
        // This is the binding quota enforcement for the web flow (the old
        // /api/estimate check was advisory-only and recorded nothing, so the
        // limits were never reachable). We gate HERE because /api/analyze is
        // what triggers the client-side HF queries — charging up-front closes
        // the bypass where a client simply never calls /api/attribute.
        const deviceHash = await hashFingerprint(parseFootprint(formData));
        const type = file ? 'DOCUMENT' : 'TEXT';
        const contentSize = file ? file.size : text.length;
        const { sentenceCount } = estimateCost(text);
        const textHashValue = await hashText(text);

        // Same text within 24h by this identity → free re-scan (no double-charge).
        const cached = await checkCache(textHashValue, deviceHash, userId);

        let charge = null; // { pointCost, purchasedDeficit } when we must record usage
        if (!cached) {
            // Generous per-IP/hour flood breaker — unauthenticated only, so a shared
            // school network never throttles signed-in users (see quota-manager). The
            // flood breaker and the dual-gate quota check are independent reads, so
            // run them in one parallel wave instead of two serial Supabase round-trips.
            const ipHash = isAuthed ? null : await hashIp(getClientIp(req));
            const [flood, quota] = await Promise.all([
                isAuthed ? Promise.resolve({ allowed: true }) : checkIpFloodGate(ipHash),
                checkQuota(tier, deviceHash, userId, type, contentSize, sentenceCount),
            ]);
            if (!flood.allowed) {
                return NextResponse.json({ error: flood.reason }, { status: 429 });
            }
            if (!quota.allowed) {
                return NextResponse.json({ error: quota.reason }, { status: 429 });
            }
            charge = { pointCost: quota.pointCost, purchasedDeficit: quota.purchasedDeficit || 0, ipHash };
        }

        const plan = await resolveScan({ tier, text });

        // Commit usage only after the scan plan is resolved (so a governor failure
        // doesn't burn quota). Best-effort: a record failure must not block results.
        if (charge) {
            await recordQuotaUsage(
                deviceHash, userId, type, contentSize,
                charge.pointCost, sentenceCount, textHashValue, charge.purchasedDeficit,
            ).catch(err => console.error('[Analyze] quota record failed:', err));
            if (!isAuthed) await recordIpRequest(charge.ipHash, text.length);
        }

        const response = NextResponse.json({
            // The multi-scale windows the client must query (full text retained — the
            // client derives uniqueTexts = scenarios.map(s => s.text) and the attribution
            // step needs text for the short-window confidence penalty).
            scenarios: plan.scenarios,
            sentences: plan.sentences,
            sourceHtml,
            filename: fileName,
            chunkCount: plan.scenarios.length,
            // Budget bookkeeping — round-tripped back to /api/attribute for reconciliation.
            depth: plan.depth,
            estimate: plan.estimate,
            monthKey: plan.monthKey,
            callsPerQuery: plan.callsPerQuery,
        });

        // Authorize this client to use /api/gradio-proxy for the windows it's about to
        // query. HttpOnly so XSS can't read it; SameSite=Strict + same-origin queue calls
        // means the browser attaches it automatically. Secure only in prod (dev is http
        // localhost, where a Secure cookie would never be sent). See lib/scan-token.js.
        const scanToken = await signScanToken();
        if (scanToken) {
            response.cookies.set(SCAN_TOKEN_COOKIE, scanToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
                maxAge: 2 * 60 * 60, // seconds — matches the token TTL
            });
        }
        return response;

    } catch (error) {
        console.error("Analysis Pipeline Hard Failure:", error);
        return NextResponse.json({ error: "Internal Server Error during File Parsing", details: error.message }, { status: 500 });
    }
}
