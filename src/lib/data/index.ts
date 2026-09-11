import { cached, cachedMap, mapWithConcurrency } from "./cache";
import type { ChartRange, ChartResponse, Earnings, Fundamentals, IndexQuote, Market, Quote, SearchItem } from "./types";
import { US_UNIVERSE, findInUniverse, findSymbolByName, getTwUniverse, UniverseEntry } from "./universe";
import {
  fetchTwseCandles,
  fetchTwseFundamentalsAll,
  fetchTwseMonthlyRevenueAll,
  fetchTwseQuarterlyEpsAll,
  fetchTwseQuote,
  fetchTwseQuotesBatch,
} from "./twse";
import { fetchUsCandles, fetchUsEarnings, fetchUsFundamentals, fetchUsQuote, fetchUsQuotesBatch } from "./us";
import { computeSignals, type Signal } from "@/lib/signals";

export * from "./types";
export { sectorsFor, getTwUniverse, findSymbolByName } from "./universe";

async function universeFor(market: Market): Promise<UniverseEntry[]> {
  return market === "TW" ? getTwUniverse() : US_UNIVERSE;
}

export function detectMarket(symbolInput: string): Market {
  const known = findInUniverse(symbolInput);
  if (known) return known.market;
  return /^\d{3,6}$/.test(symbolInput.trim()) ? "TW" : "US";
}

/**
 * Route params (e.g. the [symbol] segment in /stock/[symbol]) can arrive
 * still percent-encoded in some Next.js render paths — decode defensively
 * so a Chinese company name typed into the header search box (which just
 * navigates straight to /stock/<input>) doesn't show up as raw "%E5%8F..."
 * on the page. Safe to call on an already-decoded plain symbol like
 * "2330"/"AAPL" too: decodeURIComponent is a no-op without a "%" in it.
 */
export function normalizeSymbol(symbolInput: string): string {
  let decoded = symbolInput;
  try {
    decoded = decodeURIComponent(symbolInput);
  } catch {
    // malformed percent-encoding; fall back to the raw input
  }
  const trimmed = decoded.trim();
  // The header search box and "/stock/<input>" both accept a company name
  // typed in directly (e.g. "台積電"), not just a ticker — resolve that to
  // its actual code before the market-agnostic uppercase/suffix cleanup
  // below, which would otherwise pass the name straight through to a data
  // source that only understands codes/tickers and get "資料暫缺" back for
  // a perfectly findable stock.
  const byName = findSymbolByName(trimmed);
  if (byName) return byName.symbol;
  return trimmed.toUpperCase().replace(/\.(TW|TWO|US)$/i, "");
}

const QUOTE_TTL_MS = 20_000;
const CHART_TTL_MS = 5 * 60_000;

/**
 * Returns null (never a fabricated value) when the live source can't be
 * reached — stock data must be accurate, so an unavailable quote is shown
 * as unavailable rather than filled in with a guess.
 */
export async function getQuote(symbolInput: string, marketHint?: Market): Promise<Quote | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  return cached(`quote:${market}:${symbol}`, QUOTE_TTL_MS, async () => {
    try {
      return market === "TW" ? await fetchTwseQuote(symbol) : await fetchUsQuote(symbol);
    } catch {
      return null;
    }
  });
}

/** Returns null when the live source can't be reached; never fabricated candles. */
export async function getChart(
  symbolInput: string,
  range: ChartRange,
  marketHint?: Market
): Promise<ChartResponse | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  return cached(`chart:${market}:${symbol}:${range}`, CHART_TTL_MS, async () => {
    try {
      const candles = market === "TW" ? await fetchTwseCandles(symbol, range) : await fetchUsCandles(symbol, range);
      return { symbol, market, range, candles };
    } catch {
      return null;
    }
  });
}

const FUNDAMENTALS_TTL_MS = 60 * 60_000; // fundamentals don't move intraday; refresh hourly

/**
 * Returns null when unavailable — fabricating a P/E ratio or dividend
 * yield next to a real price would be more misleading than just omitting it.
 */
