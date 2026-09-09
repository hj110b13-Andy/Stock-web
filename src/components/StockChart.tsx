"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, ChartRange } from "@/lib/data";
import { computeSignals } from "@/lib/signals";
import DataBadge from "./DataBadge";
import SignalTags from "./SignalTags";

const RANGE_LABELS: Record<ChartRange, string> = { "1m": "1個月", "3m": "3個月", "6m": "6個月", "1y": "1年" };
const RANGES: ChartRange[] = ["1m", "3m", "6m", "1y"];

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
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chart/${encodeURIComponent(symbol)}?range=${range}&market=${market}`)
      .then((res) => {
        if (!res.ok) throw new Error("圖表資料載入失敗");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCandles(data.candles);
        setIsMock(Boolean(data.isMock));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "圖表資料載入失敗");
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, market, range]);

  useEffect(() => {
    if (!containerRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: styles.getPropertyValue("--text-secondary").trim() || "#52514e",
      },
      grid: {
        vertLines: { color: styles.getPropertyValue("--gridline").trim() || "#e1e0d9" },
        horzLines: { color: styles.getPropertyValue("--gridline").trim() || "#e1e0d9" },
      },
      rightPriceScale: { borderColor: styles.getPropertyValue("--gridline").trim() || "#e1e0d9" },
      timeScale: { borderColor: styles.getPropertyValue("--gridline").trim() || "#e1e0d9" },
      autoSize: true,
    });

    const priceUp = styles.getPropertyValue("--price-up").trim() || "#e34948";
    const priceDown = styles.getPropertyValue("--price-down").trim() || "#008300";

    const series = chart.addSeries(CandlestickSeries, {
      upColor: priceUp,
      downColor: priceDown,
      borderUpColor: priceUp,
      borderDownColor: priceDown,
      wickUpColor: priceUp,
      wickDownColor: priceDown,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: styles.getPropertyValue("--text-muted").trim() || "#898781",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    series.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, []);

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
        color: c.close >= c.open ? "rgba(227,73,72,0.5)" : "rgba(0,131,0,0.5)",
      })),
    };
  }, [candles]);

  useEffect(() => {
    if (!chartData || !seriesRef.current || !volumeRef.current || !chartRef.current) return;
    seriesRef.current.setData(chartData.candles);
    volumeRef.current.setData(chartData.volume);
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

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
        {candles && <DataBadge isMock={isMock} />}
      </div>
      {signals.length > 0 && (
        <div className="mb-3">
          <SignalTags signals={signals} />
        </div>
      )}
      <div className="relative h-[360px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-(--text-muted)">{error}</p>
        )}
        {!error && !candles && (
          <div className="absolute inset-0 animate-pulse rounded-md bg-(--page-plane)" />
        )}
      </div>
    </div>
  );
}
