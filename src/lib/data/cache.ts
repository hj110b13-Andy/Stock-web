import { kvEnabled, redis } from "./kv";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Process-local TTL cache — the fallback used whenever Redis (see ./kv)
// isn't configured, and also what a single request falls back to if a
// configured Redis is temporarily unreachable. Not shared across Vercel's
// serverless instances, but keeps the app fully functional without any
// external service.
const memoryStore = new Map<string, CacheEntry<unknown>>();

function cachedInMemory<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memoryStore.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return Promise.resolve(hit.value as T);
  }
  return load().then((value) => {
    memoryStore.set(key, { value, expiresAt: now + ttlMs });
    return value;
  });
}

/**
 * TTL cache shared across serverless instances via Redis when configured
 * (see ./kv), otherwise a per-instance in-memory Map. Either backend fails
 * open: a Redis read/write error falls through to recomputing the value via
 * `load()` rather than surfacing an error, since a cache is never allowed
 * to be the reason a page breaks.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (!kvEnabled || !redis) {
    return cachedInMemory(key, ttlMs, load);
  }

  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    // Redis unreachable; fall through to computing a fresh value below
  }

  const value = await load();
  try {
    await redis.set(key, value, { ex: Math.max(1, Math.round(ttlMs / 1000)) });
  } catch {
    // best-effort; a shared-cache write failure shouldn't break the response
  }
  return value;
}

/** Splits an array into fixed-size groups — used to keep batch-quote request
 * URLs/payloads a safe size once the stock universe grew well past a
 * couple dozen symbols. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchWithTimeout(url: string, timeoutMs = 4000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} for ${url}${body ? `: ${body.slice(0, 500)}` : ""}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
