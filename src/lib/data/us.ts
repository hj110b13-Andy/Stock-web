import { fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Quote } from "./types";
import { findInUniverse } from "./universe";

// Yahoo Finance's unofficial "chart" endpoint. No API key required. One call
// returns both a live quote (via `meta`) and OHLC history, which is why
// lib/data/index.ts shares a single fetch for both quote + chart on US
// symbols. Swap for a licensed provider (IEX, Polygon, Alpha Vantage) in a
// production deployment.

const RANGE_PARAM: Record<ChartRange, string> = { "1m": "1mo", "3m": "3mo", "6m": "6mo", "1y": "1y" };

interface YahooChartResult {
  meta: {
    currency: string;
    symbol: string;
    regularMarketPrice: number;
    previousClose?: number;
    chartPreviousClose?: number;
    regularMarketVolume?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketOpen?: number;
    longName?: string;
    shortName?: string;
  };
  timestamp?: number[];
  indicators: {
    quote: Array<{
      open: (number | null)[];
      high: (number | null)[];
      low: (number | null)[];
      close: (number | null)[];
      volume: (number | null)[];
    }>;
  };
}

interface YahooChartResponse {
  chart: {
    result?: YahooChartResult[];
    error?: { description: string } | null;
  };
}

async function fetchYahooChart(symbol: string, range: ChartRange): Promise<YahooChartResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${RANGE_PARAM[range]}&interval=1d`;
  const res = await fetchWithTimeout(url, 4500, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? `No Yahoo chart data for ${symbol}`);
  return result;
}

export async function fetchUsQuote(symbol: string): Promise<Quote> {
  const result = await fetchYahooChart(symbol, "1m");
  const meta = result.meta;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
  const change = meta.regularMarketPrice - prevClose;
  const known = findInUniverse(symbol, "US");

  return {
    symbol: meta.symbol,
    market: "US",
    name: meta.longName ?? meta.shortName ?? known?.name ?? symbol,
    price: round2(meta.regularMarketPrice),
    change: round2(change),
    changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
    open: round2(meta.regularMarketOpen ?? meta.regularMarketPrice),
    high: round2(meta.regularMarketDayHigh ?? meta.regularMarketPrice),
    low: round2(meta.regularMarketDayLow ?? meta.regularMarketPrice),
    prevClose: round2(prevClose),
    volume: meta.regularMarketVolume ?? 0,
    currency: meta.currency ?? "USD",
    updatedAt: new Date().toISOString(),
    isMock: false,
  };
}

export async function fetchUsCandles(symbol: string, range: ChartRange): Promise<Candle[]> {
  const result = await fetchYahooChart(symbol, range);
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      time: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: quote.volume[i] ?? 0,
    });
  }
  if (candles.length === 0) throw new Error(`No Yahoo candles for ${symbol}`);
  return candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
