"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Market } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { addAlert, getAlerts, PRICE_ALERTS_CHANGED_EVENT, removeAlert, type PriceAlert } from "@/lib/priceAlerts";

function subscribe(callback: () => void) {
  window.addEventListener(PRICE_ALERTS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(PRICE_ALERTS_CHANGED_EVENT, callback);
}

const EMPTY: PriceAlert[] = [];

export default function PriceAlertForm({
  symbol,
  market,
  name,
  currency,
}: {
  symbol: string;
  market: Market;
  name: string;
  currency: string;
}) {
  // getAlerts() itself returns a cached, stable reference when the
  // underlying localStorage value hasn't changed (see lib/priceAlerts.ts) —
  // required for useSyncExternalStore, which otherwise sees a "new" snapshot
  // on every render and re-renders forever (React error #185, "Maximum
  // update depth exceeded"). That's exactly what filtering inline in the
  // snapshot getter did: `.filter()` allocates a new array every call, so
  // every render looked like a store change. Filtering *outside* the
  // snapshot getter, via useMemo keyed on that same stable reference, keeps
  // the snapshot itself stable while still deriving just this stock's alerts.
  const allAlerts = useSyncExternalStore(subscribe, getAlerts, () => EMPTY);
  const alerts = useMemo(() => allAlerts.filter((a) => a.symbol === symbol && a.market === market), [allAlerts, symbol, market]);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(target);
    if (!Number.isFinite(price) || price <= 0) return;
    addAlert({ symbol, market, name, condition, targetPrice: price });
    setTarget("");
  }

  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="font-semibold">到價提醒</h2>
      <p className="mt-1 text-xs text-(--text-muted)">
        開著這個網站的分頁時，價格觸及設定值會跳出提醒。目前僅網頁內顯示，還不會傳送到手機。
      </p>
      <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as "above" | "below")}
          className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm"
        >
          <option value="above">漲到</option>
          <option value="below">跌到</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={`例如 ${currency === "TWD" ? "2500" : "300"}`}
          className="w-32 rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-(--accent)"
        />
        <button
          type="submit"
          disabled={!target}
          className="rounded-md bg-(--accent) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          新增提醒
        </button>
      </form>
      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-md bg-(--page-plane) px-3 py-1.5 text-sm">
              <span className={a.triggered ? "text-(--text-muted) line-through" : ""}>
                {a.condition === "above" ? "漲到" : "跌到"} {formatPrice(a.targetPrice, currency)} {currency}
                {a.triggered && "（已觸發）"}
              </span>
              <button
                onClick={() => removeAlert(a.id)}
                className="text-xs text-(--text-muted) hover:text-(--price-down)"
                aria-label="刪除這則提醒"
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
