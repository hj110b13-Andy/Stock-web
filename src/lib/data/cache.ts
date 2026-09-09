interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Process-local TTL cache. Good enough for a demo / single dev server;
// a real deployment on serverless functions should swap this for Redis
// or similar shared cache so TTLs hold across instances.
const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await load();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export async function fetchWithTimeout(url: string, timeoutMs = 4000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}
