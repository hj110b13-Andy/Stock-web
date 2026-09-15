"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import type { SearchItem } from "@/lib/data";
import { formatChange, formatPercent, formatPrice, priceDirectionClass } from "@/lib/format";
import { hasHolding, reorderGroup, updateHolding } from "@/lib/watchlist";
import WatchlistButton from "./WatchlistButton";

export interface HoldingItem extends SearchItem {
  costBasis?: number;
  shares?: number;
  order?: number;
}

function byOrder(a: HoldingItem, b: HoldingItem): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function groupKey(item: HoldingItem): string {
  return `${item.market}:${item.symbol}`;
}

/**
 * Watchlist-specific table (not the shared StockTable): adds editable
 * 持有股數/平均成本 so a holding's unrealized P&L can be computed and shown,
 * plus (per a user request) splits into two drag-reorderable groups — 持有中
 * (has both shares and cost basis filled in) always rendered above 僅關注
 * (watch-only) — so holdings stay visually prioritized. Dragging is confined
 * to within one group; an item only ever changes groups automatically, by
 * filling in or clearing its holding info in updateHolding(). Editing writes
 * straight to localStorage — there's no separate "save" step, matching how
 * the ☆ button already works elsewhere in the app.
 */
export default function WatchlistTable({ items, emptyLabel }: { items: HoldingItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-(--text-muted)">{emptyLabel ?? "沒有符合條件的股票"}</p>;
  }

  const held = items.filter(hasHolding).sort(byOrder);
  const unheld = items.filter((i) => !hasHolding(i)).sort(byOrder);

  const totalCost = held.reduce((sum, i) => sum + i.costBasis! * i.shares!, 0);
  const totalValue = held.reduce((sum, i) => sum + i.price * i.shares!, 0);
  const totalPnl = totalValue - totalCost;
  const currency = held[0]?.market === "TW" ? "TWD" : "USD";

  return (
    <div className="space-y-4">
      {held.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-(--text-muted)">總成本：</span>
            <span className="font-medium tabular-nums">{formatPrice(totalCost, currency)}</span>
          </span>
          <span>
            <span className="text-(--text-muted)">總市值：</span>
            <span className="font-medium tabular-nums">{formatPrice(totalValue, currency)}</span>
          </span>
          <span>
            <span className="text-(--text-muted)">總損益：</span>
            <span className={`font-semibold tabular-nums ${priceDirectionClass(totalPnl)}`}>
              {totalPnl >= 0 ? "+" : ""}
              {totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {" "}({totalCost ? formatPercent((totalPnl / totalCost) * 100) : "—"})
            </span>
          </span>
        </div>
      )}
      {/* On a narrow (mobile) screen this table is wider than the viewport —
          overflow-x-auto below makes it scrollable, but a plain scrollable
          <table> with no visual cue looks identical to a fully-visible one,
          so most people never discover the swipe. A user reported being
          unable to clear a holding's 平均成本 at all; the field was never
          broken, it was just off-screen with nothing telling them to swipe
          to reach it (persistent-成本欄位不可見, silent-cut-off-columns).
          A persistent hint (not scroll-triggered — those get missed on a
          quick glance) makes the swipe discoverable without redesigning the
          table into a stacked mobile layout. sm: hides it once the table
          actually fits without scrolling. */}
      <p className="text-[13px] text-(--text-muted) sm:hidden">← 可左右滑動查看持有股數／平均成本／損益 →</p>
      {held.length > 0 && <DraggableGroup title="持有中" items={held} />}
      <DraggableGroup title={held.length > 0 ? "僅關注（未持有）" : undefined} items={unheld} />
    </div>
  );
}

/** One drag-reorderable group (either all-held or all-watch-only — never
 *  mixed, since reorderGroup() only makes sense compared within one group).
 *  Dragging is implemented with the Pointer Events API (not native HTML5
 *  drag-and-drop, which doesn't fire on touch) so the same code works with
 *  mouse and touch alike: the drag handle captures the pointer on press, and
 *  as it moves the dragged row is spliced past whichever sibling's vertical
 *  midpoint it has crossed — a live "swap as you pass" reorder rather than a
 *  cursor-following floating clone, which is simpler to get right and
 *  plenty for a short personal watchlist. */