export async function getFundamentals(symbolInput: string, marketHint?: Market): Promise<Fundamentals | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  try {
    if (market === "TW") {
      const map = await cachedMap("fundamentals:TW:all", FUNDAMENTALS_TTL_MS, fetchTwseFundamentalsAll);
      return map.get(symbol) ?? null;
    }
    return await cached(`fundamentals:US:${symbol}`, FUNDAMENTALS_TTL_MS, () => fetchUsFundamentals(symbol));
  } catch {
    return null;
  }
}

const EARNINGS_TTL_MS = 60 * 60_000; // same cadence as fundamentals — this doesn't move intraday either

/**
 * Returns null when unavailable — a bank/insurer isn't in TWSE's general
 * quarterly-EPS dataset (see fetchTwseQuarterlyEpsAll), and that's shown as
 * "no data" rather than silently misreporting a peer company's number.
 */
export async function getEarnings(symbolInput: string, marketHint?: Market): Promise<Earnings | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  try {
    if (market === "TW") {
      const [revenueMap, epsMap] = await Promise.all([
        cachedMap("earnings:TW:revenue", EARNINGS_TTL_MS, fetchTwseMonthlyRevenueAll),
        cachedMap("earnings:TW:eps", EARNINGS_TTL_MS, fetchTwseQuarterlyEpsAll),
      ]);
      const revenue = revenueMap.get(symbol);
      const eps = epsMap.get(symbol);
      if (!revenue && !eps) return null;
      return { ...revenue, ...eps };
    }
    return await cached(`earnings:US:${symbol}`, EARNINGS_TTL_MS, () => fetchUsEarnings(symbol));
  } catch {
    return null;
  }
}

const INDEX_DEFS: Array<{ symbol: string; name: string; market: Market; misCode?: string }> = [
  { symbol: "TAIEX", name: "台股加權指數", market: "TW", misCode: "t00" },
  { symbol: "^DJI", name: "道瓊工業指數", market: "US" },
  { symbol: "^GSPC", name: "S&P 500", market: "US" },
  { symbol: "^IXIC", name: "那斯達克指數", market: "US" },
];

/**
 * Only includes indices that were actually fetched successfully — an
 * index that failed to load is simply omitted rather than shown with a
 * substitute value.
 *
 * Each index is cached under its own key rather than one "indices" key for
 * the whole array: with a single shared key, one bad moment where all four
 * upstream calls happened to fail at once cached an *empty* array for the
 * full TTL, blanking the homepage's index cards for 20s even if upstream
 * had already recovered a moment later. Per-index keys mean a transient
 * failure only withholds that one index for its own TTL, and doesn't touch
 * whatever the others most recently succeeded with.
 */
export async function getIndices(): Promise<IndexQuote[]> {
  const results = await Promise.all(
    INDEX_DEFS.map((def) =>
      cached<IndexQuote | null>(`index:${def.symbol}`, QUOTE_TTL_MS, async () => {
        try {
          const q =
            def.market === "TW" && def.misCode ? await fetchTwseQuote(def.misCode) : await fetchUsQuote(def.symbol);
          return { symbol: def.symbol, name: def.name, market: def.market, price: q.price, change: q.change, changePercent: q.changePercent };
        } catch {
          return null;
        }
      })
    )
  );
  return results.filter((r): r is IndexQuote => r !== null);
}

/**
 * All of a market's universe quotes in one batched network call (plus a
 * per-symbol fallback for whatever the batch didn't cover), cached and
 * shared across every caller — search page, both market tabs, homepage
 * movers, highlights boards, and the daily brief all hit the same cached
 * map instead of each re-fetching (or worse, each firing 20+ of their own
 * concurrent per-symbol requests, which is what made list pages show
 * mostly-stale/failed data even when single-stock pages were fetching real
 * quotes fine: TWSE/Yahoo's single-symbol endpoints aren't meant for that
 * many concurrent hits from one caller and tend to time out or get
 * throttled). Symbols that fail both the batch and the per-symbol retry
 * are simply absent from the map — never filled in with a guess.
 */
