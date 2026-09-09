import type { Candle, ChartRange } from "@/lib/data";

export interface Signal {
  label: string;
  tone: "up" | "down" | "neutral";
}

const RANGE_LABEL: Record<ChartRange, string> = { "1m": "1個月", "3m": "3個月", "6m": "6個月", "1y": "1年" };

/**
 * Purely descriptive, objective technical signals computed from OHLCV data
 * already on the page — no recommendation, no "buy/sell" language. Each
 * signal states an observable fact (volume vs its own average, price vs its
 * own recent range) so the reader draws their own conclusion.
 */
export function computeSignals(candles: Candle[], currentPrice: number, range: ChartRange): Signal[] {
  if (candles.length < 5) return [];
  const signals: Signal[] = [];
  const rangeLabel = RANGE_LABEL[range];

  // Volume vs its own trailing average (excludes the latest bar).
  const latest = candles[candles.length - 1];
  const priorVolumes = candles.slice(Math.max(0, candles.length - 21), candles.length - 1).map((c) => c.volume);
  if (priorVolumes.length >= 5) {
    const avgVolume = priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length;
    if (avgVolume > 0) {
      const ratio = latest.volume / avgVolume;
      if (ratio >= 2) signals.push({ label: `爆量（${ratio.toFixed(1)}倍均量）`, tone: "up" });
      else if (ratio <= 0.5) signals.push({ label: "量縮", tone: "neutral" });
    }
  }

  // Price vs the high/low of the currently-loaded window.
  const windowHigh = Math.max(...candles.map((c) => c.high));
  const windowLow = Math.min(...candles.map((c) => c.low));
  if (currentPrice >= windowHigh) signals.push({ label: `創${rangeLabel}新高`, tone: "up" });
  else if (currentPrice <= windowLow) signals.push({ label: `創${rangeLabel}新低`, tone: "down" });

  // Price vs 20-day moving average.
  const ma20Window = candles.slice(-20);
  if (ma20Window.length >= 10) {
    const ma20 = ma20Window.reduce((a, c) => a + c.close, 0) / ma20Window.length;
    if (currentPrice > ma20) signals.push({ label: "站上20日均線", tone: "up" });
    else if (currentPrice < ma20) signals.push({ label: "跌破20日均線", tone: "down" });
  }

  // Consecutive up/down days (from the most recent bar backwards).
  let streak = 0;
  let direction: "up" | "down" | null = null;
  for (let i = candles.length - 1; i > 0; i--) {
    const change = candles[i].close - candles[i - 1].close;
    const dir = change > 0 ? "up" : change < 0 ? "down" : null;
    if (dir === null) break;
    if (direction === null) direction = dir;
    if (dir !== direction) break;
    streak++;
  }
  if (streak >= 3 && direction) {
    signals.push({ label: `連${direction === "up" ? "漲" : "跌"} ${streak} 天`, tone: direction });
  }

  return signals;
}
