// Backoff + idempotency helpers. Retries reads and idempotent mutations on 5xx/429;
// non-idempotent placement tools use check-then-retry so a lost response never double-orders.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getStatus(err: any): number | undefined {
  const s = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (typeof s === "number") return s;
  const m = String(err?.message ?? "").match(/\b(429|500|502|503|504)\b/);
  return m ? Number(m[1]) : undefined;
}

export function isRetryable(err: unknown): boolean {
  const status = getStatus(err);
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  const code = (err as any)?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "UND_ERR_SOCKET";
}

export function is5xx(err: unknown): boolean {
  const status = getStatus(err);
  return !!status && status >= 500 && status <= 504;
}

/** Parse Groq's reset header on a 429 → milliseconds to wait (with a small buffer). */
export function handle429(err: any): number {
  const headers = err?.headers ?? err?.response?.headers;
  let resetSeconds: number | undefined;
  if (headers) {
    const raw = typeof headers.get === "function" ? headers.get("x-ratelimit-reset-requests") : headers["x-ratelimit-reset-requests"];
    if (raw != null) {
      // Values look like "2.5s" or "30" — strip non-numerics.
      const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n)) resetSeconds = n;
    }
  }
  return Math.round((resetSeconds ?? 2) * 1000) + 100;
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let attempt = 0;
  // 500ms → 1s → 2s → 4s, 30% jitter.
  let delay = 500;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const status = getStatus(err);
      const wait = status === 429 ? handle429(err) : delay + Math.floor(Math.random() * delay * 0.3);
      await sleep(wait);
      delay = Math.min(delay * 2, 4000);
    }
  }
}

/** Stable deterministic key for an order payload (FNV-1a over canonical JSON). */
export function idempotencyKey(payload: unknown): string {
  const json = canonicalize(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/**
 * Place a non-idempotent order safely. On a 5xx (the response may have been lost),
 * wait and call checkFn; if the order already exists, return it; otherwise retry once.
 * checkFn returns the placed order (any truthy value) or null/undefined if none found.
 */
export async function safePlaceOrder<T>(
  placeFn: () => Promise<T>,
  checkFn: () => Promise<T | null | undefined>
): Promise<T> {
  try {
    return await placeFn();
  } catch (err) {
    if (!is5xx(err) && !isRetryable(err)) throw err;
    await sleep(2000);
    const existing = await checkFn();
    if (existing) return existing;
    return await placeFn();
  }
}