async function fetchMarketQuoteMap(market: Market): Promise<Map<string, Quote>> {
  const pool = await universeFor(market);
  const map = new Map<string, Quote>();

  try {
    const batch =
      market === "TW"
        ? await fetchTwseQuotesBatch(pool.map((e) => e.symbol))
        : await fetchUsQuotesBatch(pool.map((e) => e.symbol));
    for (const [symbol, quote] of batch) map.set(symbol, quote);
  } catch {
    // batch endpoint failed outright; every symbol falls through to the
    // per-symbol attempt below instead
  }

  // Only bother retrying individually when a small number slipped through
  // the batch — if the batch failed wholesale or missed a lot of symbols,
  // firing dozens+ of concurrent single-symbol requests on top of it risks
  // getting the whole site rate-limited by TWSE/Yahoo (breaking unrelated
  // single-stock lookups too), for a screen that only shows a handful of
  // rows anyway. Those symbols are just omitted, same as any other
  // unreachable quote.
  const MAX_SINGLE_RETRIES = 15;
  const missing = pool.filter((e) => !map.has(e.symbol));
  if (missing.length > 0 && missing.length <= MAX_SINGLE_RETRIES) {
    const singles = await Promise.all(
      missing.map(async (entry): Promise<[string, Quote] | null> => {
        try {
          const q = market === "TW" ? await fetchTwseQuote(entry.symbol) : await fetchUsQuote(entry.symbol);
          return [entry.symbol, q];
        } catch {
          return null;
        }
      })
    );
    for (const s of singles) {
      if (s) map.set(s[0], s[1]);
    }
  }

  return map;
}

// Deliberately much longer than QUOTE_TTL_MS (used for a single symbol's
// "live" quote while actively watching its page). This is the whole-universe
// batch fetch behind search/highlights/homepage rankings — by far the most
// expensive upstream call in the app — and a personal browsing tool doesn't
// need second-by-second freshness on a ranking list the way a single quote
// being actively watched does. At 20s, any real visit more than 20s after
// the last one (i.e. essentially every normal visit, since people don't
// click faster than that) missed the cache and paid the full TWSE/Yahoo
// batch-fetch cost — which is what made every highlights/search visit feel
// slow regardless of how fast the code computing on top of it was.
const MARKET_MAP_TTL_MS = 2 * 60_000;

// cachedMap, not cached: this value is a Map, and the Redis backend stores
// JSON — a Map would come back from a shared-cache hit as an empty object.
async function getMarketQuoteMap(market: Market): Promise<Map<string, Quote>> {
  return cachedMap(`market-quotes:${market}`, MARKET_MAP_TTL_MS, () => fetchMarketQuoteMap(market));
}

export interface SearchFilters {
  market?: Market;
  /** @deprecated use `sectors` (supports multi-select) */
  sector?: string;
  sectors?: string[];
  query?: string;
  minChangePercent?: number;
  maxChangePercent?: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "changePercent" | "volume" | "price";
  sortDir?: "asc" | "desc";
}

