"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, ChartRange } from "@/lib/data";
import { computeSignals } from "@/lib/signals";
import { formatPrice, formatVolume } from "@/lib/format";
import { readChartPalette, subscribeToTheme } from "@/lib/theme";
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

const RANGE_LABELS: Record<ChartRange, string> = { "1m": "1個月", "3m": "3個月", "6m": "6個月", "1y": "1年" };
const RANGES: ChartRange[] = ["1m", "3m", "6m", "1y"];

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candleMapRef = useRef<Map<string, Candle>>(new Map());
  const currency = market === "TW" ? "TWD" : "USD";
  // Live values for the crosshair callback, which is registered once but
  // has to keep reflecting the current theme and the current symbol.
  const paletteRef = useRef(FALLBACK_PALETTE);
  const formatRef = useRef({ currency, market });
  useEffect(() => {
    formatRef.current = { currency, market };
  }, [currency, market]);

  useEffect(() => {
    let cancelled = false;
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
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, market, range]);

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

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
    // Created once and never re-subscribed: the crosshair callback reads
    // the current palette and symbol formatting through refs instead.
  }, []);

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
  }, [themeTick]);

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
    chartRef.current.timeScale().fitContent();
  }, [chartData, themeTick]);

  const signals = useMemo(
    () => (candles ? computeSignals(candles, currentPrice, range) : []),
    [candles, currentPrice, range]
  );

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex gap-1">
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
      </div>
      {signals.length > 0 && (
        <div className="mb-3">
          <SignalTags signals={signals} />
        </div>
      )}
      <div className="relative h-[360px] w-full">
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
      </div>
      <p className="mt-2 text-[11px] text-(--text-muted)">將滑鼠移到圖表上可查看該日詳細開高低收與成交量</p>
    </div>
  );
}