function DraggableGroup({ title, items }: { title?: string; items: HoldingItem[] }) {
  const [order, setOrder] = useState<string[]>(() => items.map(groupKey));
  const draggingKeyRef = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const byKey = new Map(items.map((i) => [groupKey(i), i]));

  // Re-sync from the persisted/live-refreshed items whenever they change —
  // except mid-drag, where the in-progress visual order takes precedence
  // over whatever the last quote-poll tick recomputed from localStorage.
  useEffect(() => {
    if (draggingKeyRef.current) return;
    setOrder(items.map(groupKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(groupKey).join(",")]);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, key: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingKeyRef.current = key;
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const dragKey = draggingKeyRef.current;
    if (!dragKey) return;
    const y = e.clientY;
    let overIndex = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const el = rowRefs.current.get(order[i]);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        overIndex = i;
        break;
      }
    }
    const fromIndex = order.indexOf(dragKey);
    if (fromIndex === -1 || fromIndex === overIndex) return;
    const next = [...order];
    next.splice(fromIndex, 1);
    next.splice(overIndex, 0, dragKey);
    setOrder(next);
  }

  function handlePointerUp() {
    const dragKey = draggingKeyRef.current;
    draggingKeyRef.current = null;
    if (!dragKey) return;
    const ordered = order.map((k) => byKey.get(k)).filter((i): i is HoldingItem => i != null);
    reorderGroup(ordered);
  }

  if (items.length === 0) return null;

  return (
    <div>
      {title && <h3 className="mb-1.5 text-xs font-semibold text-(--text-muted)">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-(--gridline) text-left text-(--text-muted)">
              <th className="w-6" />
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
            {order.map((key) => {
              const item = byKey.get(key);
              if (!item) return null;
              return (
                <HoldingRow
                  key={key}
                  item={item}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  onHandlePointerDown={(e) => handlePointerDown(e, key)}
                  onHandlePointerMove={handlePointerMove}
                  onHandlePointerUp={handlePointerUp}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldingRow({
  item,
  rowRef,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
}: {
  item: HoldingItem;
  rowRef: (el: HTMLTableRowElement | null) => void;
  onHandlePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandlePointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandlePointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
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
  const hasHoldingInput = shares.trim() !== "" && costBasis.trim() !== "" && Number.isFinite(sharesNum) && Number.isFinite(costNum);
  const pnl = hasHoldingInput ? (item.price - costNum) * sharesNum : null;
  const pnlPercent = hasHoldingInput && costNum > 0 ? ((item.price - costNum) / costNum) * 100 : null;

  return (
    <tr ref={rowRef} className="border-b border-(--gridline) last:border-0 hover:bg-(--page-plane)">
      <td className="py-2.5 pl-1">
        <button
          type="button"
          aria-label={`拖曳調整 ${item.name} 的順序`}
          title="拖曳調整順序"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          style={{ touchAction: "none" }}
          className="flex h-6 w-6 cursor-grab select-none items-center justify-center rounded text-(--text-muted) hover:bg-(--surface-2) hover:text-(--text-secondary) active:cursor-grabbing"
        >
          ⠿
        </button>
      </td>
      <td className="py-2.5 pl-1">
        <WatchlistButton symbol={item.symbol} market={item.market} name={item.name} />
      </td>
      <td className="py-2.5 pr-4">
        <Link href={`/stock/${item.symbol}?market=${item.market}`} className="font-medium hover:text-(--accent)">
          {item.name}
          <span className="ml-1.5 text-(--text-muted) tabular-nums">{item.symbol}</span>
        </Link>
        <span className="ml-2 rounded bg-(--page-plane) px-1.5 py-0.5 text-[12px] text-(--text-muted)">
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
