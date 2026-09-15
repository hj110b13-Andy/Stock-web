"use client";

import { useEffect, useState } from "react";
import type { Market, SearchItem } from "@/lib/data";
import { getMarketStatus, type MarketStatus } from "@/lib/marketStatus";
import StockTable from "./StockTable";
import MarketStatusBadge from "./MarketStatusBadge";

// Matches the other live-polling components (LiveIndices, LiveQuoteHeader) —
// server-side quote cache TTL is 20s, so polling faster wouldn't surface
// anything newer.
const POLL_MS = 20_000;

/**
 * Homepage's 焦點排行 movers table was plain server-rendered data with no
 * client refresh: a tab left open past the initial page load just kept
 * showing whatever price/漲跌幅 was true at that one render forever, which
 * read as "still showing yesterday's numbers" once the market had moved on.
 * Every other price-bearing view on the site (index cards, the stock detail
 * header) already re-polls while the market is open — this brings the
 * homepage movers list in line with that same pattern instead of being the
 * one static exception.
 */
export default function LiveMoversBoard({ market, initialItems }: { market: Market; initialItems: SearchItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus(market));

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const currentStatus = getMarketStatus(market);
      if (cancelled) return;
      setStatus(currentStatus);
      if (currentStatus !== "open") return;
      try {
        const res = await fetch(`/api/search?market=${market}&sortBy=changePercent&sortDir=desc&limit=8`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items) && data.items.length > 0) setItems(data.items);
      } catch {
        // best-effort; keep showing the last known list rather than erroring out
      }
    }

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <MarketStatusBadge status={status} />
        {status === "closed" && (
          <p className="text-xs text-(--text-muted)">非交易時段，以下為最近一次收盤資訊</p>
        )}
      </div>
      <StockTable items={items} />
    </div>
  );
}
