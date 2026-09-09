import { fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Fundamentals, Quote } from "./types";
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
  };
}

interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  currency?: string;
  longName?: string;
  shortName?: string;
}

interface YahooQuoteResponse {
  quoteResponse: { result?: YahooQuoteResult[] };
}

/**
 * Yahoo's batch quote endpoint — one request for many symbols. Listing
 * pages (search/highlights/homepage movers) were each calling
 * fetchUsQuote() per stock, i.e. one chart-endpoint request per symbol;
 * this is far fewer round trips and much less likely to partially fail
 * under concurrent load.
 */
export async function fetchUsQuotesBatch(symbols: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  if (symbols.length === 0) return map;

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols
    .map((s) => encodeURIComponent(s))
    .join(",")}`;
  const res = await fetchWithTimeout(url, 6000, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  const data = (await res.json()) as YahooQuoteResponse;
  for (const r of data.quoteResponse?.result ?? []) {
    const prevClose = r.regularMarketPreviousClose ?? r.regularMarketPrice;
    const change = r.regularMarketPrice - prevClose;
    const known = findInUniverse(r.symbol, "US");
    map.set(r.symbol, {
      symbol: r.symbol,
      market: "US",
      name: r.longName ?? r.shortName ?? known?.name ?? r.symbol,
      price: round2(r.regularMarketPrice),
      change: round2(change),
      changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
      open: round2(r.regularMarketOpen ?? r.regularMarketPrice),
      high: round2(r.regularMarketDayHigh ?? r.regularMarketPrice),
      low: round2(r.regularMarketDayLow ?? r.regularMarketPrice),
      prevClose: round2(prevClose),
      volume: r.regularMarketVolume ?? 0,
      currency: r.currency ?? "USD",
      updatedAt: new Date().toISOString(),
    });
  }
  return map;
}

interface YahooFundamentalsResult {
  trailingPE?: number;
  marketCap?: number;
  dividendYield?: number; // unit is inconsistent across Yahoo endpoints/symbols
  trailingAnnualDividendYield?: number; // fraction, e.g. 0.0053 = 0.53% — prefer this one
}

interface YahooFundamentalsResponse {
  quoteResponse: { result?: YahooFundamentalsResult[] };
}

function normalizeYieldPercent(y: number | undefined): number | undefined {
  if (y == null || !Number.isFinite(y) || y <= 0) return undefined;
  // Yahoo has returned this both as a fraction (0.0053) and already as a
  // percent (0.53) depending on endpoint/symbol; treat anything under 1 as
  // a fraction that needs *100, otherwise assume it's already a percent.
  return round2(y < 1 ? y * 100 : y);
}

export async function fetchUsFundamentals(symbol: string): Promise<Fundamentals | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetchWithTimeout(url, 5000, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  const data = (await res.json()) as YahooFundamentalsResponse;
  const r = data.quoteResponse?.result?.[0];
  if (!r) return null;
  return {
    peRatio: r.trailingPE && Number.isFinite(r.trailingPE) && r.trailingPE > 0 ? round2(r.trailingPE) : undefined,
    dividendYield: normalizeYieldPercent(r.trailingAnnualDividendYield ?? r.dividendYield),
    marketCap: r.marketCap && Number.isFinite(r.marketCap) && r.marketCap > 0 ? r.marketCap : undefined,
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
