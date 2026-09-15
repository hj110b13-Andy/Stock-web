"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import WatchlistTable, { type HoldingItem } from "@/components/WatchlistTable";
import MarketTabs from "@/components/MarketTabs";
import type { Quote, SearchItem } from "@/lib/data";
import { WATCHLIST_CHANGED_EVENT, getWatchlist, type WatchlistItem } from "@/lib/watchlist";

function subscribe(callback: () => void) {
  window.addEventListener(WATCHLIST_CHANGED_EVENT, callback);
  return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, callback);
}

// Matches the other live-polling components (LiveIndices, LiveQuoteHeader,
// LiveMoversBoard) — server-side quote cache TTL is 20s, so polling faster
// wouldn't surface anything newer. This list mixes TW and US symbols with
// different trading hours, so it just re-polls unconditionally on this
// interval rather than tracking each market's own open/closed state — an
// extra request for an already-closed market's unchanged quote is cheap,
// and simpler than per-item status tracking here.
const POLL_MS = 20_000;

const EMPTY: WatchlistItem[] = [];
type SortBy = "changePercent" | "volume" | "price" | "name";

function exportCsv(items: SearchItem[]) {
  const header = ["市場", "代碼", "名稱", "股價", "漲跌幅(%)", "成交量"];
  const rows = items.map((i) => [
    i.market === "TW" ? "台股" : "美股",
    i.symbol,
    i.name,
    i.price,
    i.changePercent,
    i.volume,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Some browsers silently drop a non-ASCII `download` attribute and fall
  // back to a bare "download" filename — keep it ASCII-only (the CSV
  // *content* is still full Traditional Chinese, only the filename isn't).
  a.download = `stockradar-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function WatchlistSection() {
  const list = useSyncExternalStore(
    subscribe,
    getWatchlist,
    () => EMPTY // server snapshot: localStorage isn't available during SSR
  );
  const [items, setItems] = useState<SearchItem[] | null>(null); // null = not fetched yet for the current list
  const [sortBy, setSortBy] = useState<SortBy>("changePercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;

    async function tick() {
      const results = await Promise.all(
        list.map(async (w): Promise<SearchItem | null> => {
          try {
            const res = await fetch(`/api/quote/${encodeURIComponent(w.symbol)}?market=${w.market}`);
            if (!res.ok) return null;
            const q: Quote = await res.json();
            return {
              symbol: q.symbol,
              market: q.market,
              name: q.name,
              sector: "自選",
              price: q.price,
              changePercent: q.changePercent,
              volume: q.volume,
              // This view fetches one quote at a time (/api/quote/[symbol]),
              // not the batched search list that has the trailing-average
              // volume map alongside it (see lib/data/volumeHistory.ts) — so
              // there's genuinely no basis to compute a real volumeTrend here.
              // "neutral" is honest (no signal), not a fabricated guess.
              volumeTrend: "neutral",
            } satisfies SearchItem;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setItems(results.filter((r): r is SearchItem => r !== null));
    }

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [list]);

  // Filtered against the *current* list (not just whatever the last fetch
  // returned) so removing every watched stock immediately clears the sort/
  // export controls and the export button, instead of them lingering with
  // stale data from before the list was emptied.
  // Uppercased on both sides: stored watchlist entries are always written
  // uppercase by WatchlistButton, but comparing case-insensitively means a
  // stray lowercase entry (e.g. hand-edited localStorage) degrades to
  // "unavailable" for that one symbol instead of silently dropping it here
  // while a real quote for it was actually fetched successfully.
  const holdingByKey = new Map(list.map((w) => [`${w.market}:${w.symbol.toUpperCase()}`, w]));
  const displayItems: HoldingItem[] = (items ?? [])
    .filter((i) => holdingByKey.has(`${i.market}:${i.symbol.toUpperCase()}`))
    .map((i) => {
      const holding = holdingByKey.get(`${i.market}:${i.symbol.toUpperCase()}`);
      return { ...i, costBasis: holding?.costBasis, shares: holding?.shares };
    })
    .sort((a, b) => {
      const diff = sortBy === "name" ? a.name.localeCompare(b.name) : a[sortBy] - b[sortBy];
      return sortDir === "desc" ? -diff : diff;
    });

  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">我的關注</h2>
        {displayItems.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
            >
              <option value="changePercent">依漲跌幅</option>
              <option value="volume">依成交量</option>
              <option value="price">依股價</option>
              <option value="name">依名稱</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
              title="切換排序方向"
            >
              {sortDir === "desc" ? "高→低" : "低→高"}
            </button>
            <button
              onClick={() => exportCsv(displayItems)}
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs hover:bg-(--page-plane)"
              title="匯出成 CSV"
            >
              匯出 CSV
            </button>
          </div>
        )}
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-(--text-muted)">
          點股票列表或個股頁面的 ☆ 即可加入關注清單，方便下次快速查看
        </p>
      ) : items === null ? (
        <div className="space-y-2">
          {Array.from({ length: Math.min(list.length, 4) }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-(--page-plane)" />
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="py-4">
          <p className="text-center text-sm text-(--text-muted)">目前無法取得關注股票的即時報價，可能是資料來源暫時無法連線</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-(--text-secondary)">
            {list.map((w) => (
              <li key={`${w.market}:${w.symbol}`} className="rounded-full border border-(--gridline) px-2.5 py-1">
                {w.name}（{w.symbol}）
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MarketTabs
          tw={<WatchlistTable items={displayItems.filter((i) => i.market === "TW")} emptyLabel="尚未關注任何台股" />}
          us={<WatchlistTable items={displayItems.filter((i) => i.market === "US")} emptyLabel="尚未關注任何美股" />}
        />
      )}
    </section>
  );
}
