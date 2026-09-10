"use client";

import { useEffect, useState } from "react";
import type { IndexQuote, Market } from "@/lib/data";
import { getMarketStatus, type MarketStatus } from "@/lib/marketStatus";
import IndexCard from "./IndexCard";
import MarketStatusBadge from "./MarketStatusBadge";

// Matches the server-side indices cache TTL (lib/data/index.ts QUOTE_TTL_MS).
const POLL_MS = 20_000;

/** Same live/closed-aware polling as LiveQuoteHeader, for the homepage's market-index cards. */
export default function LiveIndices({ market, initialIndices }: { market: Market; initialIndices: IndexQuote[] }) {
  const [indices, setIndices] = useState(initialIndices);
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus(market));

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const currentStatus = getMarketStatus(market);
      if (cancelled) return;
      setStatus(currentStatus);
      if (currentStatus !== "open") return;
      try {
        const res = await fetch("/api/indices");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next: IndexQuote[] = (data.indices ?? []).filter((i: IndexQuote) => i.market === market);
        if (!cancelled && next.length > 0) setIndices(next);
      } catch {
        // best-effort; keep showing the last known indices rather than erroring out
      }
    }

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  if (indices.length === 0) {
    return <p className="py-6 text-center text-sm text-(--text-muted)">大盤指數目前無法取得，請稍後再試</p>;
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <MarketStatusBadge status={status} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {indices.map((idx) => (
          <IndexCard key={idx.symbol} index={idx} />
        ))}
      </div>
    </div>
  );
}