/** Stocks with no live quote available are excluded, never shown with a placeholder price. */
export async function searchStocks(filters: SearchFilters): Promise<SearchItem[]> {
  let pool: UniverseEntry[] = filters.market
    ? await universeFor(filters.market)
    : [...(await getTwUniverse()), ...US_UNIVERSE];
  if (filters.sector) pool = pool.filter((e) => e.sector === filters.sector);
  if (filters.sectors && filters.sectors.length > 0) {
    const wanted = new Set(filters.sectors);
    pool = pool.filter((e) => wanted.has(e.sector));
  }
  if (filters.query) {
    const q = filters.query.trim().toLowerCase();
    pool = pool.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }

  const marketsNeeded = [...new Set(pool.map((e) => e.market))];
  const quoteMaps = await Promise.all(marketsNeeded.map((m) => getMarketQuoteMap(m)));
  const quoteBySymbol = new Map<string, Quote>();
  marketsNeeded.forEach((m, i) => {
    for (const [symbol, quote] of quoteMaps[i]) quoteBySymbol.set(`${m}:${symbol}`, quote);
  });

  let items: SearchItem[] = pool
    .map((entry): SearchItem | null => {
      const q = quoteBySymbol.get(`${entry.market}:${entry.symbol}`);
      if (!q) return null;
      return {
        symbol: entry.symbol,
        market: entry.market,
        name: entry.name,
        sector: entry.sector,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
      };
    })
    .filter((i): i is SearchItem => i !== null);

  if (filters.minChangePercent !== undefined) {
    items = items.filter((i) => i.changePercent >= filters.minChangePercent!);
  }
  if (filters.maxChangePercent !== undefined) {
    items = items.filter((i) => i.changePercent <= filters.maxChangePercent!);
  }
  if (filters.minPrice !== undefined) {
    items = items.filter((i) => i.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    items = items.filter((i) => i.price <= filters.maxPrice!);
  }

  const sortBy = filters.sortBy ?? "changePercent";
  const sortDir = filters.sortDir ?? "desc";
  items.sort((a, b) => {
    const diff = a[sortBy] - b[sortBy];
    return sortDir === "desc" ? -diff : diff;
  });

  return items;
}

export interface MomentumItem extends SearchItem {
  signals: Signal[];
}

// Doubled from 5 minutes: the per-candidate chart fetch below is bound by
// round-trip latency to TWSE/Yahoo from Vercel's servers, which stays a
// multi-second cost no matter how much concurrency or candidate-trimming is
// applied on top of it (see the two constants below — trimming candidates
// 25→15 only shaved ~18% off a local benchmark, confirming the wait is
// mostly network RTT, not local compute). A longer cache window doesn't
// make any single computation faster, but it does mean far fewer visits
// actually pay that cost — for a low-traffic personal site, technical
// signals being up to 10 minutes stale is an easy trade for that.
const MOMENTUM_TTL_MS = 10 * 60_000;
// Computing a signal requires a chart fetch per candidate stock, so the
// candidate pool is capped to the biggest movers by |change%| before doing
// that work — a board that only ever displays the top ~10 results doesn't
// need to chart-fetch the entire universe. Trimmed from 25: confirmed via
// local benchmark that this pool size barely moves the needle on a cold
// computation (see MOMENTUM_TTL_MS comment above) since TWSE round-trip
// latency dominates either way, so there was no reason to charter the
// larger pool.
const MOMENTUM_CANDIDATE_LIMIT = 15;
// How many candidates are charted at once. A TW chart fetch is itself
// several requests (one per calendar month), so this is the real knob on
// how hard this screen hits the upstreams. Kept above MOMENTUM_CANDIDATE_LIMIT
// so every candidate still runs in one fully-parallel batch (mapWithConcurrency
// clamps to the smaller of the two anyway).
const MOMENTUM_CHART_CONCURRENCY = 25;

/**
 * Stocks where 2+ objective technical signals (see lib/signals.ts) are
 * true at once — e.g. a volume spike happening alongside a break above
 * the 20-day MA. This is a screen over PAST/CURRENT data only; it is
 * deliberately not framed as "about to rise" or any other forward-looking
 * claim, which would cross into regulated investment-advice territory and
 * isn't something technical data can honestly support anyway.
 */
export async function getMultiSignalStocks(market: Market, minSignals = 2): Promise<MomentumItem[]> {
  return cached(`momentum:${market}:${minSignals}`, MOMENTUM_TTL_MS, async () => {
    const pool = await universeFor(market);
    const quoteMap = await getMarketQuoteMap(market);

    const candidates = pool
      .filter((entry) => quoteMap.has(entry.symbol))
      .sort((a, b) => Math.abs(quoteMap.get(b.symbol)!.changePercent) - Math.abs(quoteMap.get(a.symbol)!.changePercent))
      .slice(0, MOMENTUM_CANDIDATE_LIMIT);

    // Bounded, not Promise.all: each getChart() on a TW symbol fans out into
    // one request per calendar month, so charting all 25 candidates at once
    // meant ~100 simultaneous requests to TWSE for this single screen.
    const results = await mapWithConcurrency(
      candidates,
      MOMENTUM_CHART_CONCURRENCY,
      async (entry): Promise<MomentumItem | null> => {
        const quote = quoteMap.get(entry.symbol)!;
        const chart = await getChart(entry.symbol, "3m", entry.market);
        if (!chart) return null;
        const signals = computeSignals(chart.candles, quote.price, "3m");
        if (signals.length < minSignals) return null;
        return {
          symbol: quote.symbol,
          market: quote.market,
          name: quote.name,
          sector: entry.sector,
          price: quote.price,
          changePercent: quote.changePercent,
          volume: quote.volume,
          signals,
        };
      }
    );

    return results
      .filter((r): r is MomentumItem => r !== null)
      .sort((a, b) => b.signals.length - a.signals.length);
  });
}
