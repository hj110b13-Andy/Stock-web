import type { Candle, ChartRange } from "@/lib/data/types";

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

  // RSI (14-period, simple average of gains/losses — not Wilder-smoothed,
  // consistent with the simple-average MA20 above rather than mixing
  // smoothing methods within the same signal set).
  const rsi = computeRSI(candles, 14);
  if (rsi != null) {
    if (rsi >= 70) signals.push({ label: `RSI ${rsi.toFixed(0)}（超買區）`, tone: "up" });
    else if (rsi <= 30) signals.push({ label: `RSI ${rsi.toFixed(0)}（超賣區）`, tone: "down" });
  }

  // MACD golden/death cross: only fires the day the 12/26-EMA MACD line
  // actually crosses its 9-EMA signal line, not every day it happens to sit
  // above/below it (which would just restate "上漲/下跌" already covered by
  // the MA20 and streak signals above).
  const macd = computeMacdCross(candles);
  if (macd === "golden") signals.push({ label: "MACD黃金交叉", tone: "up" });
  else if (macd === "death") signals.push({ label: "MACD死亡交叉", tone: "down" });

  return signals;
}

/** Simple (non-Wilder-smoothed) RSI over the trailing `period` closes. */
function computeRSI(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (gains === 0 && losses === 0) return null;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Detects whether the MACD line (EMA12 − EMA26) crossed its EMA9 signal
 * line on the most recent bar. Needs enough bars for EMA26 to have actually
 * converged before treating the signal line as meaningful — with too few
 * bars this is just comparing early warm-up noise.
 */
function computeMacdCross(candles: Candle[]): "golden" | "death" | null {
  const MIN_BARS = 50; // "3m" charts run ~60-65 trading days; leave margin for short months
  if (candles.length < MIN_BARS) return null;
  const closes = candles.map((c) => c.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const prevMacd = macdLine[last - 1];
  const prevSignal = signalLine[last - 1];
  const macd = macdLine[last];
  const signal = signalLine[last];
  if (prevMacd <= prevSignal && macd > signal) return "golden";
  if (prevMacd >= prevSignal && macd < signal) return "death";
  return null;
}
