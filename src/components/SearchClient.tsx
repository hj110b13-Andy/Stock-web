"use client";

import { useEffect, useMemo, useState } from "react";
import StockTable from "@/components/StockTable";
import MarketTabs from "@/components/MarketTabs";
import { sectorsFor, type Market, type SearchItem } from "@/lib/data";

type ChangePreset = "all" | "gainers" | "losers" | "big-gainers" | "big-losers";
type SortBy = "changePercent" | "volume" | "price";
type SortDir = "asc" | "desc";

const CHANGE_PRESETS: Record<ChangePreset, { label: string; min?: number; max?: number }> = {
  all: { label: "全部" },
  gainers: { label: "上漲", min: 0 },
  losers: { label: "下跌", max: 0 },
  "big-gainers": { label: "漲幅 > 3%", min: 3 },
  "big-losers": { label: "跌幅 > 3%", max: -3 },
};

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<ChangePreset>("all");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">搜尋 / 篩選股票</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">台股、美股分開顯示，各自可依產業、漲跌幅篩選與排序。</p>
      </div>

      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <Field label="關鍵字（套用到台股與美股）">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="代碼或名稱"
              className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1.5 text-sm w-56"
            />
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

      <MarketTabs
        tw={<MarketSection market="TW" query={query} preset={preset} />}
        us={<MarketSection market="US" query={query} preset={preset} />}
      />
    </div>
  );
}

function MarketSection({
  market,
  query,
  preset,
}: {
  market: Market;
  query: string;
  preset: ChangePreset;
}) {
  const [sector, setSector] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("changePercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [items, setItems] = useState<SearchItem[] | null>(null);

  const sectorOptions = useMemo(() => sectorsFor(market), [market]);

  useEffect(() => {
    const params = new URLSearchParams({ market, sortBy, sortDir });
    if (sector) params.set("sector", sector);
    if (query) params.set("q", query);
    const cfg = CHANGE_PRESETS[preset];
    if (cfg.min !== undefined) params.set("min", String(cfg.min));
    if (cfg.max !== undefined) params.set("max", String(cfg.max));

    const controller = new AbortController();
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [market, sector, query, preset, sortBy, sortDir]);

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4 space-y-3">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
          >
            <option value="">全部產業</option>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
          >
            <option value="changePercent">漲跌幅</option>
            <option value="volume">成交量</option>
            <option value="price">股價</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
            title="切換排序方向"
          >
            {sortDir === "desc" ? "高→低" : "低→高"}
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-(--page-plane)" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-(--text-muted)">
            共 {items.length} 筆
            {items.length > 0 &&
              (() => {
                const liveCount = items.filter((i) => !i.isMock).length;
                if (liveCount === items.length) return "，全部為即時資料";
                if (liveCount === 0) return "，目前皆為示範資料（即時資料源暫時無法連線）";
                return `，${liveCount} 筆即時、${items.length - liveCount} 筆示範（行末灰點標示）`;
              })()}
          </p>
          <StockTable items={items} />
        </>
      )}
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
