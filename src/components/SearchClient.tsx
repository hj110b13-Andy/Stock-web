"use client";

import { useEffect, useState } from "react";
import StockTable from "@/components/StockTable";
import MarketTabs from "@/components/MarketTabs";
import type { Market, SearchItem } from "@/lib/data";

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
        <p className="mt-1 text-sm text-(--text-secondary)">台股、美股分開顯示，各自可依產業、股價、漲跌幅篩選與排序。</p>
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
  const [sectors, setSectors] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("changePercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sectors?market=${market}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSectorOptions(data.sectors ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [market]);

  useEffect(() => {
    const params = new URLSearchParams({ market, sortBy, sortDir });
    if (sectors.length > 0) params.set("sectors", sectors.join(","));
    if (query) params.set("q", query);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    const cfg = CHANGE_PRESETS[preset];
    if (cfg.min !== undefined) params.set("min", String(cfg.min));
    if (cfg.max !== undefined) params.set("max", String(cfg.max));

    const controller = new AbortController();
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [market, sectors, query, preset, minPrice, maxPrice, sortBy, sortDir]);

  function toggleSector(s: string) {
    setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SectorMultiSelect options={sectorOptions} selected={sectors} onToggle={toggleSector} onClear={() => setSectors([])} />

        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            placeholder="最低價"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-20 rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
          />
          <span className="text-(--text-muted)">–</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="最高價"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-20 rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs"
          />
        </div>

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

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-(--page-plane)" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-(--text-muted)">
            共 {items.length} 筆{items.length === 0 ? "（可能是篩選條件過嚴，或即時資料暫時無法取得）" : ""}
          </p>
          <StockTable items={items} />
        </>
      )}
    </div>
  );
}

function SectorMultiSelect({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: string[];
  onToggle: (s: string) => void;
  onClear: () => void;
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-(--gridline) bg-(--surface-2) px-2 py-1 text-xs">
        產業{selected.length > 0 ? `（已選 ${selected.length}）` : "：全部"}
      </summary>
      <div className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-md border border-(--gridline) bg-(--surface-1) p-2 shadow-lg">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-(--text-muted)">多選產業</span>
          <button onClick={onClear} className="text-[11px] text-(--accent) hover:underline">
            清除
          </button>
        </div>
        {options.map((s) => (
          <label key={s} className="flex items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-(--page-plane)">
            <input type="checkbox" checked={selected.includes(s)} onChange={() => onToggle(s)} />
            {s}
          </label>
        ))}
      </div>
    </details>
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
