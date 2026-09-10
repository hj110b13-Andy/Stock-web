"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import StockTable from "@/components/StockTable";
import MarketTabs from "@/components/MarketTabs";
import type { Quote, SearchItem } from "@/lib/data";
import { WATCHLIST_CHANGED_EVENT, getWatchlist, type WatchlistItem } from "@/lib/watchlist";

function subscribe(callback: () => void) {
  window.addEventListener(WATCHLIST_CHANGED_EVENT, callback);
  return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, callback);
}

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
  a.download = `我的關注_${new Date().toISOString().slice(0, 10)}.csv`;
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
    Promise.all(
      list.map(async (w) => {
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
          } satisfies SearchItem;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setItems(results.filter((r): r is SearchItem => r !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [list]);

  const displayItems = [...(items ?? [])].sort((a, b) => {
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
          tw={<StockTable items={displayItems.filter((i) => i.market === "TW")} emptyLabel="尚未關注任何台股" />}
          us={<StockTable items={displayItems.filter((i) => i.market === "US")} emptyLabel="尚未關注任何美股" />}
        />
      )}
    </section>
  );
}
