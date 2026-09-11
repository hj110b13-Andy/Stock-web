import type { Market } from "@/lib/data";

export interface PriceAlert {
  id: string;
  symbol: string;
  market: Market;
  name: string;
  condition: "above" | "below";
  targetPrice: number;
  triggered: boolean;
}

const STORAGE_KEY = "stockradar:price-alerts";
export const PRICE_ALERTS_CHANGED_EVENT = "stockradar:price-alerts-changed";

function safeParse(raw: string | null): PriceAlert[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Same reference-caching approach as lib/watchlist.ts — required for
// useSyncExternalStore, which otherwise treats a fresh array as a change on
// every render.
let cachedRaw: string | null = null;
let cachedList: PriceAlert[] = [];

export function getAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = safeParse(raw);
  }
  return cachedList;
}

function save(alerts: PriceAlert[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    window.dispatchEvent(new Event(PRICE_ALERTS_CHANGED_EVENT));
  } catch {
    // localStorage unavailable (private mode, blocked) — fail silently
  }
}

export function addAlert(alert: Omit<PriceAlert, "id" | "triggered">) {
  const list = getAlerts();
  list.push({ ...alert, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, triggered: false });
  save(list);
}

export function removeAlert(id: string) {
  save(getAlerts().filter((a) => a.id !== id));
}

export function markTriggered(id: string) {
  save(getAlerts().map((a) => (a.id === id ? { ...a, triggered: true } : a)));
}
