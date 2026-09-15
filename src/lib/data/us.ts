import { cached, chunk, fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Earnings, Fundamentals, Quote } from "./types";
import { findInUniverse } from "./universe";

// Yahoo Finance's unofficial "chart" endpoint. No API key required. One call
// returns both a live quote (via `meta`) and OHLC history, which is why
// lib/data/index.ts shares a single fetch for both quote + chart on US
// symbols. Swap for a licensed provider (IEX, Polygon, Alpha Vantage) in a
// production deployment.

// Yahoo natively supports all of these as a single request each (no
// month-by-month chunking needed the way TW's STOCK_DAY-style endpoints
// require — one call returns the whole range at daily granularity even for
// 10y). "10d" has no native Yahoo range value, so it borrows "1mo" and gets
// trimmed by candle count after fetching (see fetchUsCandles below) — "5d"
// doesn't need that, Yahoo supports it directly.
const RANGE_PARAM: Record<ChartRange, string> = {
  // Unreachable in practice — lib/data/index.ts's getChart() intercepts
  // "today" before it ever reaches fetchUsCandles(), routing it to
  // fetchYahooIntradayCandles() below instead (a completely different
  // Yahoo `interval` param, not a `range` value this daily-candle fetcher
  // uses). Present only so this Record stays exhaustive over ChartRange.
  today: "1d",
  "5d": "5d",
  "10d": "1mo",
  "1m": "1mo",
  "3m": "3mo",
  "6m": "6mo",
  "1y": "1y",
  "2y": "2y",
  "5y": "5y",
  "10y": "10y",
};
const RANGE_DAYS: Partial<Record<ChartRange, number>> = { "10d": 10 };

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface YahooAuth {
  cookie: string;
  crumb: string;
}

/**
 * Yahoo's `v7/finance/quote` (used for batch quotes and fundamentals) now
 * rejects unauthenticated requests with 401 "Invalid Crumb" — it needs a
 * session cookie plus a crumb token minted against that same cookie. Both
 * come from unauthenticated endpoints (no login/API key involved, just a
 * handshake Yahoo's own web app performs before calling its API), so this
 * fetches a cookie from a lightweight Yahoo endpoint, exchanges it for a
 * crumb, and returns both for the caller to attach. `fc.yahoo.com` itself
 * 404s — fetched with redirect:"manual" because only its `Set-Cookie` is
 * wanted, not whatever page a redirect would land on.
 */
async function fetchYahooAuth(): Promise<YahooAuth | null> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": YAHOO_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    const setCookies =
      typeof cookieRes.headers.getSetCookie === "function"
        ? cookieRes.headers.getSetCookie()
        : [cookieRes.headers.get("set-cookie")].filter((c): c is string => !!c);
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
      signal: AbortSignal.timeout(4000),
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null; // an HTML error page, not a real crumb
    return { cookie, crumb };
  } catch {
    return null;
  }
}

/**
 * Cached well under an hour: the crumb stays valid for as long as its
 * cookie does (much longer than one request), so redoing this handshake on
 * every call would just double Yahoo round-trips for nothing. Caller must
 * treat a null result as "proceed unauthenticated" rather than fail outright
 * — if Yahoo ever changes this handshake too, quotes/fundamentals degrade
 * back to today's behavior instead of breaking harder.
 */
function getYahooAuth(): Promise<YahooAuth | null> {
  return cached("yahoo:auth", 50 * 60_000, fetchYahooAuth);
}

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
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
  });
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? `No Yahoo chart data for ${symbol}`);
  return result;
}

/**
 * `meta.previousClose`/`regularMarketOpen`/day-high/day-low are only
 * populated by Yahoo for short ranges — requesting the 1-month range this
 * function actually needs left them undefined, which fell through to
 * `chartPreviousClose` (the close from a month ago, not yesterday) and to
 * the current price standing in for open/high/low. That silently produced
 * a wrong sign on change/% for every US stock (e.g. a stock that fell
 * showing as up double digits) and open==price on every page. The daily OHLC
 * bars in `indicators.quote[0]` are present regardless of range, so this
 * reads today's (last) bar and yesterday's (second-to-last) bar from there
 * instead and only falls back to `meta` if a bar is somehow missing.
 */
