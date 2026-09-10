"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/data";
import { formatChange, formatPercent, formatPrice, formatVolume, priceDirectionClass } from "@/lib/format";
import { getMarketStatus, type MarketStatus } from "@/lib/marketStatus";
import MarketStatusBadge from "./MarketStatusBadge";

// Matches the server-side quote cache TTL (lib/data/index.ts QUOTE_TTL_MS) —
// polling more often wouldn't surface anything newer.
const POLL_MS = 20_000;

/**
 * Renders the price header + stat grid, seeded from the server-fetched
 * quote and then kept live: while the market is in its regular session,
 * it polls for a fresh quote every 20s. Outside trading hours it just
 * shows the last available data (already what getQuote returns — TWSE/
 * Yahoo both keep serving the prior close when there's no trade yet) and
 * checks every tick whether the session has since opened, so a page left
 * open across market open starts updating on its own.
 */
export default function LiveQuoteHeader({ initialQuote }: { initialQuote: Quote }) {
  const { symbol, market } = initialQuote;
  const [quote, setQuote] = useState(initialQuote);
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus(market));

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const currentStatus = getMarketStatus(market);
      if (cancelled) return;
      setStatus(currentStatus);
      if (currentStatus !== "open") return;
      try {
        const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}?market=${market}`);
        if (!res.ok || cancelled) return;
        const next: Quote = await res.json();
        if (!cancelled) setQuote(next);
      } catch {
        // best-effort; keep showing the last known quote rather than erroring out
      }
    }

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, market]);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums">{formatPrice(quote.price, quote.currency)}</span>
        <span className={`text-lg font-semibold tabular-nums ${priceDirectionClass(quote.change)}`}>
          {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "–"} {formatChange(quote.change, quote.currency)} (
          {formatPercent(quote.changePercent)})
        </span>
        <MarketStatusBadge status={status} />
      </div>
      <p className="mt-1 text-xs text-(--text-muted)">
        更新時間：{new Date(quote.updatedAt).toLocaleString("zh-TW")} · 幣別 {quote.currency}
        {status === "closed" && "（非交易時段，顯示最近一次收盤資訊）"}
      </p>

      <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Stat label="開盤" value={formatPrice(quote.open, quote.currency)} />
        <Stat label="最高" value={formatPrice(quote.high, quote.currency)} valueClass="text-(--price-up)" />
        <Stat label="最低" value={formatPrice(quote.low, quote.currency)} valueClass="text-(--price-down)" />
        <Stat label="昨收" value={formatPrice(quote.prevClose, quote.currency)} />
        <Stat label="成交量" value={formatVolume(quote.volume, quote.market)} />
      </dl>
    </>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular-nums ${valueClass ?? ""}`}>{value}</dd>
    </div>
  );
}
