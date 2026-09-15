"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, ChartRange } from "@/lib/data";
import { computeSignals } from "@/lib/signals";
import { computeBollingerSeries, computeKdSeries, computeMacdSeries, computeMaSeries, computeRsiSeries } from "@/lib/indicators";
import { formatPrice, formatVolume } from "@/lib/format";
import { readChartPalette, subscribeToTheme } from "@/lib/theme";
import {
  DEFAULT_INDICATOR_SETTINGS,
  INDICATOR_SETTINGS_CHANGED_EVENT,
  getIndicatorSettings,
  setIndicatorSettings,
  type ChartIndicatorSettings,
} from "@/lib/chartIndicatorSettings";
import SignalTags from "./SignalTags";

// Only used before the first client-side read of the CSS custom properties.
const FALLBACK_PALETTE = {
  textSecondary: "#52514e",
  gridline: "#e1e0d9",
  priceUp: "#e34948",
  priceDown: "#008300",
  priceUpSoft: "#e3494880",
  priceDownSoft: "#00830080",
  textMuted: "#898781",
};

const RANGE_LABELS: Record<ChartRange, string> = {
  "5d": "5日",
  "10d": "10日",
  "1m": "1個月",
  "3m": "3個月",
  "6m": "6個月",
  "1y": "1年",
  "2y": "2年",
  "5y": "5年",
  "10y": "10年",
};
const RANGES: ChartRange[] = ["5d", "10d", "1m", "3m", "6m", "1y", "2y", "5y", "10y"];

// Fixed, saturated colors chosen to read reasonably against both the light
// and dark chart backgrounds — deliberately NOT theme-adjusted the way the
// candlestick/gridline palette below is, since these just need to be
// distinguishable from each other and from the candles, not match either
// theme's accent scheme specifically.
const MA_COLORS: Record<"ma5" | "ma10" | "ma20" | "ma60", string> = {
  ma5: "#f59e0b",
  ma10: "#3b82f6",
  ma20: "#a855f7",
  ma60: "#14b8a6",
};
const BOLLINGER_COLOR = "#6b7280";
const MACD_COLOR = "#3b82f6";
const MACD_SIGNAL_COLOR = "#f59e0b";
const RSI_COLOR = "#a855f7";
const KD_K_COLOR = "#3b82f6";
const KD_D_COLOR = "#f59e0b";

const INDICATOR_LABELS: Array<{ key: keyof ChartIndicatorSettings; label: string }> = [
  { key: "ma5", label: "MA5" },
  { key: "ma10", label: "MA10" },
  { key: "ma20", label: "MA20" },
  { key: "ma60", label: "MA60" },
  { key: "bollinger", label: "布林通道" },
  { key: "macd", label: "MACD" },
  { key: "rsi", label: "RSI" },
  { key: "kd", label: "KD" },
];
// These three need their own sub-pane (a different value range than price);
// order here fixes which pane index each one gets (pane 1, 2, 3...) whenever
// it's enabled, so recreating the chart after a settings change always
// produces the same, stable layout instead of panes shuffling around.
const SUB_PANE_INDICATORS: Array<"macd" | "rsi" | "kd"> = ["macd", "rsi", "kd"];

