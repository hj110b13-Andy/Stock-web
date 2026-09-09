"use client";

import { useState, type ReactNode } from "react";
import type { Market } from "@/lib/data";

export default function MarketTabs({
  tw,
  us,
  defaultMarket = "TW",
  twLabel = "台股",
  usLabel = "美股",
}: {
  tw: ReactNode;
  us: ReactNode;
  defaultMarket?: Market;
  twLabel?: string;
  usLabel?: string;
}) {
  const [market, setMarket] = useState<Market>(defaultMarket);

  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-(--gridline) bg-(--surface-2) p-0.5">
        <TabButton active={market === "TW"} onClick={() => setMarket("TW")}>
          {twLabel}
        </TabButton>
        <TabButton active={market === "US"} onClick={() => setMarket("US")}>
          {usLabel}
        </TabButton>
      </div>
      <div hidden={market !== "TW"}>{tw}</div>
      <div hidden={market !== "US"}>{us}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-(--accent) text-white" : "text-(--text-secondary) hover:bg-(--page-plane)"
      }`}
    >
      {children}
    </button>
  );
}
