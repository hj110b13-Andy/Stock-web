import { cached } from "./cache";
import type { ChartRange, ChartResponse, Fundamentals, IndexQuote, Market, Quote, SearchItem } from "./types";
import { US_UNIVERSE, findInUniverse, getTwUniverse, UniverseEntry } from "./universe";
import { fetchTwseCandles, fetchTwseFundamentalsAll, fetchTwseQuote, fetchTwseQuotesBatch } from "./twse";
import { fetchUsCandles, fetchUsFundamentals, fetchUsQuote, fetchUsQuotesBatch } from "./us";
import { computeSignals, type Signal } from "@/lib/signals";

export * from "./types";
export { sectorsFor, getTwUniverse } from "./universe";

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
  return decoded.trim().toUpperCase().replace(/\.(TW|TWO|US)$/i, "");
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
      const map = await cached("fundamentals:TW:all", FUNDAMENTALS_TTL_MS, fetchTwseFundamentalsAll);
      return map.get(symbol) ?? null;
    }
    return await cached(`fundamentals:US:${symbol}`, FUNDAMENTALS_TTL_MS, () => fetchUsFundamentals(symbol));
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
 */
export async function getIndices(): Promise<IndexQuote[]> {
  return cached("indices", QUOTE_TTL_MS, async () => {
    const results = await Promise.all(
      INDEX_DEFS.map(async (def): Promise<IndexQuote | null> => {
        try {
          const q =
            def.market === "TW" && def.misCode ? await fetchTwseQuote(def.misCode) : await fetchUsQuote(def.symbol);
          return { symbol: def.symbol, name: def.name, market: def.market, price: q.price, change: q.change, changePercent: q.changePercent };
        } catch {
          return null;
        }
      })
    );
    return results.filter((r): r is IndexQuote => r !== null);
  });
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

  const missing = pool.filter((e) => !map.has(e.symbol));
  if (missing.length > 0) {
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

async function getMarketQuoteMap(market: Market): Promise<Map<string, Quote>> {
  return cached(`market-quotes:${market}`, QUOTE_TTL_MS, () => fetchMarketQuoteMap(market));
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

const MOMENTUM_TTL_MS = 5 * 60_000;
// Computing a signal requires a chart fetch per candidate stock, so the
// candidate pool is capped to the biggest movers by |change%| before doing
// that work — with a several-hundred-stock TW universe, running the chart
// fetch for every single one would mean hundreds of concurrent requests to
// TWSE for a board that only ever displays the top ~10 results anyway.
const MOMENTUM_CANDIDATE_LIMIT = 150;

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

    const results = await Promise.all(
      candidates.map(async (entry): Promise<MomentumItem | null> => {
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
      })
    );

    return results
      .filter((r): r is MomentumItem => r !== null)
      .sort((a, b) => b.signals.length - a.signals.length);
  });
}