function timeToKey(t: Time): string {
  if (typeof t === "string") return t;
  if (typeof t === "number") return new Date(t * 1000).toISOString().slice(0, 10);
  const y = t.year;
  const m = String(t.month).padStart(2, "0");
  const d = String(t.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function StockChart({
  symbol,
  market,
  currentPrice,
}: {
  symbol: string;
  market: "TW" | "US";
  currentPrice: number;
}) {
  const [range, setRange] = useState<ChartRange>("3m");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [indicators, setIndicators] = useState<ChartIndicatorSettings>(DEFAULT_INDICATOR_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<Partial<Record<"ma5" | "ma10" | "ma20" | "ma60", ISeriesApi<"Line">>>>({});
  const bollingerSeriesRef = useRef<{ upper?: ISeriesApi<"Line">; middle?: ISeriesApi<"Line">; lower?: ISeriesApi<"Line"> }>({});
  const macdSeriesRef = useRef<{ macd?: ISeriesApi<"Line">; signal?: ISeriesApi<"Line">; histogram?: ISeriesApi<"Histogram"> }>({});
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const kdSeriesRef = useRef<{ k?: ISeriesApi<"Line">; d?: ISeriesApi<"Line"> }>({});
  const candleMapRef = useRef<Map<string, Candle>>(new Map());
  const currency = market === "TW" ? "TWD" : "USD";
  // Live values for the crosshair callback, which is registered once but
  // has to keep reflecting the current theme and the current symbol.
  const paletteRef = useRef(FALLBACK_PALETTE);
  const formatRef = useRef({ currency, market });
  useEffect(() => {
    formatRef.current = { currency, market };
  }, [currency, market]);

  // Global (not per-stock) setting: load once on mount, and keep in sync if
  // it's changed from elsewhere (e.g. this same chart's own settings panel
  // updates it, or in principle another tab). Deliberately loaded via an
  // effect (not directly in useState's initializer) so server-rendered
  // markup and the first client render agree before localStorage is read.
  useEffect(() => {
    setIndicators(getIndicatorSettings());
    const onChange = () => setIndicators(getIndicatorSettings());
    window.addEventListener(INDICATOR_SETTINGS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(INDICATOR_SETTINGS_CHANGED_EVENT, onChange);
  }, []);

  function toggleIndicator(key: keyof ChartIndicatorSettings) {
    const next = { ...indicators, [key]: !indicators[key] };
    setIndicators(next);
    setIndicatorSettings(next);
  }

  useEffect(() => {
    let cancelled = false;
    // Switching range (especially a heavier one like "10年") could take
    // several seconds, and candles/error both deliberately keep their
    // previous values during that wait (jarring to blank the whole chart
    // for what might resolve in 200ms) — but that meant nothing on screen
    // changed at all while a slower fetch was in flight, which read as "the
    // button didn't do anything" rather than "still loading." isLoading
    // drives a visible overlay for exactly that gap, on top of whichever
    // chart is still showing.
    setIsLoading(true);
    fetch(`/api/chart/${encodeURIComponent(symbol)}?range=${range}&market=${market}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "圖表資料暫時無法取得");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setCandles(data.candles);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setCandles(null);
          setError(err.message ?? "圖表資料暫時無法取得");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, market, range]);

  // Which sub-panes (MACD/RSI/KD, each needs its own value-range pane
  // distinct from price) are needed for the CURRENT settings, and at which
  // index — recomputed whenever settings change, feeding the chart-creation
  // effect below so panes are added in the same fixed order every time.
  const activeSubPanes = useMemo(
    () => SUB_PANE_INDICATORS.filter((k) => indicators[k]),
    [indicators]
  );

  // Recreated (not just updated) whenever which indicators are enabled
  // changes: lightweight-charts' pane indices shift when a pane is removed,
  // which makes incremental add/remove error-prone to get right for an
  // arbitrary combination of toggled indicators — tearing down and
  // rebuilding with exactly the panes the CURRENT settings need is far
  // simpler and, since toggling a checkbox is an infrequent, deliberate
  // action (not something that happens on every render), an acceptable
  // cost. Data itself is applied in the separate effect below, keyed on
  // `chartVersion` so it re-runs after every rebuild here too.
  const [chartVersion, setChartVersion] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const palette = readChartPalette();
    paletteRef.current = palette;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.textSecondary,
      },
      grid: {
        vertLines: { color: palette.gridline },
        horzLines: { color: palette.gridline },
      },
      rightPriceScale: { borderColor: palette.gridline },
      timeScale: { borderColor: palette.gridline },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.priceUp,
      downColor: palette.priceDown,
      borderUpColor: palette.priceUp,
      borderDownColor: palette.priceDown,
      wickUpColor: palette.priceUp,
      wickDownColor: palette.priceDown,
    });

    const volume = chart.addSeries(HistogramSeries, {
      // lightweight-charts' built-in "volume" formatter always abbreviates
      // with K/M/B (US convention) — on a TW chart that showed the axis
      // label as e.g. "21.13M" while every other volume figure on the same
      // page (header, tooltip) correctly reads in 張 via formatVolume(),
      // a mismatch an Opus QA pass flagged. A custom formatter routes this
      // one through the same shared formatVolume() so all three agree.
      priceFormat: { type: "custom", formatter: (price: number) => formatVolume(price, market), minMove: 1 },
      priceScaleId: "volume",
      color: palette.textMuted,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    series.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    maSeriesRef.current = {};
    bollingerSeriesRef.current = {};
    macdSeriesRef.current = {};
    rsiSeriesRef.current = null;
    kdSeriesRef.current = {};

    // Price-pane overlays: moving averages and Bollinger bands share the
    // same value range as the candles, so they go on pane 0 alongside them.
    (["ma5", "ma10", "ma20", "ma60"] as const).forEach((key) => {
      if (!indicators[key]) return;
      maSeriesRef.current[key] = chart.addSeries(LineSeries, {
        color: MA_COLORS[key],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    });
    if (indicators.bollinger) {
      const opts = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      bollingerSeriesRef.current.upper = chart.addSeries(LineSeries, { ...opts, color: BOLLINGER_COLOR });
      bollingerSeriesRef.current.middle = chart.addSeries(LineSeries, { ...opts, color: BOLLINGER_COLOR, lineStyle: 2 });
      bollingerSeriesRef.current.lower = chart.addSeries(LineSeries, { ...opts, color: BOLLINGER_COLOR });
    }

    // Sub-panes: each gets a fixed index based on SUB_PANE_INDICATORS order
    // among whichever of macd/rsi/kd are actually enabled this time.
    activeSubPanes.forEach((key, i) => {
      const paneIndex = i + 1;
      if (key === "macd") {
        macdSeriesRef.current.histogram = chart.addSeries(
          HistogramSeries,
          { color: palette.textMuted, priceLineVisible: false, lastValueVisible: false },
          paneIndex
        );
        macdSeriesRef.current.macd = chart.addSeries(
          LineSeries,
          { color: MACD_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          paneIndex
        );
        macdSeriesRef.current.signal = chart.addSeries(
          LineSeries,
          { color: MACD_SIGNAL_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          paneIndex
        );
      } else if (key === "rsi") {
        rsiSeriesRef.current = chart.addSeries(
          LineSeries,
          { color: RSI_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          paneIndex
        );
      } else if (key === "kd") {
        kdSeriesRef.current.k = chart.addSeries(
          LineSeries,
          { color: KD_K_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          paneIndex
        );
        kdSeriesRef.current.d = chart.addSeries(
          LineSeries,
          { color: KD_D_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          paneIndex
        );
      }
    });

    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      const container = containerRef.current;
      if (!tooltip || !container) return;

      if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.opacity = "0";
        return;
      }
      const candle = candleMapRef.current.get(timeToKey(param.time));
      if (!candle) {
        tooltip.style.opacity = "0";
        return;
      }

      // Read through refs, never the values captured when the chart was
      // created: this callback outlives both a theme switch and a change of
      // symbol/market, and a stale capture would draw a light-theme tooltip
      // over a dark chart, or format a US price with TW 張/TWD rules.
      const { priceUp, priceDown, textMuted } = paletteRef.current;
      const { currency, market } = formatRef.current;
      const up = candle.close >= candle.open;
      const dirColor = up ? priceUp : priceDown;
      tooltip.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px">${candle.time}</div>
        <div style="display:grid;grid-template-columns:auto auto;column-gap:10px;row-gap:2px;font-variant-numeric:tabular-nums">
          <span style="color:${textMuted}">開</span><span>${formatPrice(candle.open, currency)}</span>
          <span style="color:${textMuted}">高</span><span style="color:${priceUp}">${formatPrice(candle.high, currency)}</span>
          <span style="color:${textMuted}">低</span><span style="color:${priceDown}">${formatPrice(candle.low, currency)}</span>
          <span style="color:${textMuted}">收</span><span style="color:${dirColor};font-weight:600">${formatPrice(candle.close, currency)}</span>
          <span style="color:${textMuted}">量</span><span>${formatVolume(candle.volume, market)}</span>
        </div>
      `;
      tooltip.style.opacity = "1";

      const pad = 14;
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = param.point.x + pad;
      if (left + tw > container.clientWidth) left = param.point.x - tw - pad;
      let top = param.point.y + pad;
      if (top + th > container.clientHeight) top = container.clientHeight - th - pad;
      tooltip.style.left = `${Math.max(0, left)}px`;
      tooltip.style.top = `${Math.max(0, top)}px`;
    });

    setChartVersion((v) => v + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
    // Recreated on indicator-settings change (activeSubPanes derives from
    // it) — theme changes are handled separately below via applyOptions
    // rather than a full recreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators]);

  // The chart paints itself imperatively, so unlike the rest of the page it
  // does not follow a theme switch on its own — without this it keeps the
  // palette that was in effect when it was created, leaving light-grey
  // gridlines and axis labels sitting on the dark surface (and vice versa).
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => subscribeToTheme(() => setThemeTick((t) => t + 1)), []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!chart || !series || !volume) return;
    const palette = readChartPalette();
    paletteRef.current = palette;
    chart.applyOptions({
      layout: { textColor: palette.textSecondary },
      grid: { vertLines: { color: palette.gridline }, horzLines: { color: palette.gridline } },
      rightPriceScale: { borderColor: palette.gridline },
      timeScale: { borderColor: palette.gridline },
    });
    series.applyOptions({
      upColor: palette.priceUp,
      downColor: palette.priceDown,
      borderUpColor: palette.priceUp,
      borderDownColor: palette.priceDown,
      wickUpColor: palette.priceUp,
      wickDownColor: palette.priceDown,
    });
    volume.applyOptions({ color: palette.textMuted });
  }, [themeTick, chartVersion]);

  // Shape only — the volume bars' colours are theme-dependent and so are
  // applied in the effect below, which runs after the palette has been
  // refreshed. Deriving them here instead would read the previous palette,
  // since render happens before effects, leaving the bars one toggle behind.
  const chartData = useMemo(() => {
    if (!candles) return null;
    return {
      candles: candles.map((c) => ({
        time: c.time as unknown as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
      volume: candles.map((c) => ({
        time: c.time as unknown as UTCTimestamp,
        value: c.volume,
        rising: c.close >= c.open,
      })),
    };
  }, [candles]);

  useEffect(() => {
    candleMapRef.current = new Map((candles ?? []).map((c) => [c.time, c]));
  }, [candles]);

  useEffect(() => {
    if (!chartData || !seriesRef.current || !volumeRef.current || !chartRef.current) return;
    const { priceUpSoft, priceDownSoft } = paletteRef.current;
    seriesRef.current.setData(chartData.candles);
    volumeRef.current.setData(
      chartData.volume.map((v) => ({
        time: v.time,
        value: v.value,
        color: v.rising ? priceUpSoft : priceDownSoft,
      }))
    );

    // Indicator series are only present (in the refs) when their pane/line
    // was actually created for the current settings — each is computed
    // fresh from the full candle set (not incrementally), which is cheap
    // enough at chart-load scale (at most a few thousand candles even for
    // "10年") and avoids having to track partial-update state per series.
    if (candles) {
      (["ma5", "ma10", "ma20", "ma60"] as const).forEach((key) => {
        const s = maSeriesRef.current[key];
        if (!s) return;
        const period = { ma5: 5, ma10: 10, ma20: 20, ma60: 60 }[key];
        s.setData(computeMaSeries(candles, period).map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
      });
      if (bollingerSeriesRef.current.upper) {
        const b = computeBollingerSeries(candles);
        bollingerSeriesRef.current.upper.setData(b.upper.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
        bollingerSeriesRef.current.middle?.setData(b.middle.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
        bollingerSeriesRef.current.lower?.setData(b.lower.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
      }
      if (macdSeriesRef.current.macd) {
        const m = computeMacdSeries(candles);
        macdSeriesRef.current.macd.setData(m.macd.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
        macdSeriesRef.current.signal?.setData(m.signal.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
        macdSeriesRef.current.histogram?.setData(
          m.histogram.map((p) => ({
            time: p.time as unknown as UTCTimestamp,
            value: p.value,
            color: p.value >= 0 ? paletteRef.current.priceUpSoft : paletteRef.current.priceDownSoft,
          }))
        );
      }
      if (rsiSeriesRef.current) {
        rsiSeriesRef.current.setData(
          computeRsiSeries(candles).map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value }))
        );
      }
      if (kdSeriesRef.current.k) {
        const kd = computeKdSeries(candles);
        kdSeriesRef.current.k.setData(kd.k.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
        kdSeriesRef.current.d?.setData(kd.d.map((p) => ({ time: p.time as unknown as UTCTimestamp, value: p.value })));
      }
    }

    chartRef.current.timeScale().fitContent();
  }, [chartData, themeTick, chartVersion, candles]);

  const signals = useMemo(
    () => (candles ? computeSignals(candles, currentPrice, range) : []),
    [candles, currentPrice, range]
  );

  // Sub-panes each need real vertical room of their own, or MACD/RSI/KD
  // render squashed into a sliver under the price pane.
  const chartHeight = 360 + activeSubPanes.length * 130;

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                r === range
                  ? "bg-(--accent) text-white"
                  : "text-(--text-secondary) hover:bg-(--page-plane)"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-md border border-(--gridline) px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:bg-(--page-plane)"
          >
            ⚙ 技術線
          </button>
          {showSettings && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-(--gridline) bg-(--surface-1) p-2 shadow-lg">
              <p className="mb-1 px-1 text-[13px] text-(--text-muted)">套用到所有股票的圖表</p>
              {INDICATOR_LABELS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-(--page-plane)">
                  <input type="checkbox" checked={indicators[key]} onChange={() => toggleIndicator(key)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      {signals.length > 0 && (
        <div className="mb-3">
          <SignalTags signals={signals} />
        </div>
      )}
      <div className="relative w-full" style={{ height: chartHeight }}>
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-2 text-xs shadow-lg opacity-0 transition-opacity"
        />
        {error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-(--text-muted)">{error}</p>
        )}
        {!error && !candles && (
          <div className="absolute inset-0 animate-pulse rounded-md bg-(--page-plane)" />
        )}
        {isLoading && candles && (
          <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-(--gridline) bg-(--surface-1) px-2.5 py-1 text-[13px] text-(--text-muted) shadow">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-(--text-muted) border-t-transparent" />
            載入中…
          </div>
        )}
      </div>
      <p className="mt-2 text-[13px] text-(--text-muted)">將滑鼠移到圖表上可查看該日詳細開高低收與成交量</p>
    </div>
  );
}
