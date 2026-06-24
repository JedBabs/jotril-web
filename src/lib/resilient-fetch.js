/**
 * resilientFetch — client-side fetch wrapper hardened for flaky networks.
 *
 * Adds:
 *   - AbortController-driven timeout (default 20s) composed with any signal
 *     the caller already passed (cancel still works end-to-end).
 *   - Retry on retriable conditions: network errors and a configurable status
 *     allow-list (default 408/425/429/500/502/503/504). 4xx is NOT retried.
 *   - Exponential backoff (250ms × 2^attempt) + jitter up to 250ms, capped at
 *     8s; honors `Retry-After` on 429.
 *   - Idempotency-aware default: GET/HEAD retry; POST/PATCH/PUT/DELETE retry
 *     only when `{ retry: true }` is passed (caller asserts it's safe).
 *
 * Returns the Response on the first successful (response received, regardless
 * of status) attempt that isn't on the retry allow-list. Throws on AbortError
 * (caller cancelled) and on `Network unreachable after retries`.
 *
 * Intentionally NOT a global fetch override — explicit imports keep failure
 * modes local and let the caller opt out for streaming/SSE bodies.
 */

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

function jitterDelay(attempt) {
  const base = Math.min(8000, 250 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

// Compose multiple AbortSignals into one — older Safari lacks AbortSignal.any,
// so fall back to a manual aggregator. Returns the merged signal plus a cleanup
// fn to unhook listeners (avoids leaks on long-lived caller signals).
function composeSignals(signals) {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return { signal: undefined, cleanup: () => {} };
  if (valid.length === 1) return { signal: valid[0], cleanup: () => {} };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(valid), cleanup: () => {} };
  }
  const controller = new AbortController();
  const onAbort = (e) => controller.abort(e.target.reason);
  for (const s of valid) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', onAbort);
  }
  return {
    signal: controller.signal,
    cleanup: () => valid.forEach((s) => s.removeEventListener('abort', onAbort)),
  };
}

export async function resilientFetch(url, init = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    retries,
    retry: retryOptIn,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    onRetry,
    signal: callerSignal,
    ...fetchInit
  } = init;

  const method = (fetchInit.method || 'GET').toUpperCase();
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  const maxRetries =
    typeof retries === 'number' ? retries : isIdempotent || retryOptIn ? 3 : 0;
  const retrySet =
    retryStatuses instanceof Set ? retryStatuses : new Set(retryStatuses);

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(
      () => timeoutCtrl.abort(new DOMException('Request timeout', 'TimeoutError')),
      timeoutMs,
    );
    const { signal, cleanup } = composeSignals([callerSignal, timeoutCtrl.signal]);

    try {
      const res = await fetch(url, { ...fetchInit, signal });
      cleanup();
      clearTimeout(timer);

      if (!retrySet.has(res.status) || attempt === maxRetries) {
        return res;
      }
      // Retriable status — back off and try again.
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      const delay = retryAfter != null ? retryAfter : jitterDelay(attempt);
      onRetry?.({ attempt: attempt + 1, status: res.status, delay });
      await sleep(delay, callerSignal);
      attempt++;
      continue;
    } catch (err) {
      cleanup();
      clearTimeout(timer);

      // Caller cancelled — surface immediately, don't retry.
      if (callerSignal?.aborted) throw err;
      // Timeout or transient network error — retry if budget allows.
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = jitterDelay(attempt);
      onRetry?.({ attempt: attempt + 1, error: err?.message, delay });
      await sleep(delay, callerSignal);
      attempt++;
    }
  }

  // Exhausted retries. Surface as a network error the caller can branch on.
  const err = new Error(
    `Network unreachable after ${maxRetries + 1} attempt(s): ${lastError?.message || 'unknown'}`,
  );
  err.cause = lastError;
  err.isNetworkError = true;
  throw err;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** GET JSON convenience — parses on 2xx, returns null on 204, throws on !ok. */
export async function getJSON(url, init = {}) {
  const res = await resilientFetch(url, { ...init, method: 'GET' });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GET ${url} failed (${res.status}): ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** POST JSON convenience — adopts Content-Type, optionally retries. */
export async function postJSON(url, body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  return resilientFetch(url, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
