"use client";

import { useState } from "react";
import Link from "next/link";
import type { SearchItem } from "@/lib/data";
import { formatChange, formatPercent, formatPrice, priceDirectionClass } from "@/lib/format";
import { updateHolding } from "@/lib/watchlist";
import WatchlistButton from "./WatchlistButton";

export interface HoldingItem extends SearchItem {
  costBasis?: number;
  shares?: number;
}

/**
 * Watchlist-specific table (not the shared StockTable): adds editable
 * 持有股數/平均成本 so a holding's unrealized P&L can be computed and shown,
 * which the plain watch-only StockTable has no use for. Editing writes
 * straight to localStorage via updateHolding() — there's no separate "save"
 * step, matching how the ☆ button already works elsewhere in the app.
 */
export default function WatchlistTable({ items, emptyLabel }: { items: HoldingItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-(--text-muted)">{emptyLabel ?? "沒有符合條件的股票"}</p>;
  }

  const withHolding = items.filter((i) => i.costBasis != null && i.shares != null);
  const totalCost = withHolding.reduce((sum, i) => sum + i.costBasis! * i.shares!, 0);
  const totalValue = withHolding.reduce((sum, i) => sum + i.price * i.shares!, 0);
  const totalPnl = totalValue - totalCost;

  return (
    <div className="space-y-2">
      {withHolding.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-(--text-muted)">總損益：</span>
          <span className={`font-semibold tabular-nums ${priceDirectionClass(totalPnl)}`}>
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {" "}({totalCost ? formatPercent((totalPnl / totalCost) * 100) : "—"})
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--gridline) text-left text-(--text-muted)">
              <th className="w-8" />
              <th className="py-2 pr-4 font-medium">代碼 / 名稱</th>
              <th className="py-2 pr-4 font-medium text-right">股價</th>
              <th className="py-2 pr-4 font-medium text-right">漲跌幅</th>
              <th className="py-2 pr-4 font-medium text-right">持有股數</th>
              <th className="py-2 pr-4 font-medium text-right">平均成本</th>
              <th className="py-2 pr-4 font-medium text-right">損益</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <HoldingRow key={`${item.market}:${item.symbol}`} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldingRow({ item }: { item: HoldingItem }) {
  const [shares, setShares] = useState(item.shares?.toString() ?? "");
  const [costBasis, setCostBasis] = useState(item.costBasis?.toString() ?? "");
  const currency = item.market === "TW" ? "TWD" : "USD";

  function commit() {
    const sharesNum = shares.trim() === "" ? undefined : Number(shares);
    const costNum = costBasis.trim() === "" ? undefined : Number(costBasis);
    updateHolding(item.symbol, item.market, {
      shares: sharesNum != null && Number.isFinite(sharesNum) && sharesNum >= 0 ? sharesNum : undefined,
      costBasis: costNum != null && Number.isFinite(costNum) && costNum >= 0 ? costNum : undefined,
    });
  }

  const sharesNum = Number(shares);
  const costNum = Number(costBasis);
  const hasHolding = shares.trim() !== "" && costBasis.trim() !== "" && Number.isFinite(sharesNum) && Number.isFinite(costNum);
  const pnl = hasHolding ? (item.price - costNum) * sharesNum : null;
  const pnlPercent = hasHolding && costNum > 0 ? ((item.price - costNum) / costNum) * 100 : null;

  return (
    <tr className="border-b border-(--gridline) last:border-0 hover:bg-(--page-plane)">
      <td className="py-2.5 pl-1">
        <WatchlistButton symbol={item.symbol} market={item.market} name={item.name} />
      </td>
      <td className="py-2.5 pr-4">
        <Link href={`/stock/${item.symbol}?market=${item.market}`} className="font-medium hover:text-(--accent)">
          {item.name}
          <span className="ml-1.5 text-(--text-muted) tabular-nums">{item.symbol}</span>
        </Link>
        <span className="ml-2 rounded bg-(--page-plane) px-1.5 py-0.5 text-[10px] text-(--text-muted)">
          {item.market === "TW" ? "台股" : "美股"}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">{formatPrice(item.price, currency)}</td>
      <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${priceDirectionClass(item.changePercent)}`}>
        {formatPercent(item.changePercent)}
      </td>
      <td className="py-2.5 pr-4 text-right">
        <input
          type="number"
          min="0"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          onBlur={commit}
          placeholder="—"
          className="w-20 rounded border border-(--gridline) bg-(--surface-2) px-1.5 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
      </td>
      <td className="py-2.5 pr-4 text-right">
        <input
          type="number"
          min="0"
          step="0.01"
          value={costBasis}
          onChange={(e) => setCostBasis(e.target.value)}
          onBlur={commit}
          placeholder="—"
          className="w-20 rounded border border-(--gridline) bg-(--surface-2) px-1.5 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
      </td>
      <td className={`py-2.5 pr-4 text-right tabular-nums ${pnl != null ? priceDirectionClass(pnl) : "text-(--text-muted)"}`}>
        {pnl != null ? (
          <>
            {formatChange(pnl, currency)}
            <span className="ml-1 text-xs">({formatPercent(pnlPercent!)})</span>
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
