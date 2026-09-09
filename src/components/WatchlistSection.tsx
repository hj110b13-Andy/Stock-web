"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import StockTable from "@/components/StockTable";
import type { Quote, SearchItem } from "@/lib/data";
import { WATCHLIST_CHANGED_EVENT, getWatchlist, type WatchlistItem } from "@/lib/watchlist";

function subscribe(callback: () => void) {
  window.addEventListener(WATCHLIST_CHANGED_EVENT, callback);
  return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, callback);
}

const EMPTY: WatchlistItem[] = [];

export default function WatchlistSection() {
  const list = useSyncExternalStore(
    subscribe,
    getWatchlist,
    () => EMPTY // server snapshot: localStorage isn't available during SSR
  );
  const [items, setItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;
    Promise.all(
      list.map(async (w) => {
        try {
          const res = await fetch(`/api/quote/${encodeURIComponent(w.symbol)}?market=${w.market}`);
          const q: Quote = await res.json();
          return {
            symbol: q.symbol,
            market: q.market,
            name: q.name,
            sector: "自選",
            price: q.price,
            changePercent: q.changePercent,
            volume: q.volume,
            isMock: q.isMock,
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

  const displayItems = list.length === 0 ? [] : items;

  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="mb-2 font-semibold">我的關注</h2>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-(--text-muted)">
          點股票列表或個股頁面的 ☆ 即可加入關注清單，方便下次快速查看
        </p>
      ) : displayItems.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: Math.min(list.length, 4) }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-(--page-plane)" />
          ))}
        </div>
      ) : (
        <StockTable items={displayItems} />
      )}
    </section>
  );
}
