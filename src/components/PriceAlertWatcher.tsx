"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { getAlerts, markTriggered, type PriceAlert } from "@/lib/priceAlerts";

const POLL_MS = 30_000;

/**
 * Mounted once in the root layout (alongside ChatWidget) rather than on the
 * stock page itself: an alert set on one stock needs to keep being checked
 * while the visitor is browsing other pages of the site, not just while
 * that one stock's page happens to be open.
 */
export default function PriceAlertWatcher() {
  const [firedNow, setFiredNow] = useState<PriceAlert[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const pending = getAlerts().filter((a) => !a.triggered);
      if (pending.length === 0) return;
      const fired: PriceAlert[] = [];
      for (const alert of pending) {
        try {
          const res = await fetch(`/api/quote/${encodeURIComponent(alert.symbol)}?market=${alert.market}`);
          if (!res.ok) continue;
          const quote = await res.json();
          const hit =
            alert.condition === "above" ? quote.price >= alert.targetPrice : quote.price <= alert.targetPrice;
          if (hit) fired.push(alert);
        } catch {
          // best-effort; try again next poll
        }
      }
      if (cancelled || fired.length === 0) return;
      fired.forEach((a) => markTriggered(a.id));
      setFiredNow((prev) => [...prev, ...fired]);
    }

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (firedNow.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 space-y-2">
      {firedNow.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-lg border border-(--gridline) bg-(--surface-1) px-4 py-3 shadow-xl"
        >
          <span className="text-lg">🔔</span>
          <p className="text-sm">
            <span className="font-medium">{a.name}（{a.symbol}）</span>
            {a.condition === "above" ? "漲到" : "跌到"} {formatPrice(a.targetPrice, a.market === "TW" ? "TWD" : "USD")} 了
          </p>
          <button
            onClick={() => setFiredNow((prev) => prev.filter((x) => x.id !== a.id))}
            className="text-(--text-muted) hover:text-(--text-primary)"
            aria-label="關閉提醒"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
