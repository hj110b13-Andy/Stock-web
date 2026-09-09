"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import StockTable from "@/components/StockTable";
import { sectorsFor, type Market, type SearchItem } from "@/lib/data";

type MarketFilter = "ALL" | Market;
type ChangePreset = "all" | "gainers" | "losers" | "big-gainers" | "big-losers";

const CHANGE_PRESETS: Record<ChangePreset, { label: string; min?: number; max?: number }> = {
  all: { label: "全部" },
  gainers: { label: "上漲", min: 0 },
  losers: { label: "下跌", max: 0 },
  "big-gainers": { label: "漲幅 > 3%", min: 3 },
  "big-losers": { label: "跌幅 > 3%", max: -3 },
};

export default function SearchClient() {
  const initial = useSearchParams();
  const [market, setMarket] = useState<MarketFilter>((initial.get("market") as MarketFilter) ?? "ALL");
  const [sector, setSector] = useState<string>("");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<ChangePreset>("all");
  const [sortBy, setSortBy] = useState<"changePercent" | "volume" | "price">("changePercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [items, setItems] = useState<SearchItem[] | null>(null);

  const sectorOptions = useMemo(() => {
    if (market === "ALL") return [...new Set([...sectorsFor("TW"), ...sectorsFor("US")])].sort();
    return sectorsFor(market);
  }, [market]);

  function handleMarketChange(next: MarketFilter) {
    setMarket(next);
    setSector("");
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (market !== "ALL") params.set("market", market);
    if (sector) params.set("sector", sector);
    if (query) params.set("q", query);
    const cfg = CHANGE_PRESETS[preset];
    if (cfg.min !== undefined) params.set("min", String(cfg.min));
    if (cfg.max !== undefined) params.set("max", String(cfg.max));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    const controller = new AbortController();
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [market, sector, query, preset, sortBy, sortDir]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">搜尋 / 篩選股票</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">依市場、產業、漲跌幅快速篩選台股與美股。</p>
      </div>

      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <Field label="市場">
            <select
              value={market}
              onChange={(e) => handleMarketChange(e.target.value as MarketFilter)}
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm"
            >
              <option value="ALL">全部</option>
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </select>
          </Field>

          <Field label="產業">
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm"
            >
              <option value="">全部產業</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="關鍵字">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="代碼或名稱"
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm w-40"
            />
          </Field>

          <Field label="排序">
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm"
              >
                <option value="changePercent">漲跌幅</option>
                <option value="volume">成交量</option>
                <option value="price">股價</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm"
                title="切換排序方向"
              >
                {sortDir === "desc" ? "由高到低" : "由低到高"}
              </button>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(CHANGE_PRESETS) as ChangePreset[]).map((key) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                preset === key
                  ? "bg-(--accent) text-white border-(--accent)"
                  : "border-(--gridline) text-(--text-secondary) hover:bg-(--page-plane)"
              }`}
            >
              {CHANGE_PRESETS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
        {items === null ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-(--page-plane)" />
            ))}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-(--text-muted)">共 {items.length} 筆結果（示範資料，非即時報價）</p>
            <StockTable items={items} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
      {label}
      {children}
    </label>
  );
}
