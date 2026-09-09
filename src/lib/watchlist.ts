import type { Market } from "@/lib/data";

export interface WatchlistItem {
  symbol: string;
  market: Market;
  name: string;
}

const STORAGE_KEY = "stockradar:watchlist";
export const WATCHLIST_CHANGED_EVENT = "stockradar:watchlist-changed";

function safeParse(raw: string | null): WatchlistItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Cache the parsed list keyed by the raw string, so repeated calls return
// the same array reference when storage hasn't actually changed — required
// for useSyncExternalStore, which otherwise treats a fresh reference as a
// change on every render and can loop.
let cachedRaw: string | null = null;
let cachedList: WatchlistItem[] = [];

export function getWatchlist(): WatchlistItem[] {
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

function save(items: WatchlistItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT));
  } catch {
    // localStorage unavailable (private mode, blocked) — fail silently
  }
}

export function isWatched(symbol: string, market: Market): boolean {
  return getWatchlist().some((i) => i.symbol === symbol && i.market === market);
}

export function toggleWatch(item: WatchlistItem): boolean {
  const list = getWatchlist();
  const idx = list.findIndex((i) => i.symbol === item.symbol && i.market === item.market);
  if (idx >= 0) {
    list.splice(idx, 1);
    save(list);
    return false;
  }
  list.push(item);
  save(list);
  return true;
}

/** Overwrites the whole list — used when merging in a signed-in account's server-side watchlist. */
export function replaceWatchlist(items: WatchlistItem[]) {
  save(items);
}
