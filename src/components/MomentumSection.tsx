"use client";

import { useEffect, useState } from "react";
import MarketTabs from "./MarketTabs";
import MomentumTable from "./MomentumTable";
import type { MomentumItem } from "@/lib/data";

/**
 * Fetched client-side rather than server-rendered like the boards above it:
 * this section (per-candidate chart fetches, see MOMENTUM_CHART_CONCURRENCY
 * in lib/data/index.ts) is the slowest thing on the page. Streaming it in
 * via a server Suspense boundary got real content on screen quickly, but
 * the browser's own loading spinner doesn't stop until the *whole* HTTP
 * response finishes — including whatever is still streaming — so the tab
 * kept looking like it was loading long after the visible page was done.
 * A plain client fetch, kicked off after the main page has already fully
 * loaded, decouples this section from that spinner entirely.
 */
export default function MomentumSection() {
  const [tw, setTw] = useState<MomentumItem[] | null>(null);
  const [us, setUs] = useState<MomentumItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/momentum?market=TW")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => !cancelled && setTw(data.items ?? []))
      .catch(() => !cancelled && setTw([]));
    fetch("/api/momentum?market=US")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => !cancelled && setUs(data.items ?? []))
      .catch(() => !cancelled && setUs([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="font-semibold">技術訊號共振股</h2>
      <p className="mb-3 text-xs text-(--text-muted)">
        同時符合兩個以上客觀技術訊號（如爆量、站上均線、連續上漲）的股票。純粹描述當下數據呈現的狀態，不是對未來走勢的預測，不構成投資建議。
      </p>
      <MarketTabs
        tw={tw === null ? <MomentumSkeleton /> : <MomentumTable items={tw} />}
        us={us === null ? <MomentumSkeleton /> : <MomentumTable items={us} />}
      />
    </section>
  );
}

function MomentumSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-(--page-plane)" />
      ))}
    </div>
  );
}
