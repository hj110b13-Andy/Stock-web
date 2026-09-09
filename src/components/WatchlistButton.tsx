"use client";

import { useSyncExternalStore } from "react";
import type { Market } from "@/lib/data";
import { WATCHLIST_CHANGED_EVENT, isWatched, toggleWatch } from "@/lib/watchlist";

function subscribe(callback: () => void) {
  window.addEventListener(WATCHLIST_CHANGED_EVENT, callback);
  return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, callback);
}

export default function WatchlistButton({
  symbol,
  market,
  name,
  size = "sm",
}: {
  symbol: string;
  market: Market;
  name: string;
  size?: "sm" | "md";
}) {
  const watched = useSyncExternalStore(
    subscribe,
    () => isWatched(symbol, market),
    () => false // server snapshot: localStorage isn't available during SSR
  );

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatch({ symbol, market, name });
      }}
      aria-pressed={watched}
      aria-label={watched ? `從關注清單移除 ${name}` : `加入關注清單 ${name}`}
      title={watched ? "取消關注" : "加入關注"}
      className={`inline-flex items-center justify-center rounded-full transition-colors ${
        size === "sm" ? "h-6 w-6 text-base" : "h-9 w-9 text-xl"
      } ${watched ? "text-(--accent)" : "text-(--text-muted) hover:text-(--accent)"}`}
    >
      {watched ? "★" : "☆"}
    </button>
  );
}
