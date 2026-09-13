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

  // Bollinger Bands (20-period SMA ± 2 standard deviations of that same
  // window) — price touching its own trailing band is self-referential
  // (compares the stock to its own recent volatility, not a fixed threshold
  // that would mean different things for a quiet blue-chip vs a volatile
  // small-cap), so this stays consistent with the rest of this file's
  // "compare to itself" approach. Deliberately not adding a "band squeeze"
  // (narrow-width) signal: what counts as "narrow" only makes sense relative
  // to a stock's own historical band width, which needs a longer lookback
  // than what's reliably available here — a single cross-stock width
  // threshold would be exactly the kind of false-precision this codebase
  // avoids elsewhere.
  const bollinger = computeBollingerSignal(candles, currentPrice);
  if (bollinger) signals.push(bollinger);

  // KD (stochastic oscillator, 9,3,3) — like MACD above, only fires on the
  // day %K actually crosses %D, and only when that cross happens in the
  // extreme (oversold/overbought) zone, which is the conventional reading;
  // a cross in the middle of the range is just noise.
  const kd = computeKdCross(candles);
  if (kd === "golden") signals.push({ label: "KD低檔黃金交叉", tone: "up" });
  else if (kd === "death") signals.push({ label: "KD高檔死亡交叉", tone: "down" });

  return signals;
}

/** Trailing simple moving average — returns one value per input index, null
 *  wherever there isn't yet a full window (keeps the caller's indices
 *  aligned with the input array instead of needing separate offset math). */
function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function computeBollingerSignal(candles: Candle[], currentPrice: number): Signal | null {
  const PERIOD = 20;
  if (candles.length < PERIOD) return null;
  const window = candles.slice(-PERIOD).map((c) => c.close);
  const mean = window.reduce((a, b) => a + b, 0) / PERIOD;
  const variance = window.reduce((a, c) => a + (c - mean) ** 2, 0) / PERIOD;
  const stdDev = Math.sqrt(variance);
  const upper = mean + 2 * stdDev;
  const lower = mean - 2 * stdDev;
  if (currentPrice >= upper) return { label: "觸及布林通道上緣（波動放大）", tone: "up" };
  if (currentPrice <= lower) return { label: "觸及布林通道下緣（波動放大）", tone: "down" };
  return null;
}

/**
 * %K = (close − trailing-N low) / (trailing-N high − trailing-N low) × 100,
 * then smoothed twice by a 3-period SMA (the conventional "slow" KD: the
 * once-smoothed series is %K, the twice-smoothed series is %D) — matches
 * the (9,3,3) parameters most charting platforms default to.
 */
function computeKdCross(candles: Candle[]): "golden" | "death" | null {
  const PERIOD = 9;
  const SMOOTH = 3;
  if (candles.length < PERIOD + SMOOTH * 2) return null;

  const rawK = candles.map((c, i) => {
    if (i < PERIOD - 1) return null;
    const window = candles.slice(i - PERIOD + 1, i + 1);
    const highestHigh = Math.max(...window.map((w) => w.high));
    const lowestLow = Math.min(...window.map((w) => w.low));
    const range = highestHigh - lowestLow;
    return range > 0 ? ((c.close - lowestLow) / range) * 100 : 50;
  });
  const validRawK = rawK.filter((v): v is number => v !== null);
  const kSeries = sma(validRawK, SMOOTH).filter((v): v is number => v !== null);
  const dSeries = sma(kSeries, SMOOTH).filter((v): v is number => v !== null);

  if (kSeries.length < 2 || dSeries.length < 2) return null;
  // Both series' *last* entries land on the same (most recent) trading day —
  // dSeries is derived from kSeries but is only shorter at the front (it
  // needs an extra SMOOTH-1 days of kSeries before it can start), so
  // indexing from the end keeps same-day values paired without extra offset
  // math: kSeries[len-1]/dSeries[len-1] is "today", [len-2] is "yesterday".
  const lastK = kSeries[kSeries.length - 1];
  const prevK = kSeries[kSeries.length - 2];
  const lastD = dSeries[dSeries.length - 1];
  const prevD = dSeries[dSeries.length - 2];
  if (lastK === undefined || prevK === undefined || lastD === undefined || prevD === undefined) return null;

  if (prevK <= prevD && lastK > lastD && lastK <= 30) return "golden";
  if (prevK >= prevD && lastK < lastD && lastK >= 70) return "death";
  return null;
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