export async function fetchUsQuote(symbol: string): Promise<Quote> {
  const result = await fetchYahooChart(symbol, "1m");
  const meta = result.meta;
  const bars = result.indicators.quote[0];
  const closes = bars.close;

  let todayIdx = closes.length - 1;
  while (todayIdx >= 0 && closes[todayIdx] == null) todayIdx--;
  let prevIdx = todayIdx - 1;
  while (prevIdx >= 0 && closes[prevIdx] == null) prevIdx--;

  const prevClose = prevIdx >= 0 ? closes[prevIdx]! : meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
  const change = meta.regularMarketPrice - prevClose;
  const known = findInUniverse(symbol, "US");

  return {
    symbol: meta.symbol,
    market: "US",
    name: meta.longName ?? meta.shortName ?? known?.name ?? symbol,
    price: round2(meta.regularMarketPrice),
    change: round2(change),
    changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
    open: round2(todayIdx >= 0 ? bars.open[todayIdx] ?? meta.regularMarketOpen ?? meta.regularMarketPrice : meta.regularMarketOpen ?? meta.regularMarketPrice),
    high: round2(todayIdx >= 0 ? bars.high[todayIdx] ?? meta.regularMarketDayHigh ?? meta.regularMarketPrice : meta.regularMarketDayHigh ?? meta.regularMarketPrice),
    low: round2(todayIdx >= 0 ? bars.low[todayIdx] ?? meta.regularMarketDayLow ?? meta.regularMarketPrice : meta.regularMarketDayLow ?? meta.regularMarketPrice),
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
 * under concurrent load. Chunked the same way as the TWSE batch fetch so
 * a larger universe doesn't build one oversized query string.
 */
const QUOTE_BATCH_CHUNK_SIZE = 50;

export async function fetchUsQuotesBatch(symbols: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  if (symbols.length === 0) return map;

  const auth = await getYahooAuth();
  const chunks = chunk(symbols, QUOTE_BATCH_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map(async (group) => {
      const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${group
        .map((s) => encodeURIComponent(s))
        .join(",")}${crumbParam}`;
      try {
        const res = await fetchWithTimeout(url, 6000, {
          headers: {
            "User-Agent": YAHOO_UA,
            Accept: "application/json",
            ...(auth ? { Cookie: auth.cookie } : {}),
          },
        });
        const data = (await res.json()) as YahooQuoteResponse;
        return data.quoteResponse?.result ?? [];
      } catch {
        return [];
      }
    })
  );
  for (const r of results.flat()) {
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
  priceToBook?: number;
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
  const auth = await getYahooAuth();
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}${crumbParam}`;
  const res = await fetchWithTimeout(url, 5000, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "application/json",
      ...(auth ? { Cookie: auth.cookie } : {}),
    },
  });
  const data = (await res.json()) as YahooFundamentalsResponse;
  const r = data.quoteResponse?.result?.[0];
  if (!r) return null;
  return {
    peRatio: r.trailingPE && Number.isFinite(r.trailingPE) && r.trailingPE > 0 ? round2(r.trailingPE) : undefined,
    dividendYield: normalizeYieldPercent(r.trailingAnnualDividendYield ?? r.dividendYield),
    marketCap: r.marketCap && Number.isFinite(r.marketCap) && r.marketCap > 0 ? r.marketCap : undefined,
    pbRatio: r.priceToBook && Number.isFinite(r.priceToBook) && r.priceToBook > 0 ? round2(r.priceToBook) : undefined,
  };
}

interface YahooEarningsQuarter {
  date: string; // e.g. "2Q2026" — fiscal label, not always the calendar quarter
  actual?: { raw: number };
  estimate?: { raw: number };
  surprisePct?: string;
  reportedDate?: { fmt: string };
}

interface YahooEarningsModule {
  earningsChart?: {
    quarterly?: YahooEarningsQuarter[];
    earningsDate?: { raw: number }[];
  };
}

interface YahooQuoteSummaryResponse {
  quoteSummary: { result?: [{ earnings?: YahooEarningsModule }] };
}

/**
 * Yahoo's quoteSummary "earnings" module — same crumb+cookie auth as the
 * batch quote/fundamentals fetches above. Gives the last few reported
 * quarters' actual-vs-estimate EPS (with surprise %) and the next expected
 * earnings date, which TWSE's monthly-revenue/quarterly-EPS open data has
 * no equivalent-free US source for otherwise.
 */
export async function fetchUsEarnings(symbol: string): Promise<Earnings | null> {
  const auth = await getYahooAuth();
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=earnings${crumbParam}`;
  const res = await fetchWithTimeout(url, 5000, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "application/json",
      ...(auth ? { Cookie: auth.cookie } : {}),
    },
  });
  const data = (await res.json()) as YahooQuoteSummaryResponse;
  const chart = data.quoteSummary?.result?.[0]?.earnings?.earningsChart;
  if (!chart) return null;

  const quarters = chart.quarterly ?? [];
  const latest = quarters[quarters.length - 1];
  const nextEarningsDate = chart.earningsDate?.[0]?.raw
    ? new Date(chart.earningsDate[0].raw * 1000).toISOString().slice(0, 10)
    : undefined;

  if (!latest?.actual) return nextEarningsDate ? { nextEarningsDate } : null;
  const surprisePercent = latest.surprisePct ? parseFloat(latest.surprisePct) : undefined;
  return {
    quarterlyEps: round2(latest.actual.raw),
    quarterlyEpsPeriod: latest.date,
    epsSurprisePercent: surprisePercent != null && Number.isFinite(surprisePercent) ? round2(surprisePercent) : undefined,
    nextEarningsDate,
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
  const days = RANGE_DAYS[range];
  return days != null ? candles.slice(-days) : candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Intraday (1-minute bars, current session only) — a completely different
 * Yahoo request shape from fetchYahooChart's daily candles above
 * (`interval=1m&range=1d` vs `interval=1d&range=<period>`), so it's its own
 * function rather than a branch of fetchYahooChart/RANGE_PARAM.
 *
 * Confirmed live (2026-09-15) that Yahoo's chart endpoint also serves this
 * for TAIWAN tickers, not just US ones — `2330.TW` (TWSE) and `6811.TWO`
 * (TPEx) both return real, current-session minute bars with no auth needed
 * (unlike v7/finance/quote, this endpoint has never required the
 * crumb/cookie handshake — see getYahooAuth's own comment for why that one
 * does). That's the only reason lib/data/index.ts's getChart() can offer a
 * "today" range for TW stocks at all: TWSE/TPEx's own official endpoints
 * have no free public intraday-history API (mis.twse.com.tw's MIS endpoint,
 * used elsewhere in this codebase for real-time TW quotes, only ever
 * returns the CURRENT snapshot, not a same-day time series) — so this is
 * deliberately routed through Yahoo for TW too, via index.ts appending the
 * right suffix (`.TW` for TWSE, `.TWO` for TPEx) before calling this
 * function, rather than this file assuming a US-only caller.
 */
export async function fetchYahooIntradayCandles(yahooSymbol: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`;
  const res = await fetchWithTimeout(url, 4500, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
  });
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? `No Yahoo intraday chart data for ${yahooSymbol}`);

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    // Yahoo pads pre/post-market minutes with nulls even for a plain "1d"
    // range on symbols without extended-hours data — skip rather than
    // fabricate a bar.
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      // Full ISO instant (not sliced to a date) — this is what makes
      // StockChart.tsx's toChartTime() able to place each point at its
      // actual time of day instead of colliding every bar from today onto
      // one business-day key. Round-trips exactly through
      // `new Date(seconds * 1000).toISOString()` there since these
      // timestamps are already whole-second/whole-minute values.
      time: new Date(timestamps[i] * 1000).toISOString(),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: quote.volume[i] ?? 0,
    });
  }
  if (candles.length === 0) throw new Error(`No Yahoo intraday candles for ${yahooSymbol}`);
  return candles;
}
