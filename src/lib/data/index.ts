import { cached } from "./cache";
import { mockCandles, mockQuote, mockQuoteFromBase } from "./mock";
import type { Candle, ChartRange, Fundamentals, IndexQuote, Market, Quote, SearchItem } from "./types";
import { TW_UNIVERSE, US_UNIVERSE, findInUniverse, UniverseEntry } from "./universe";
import { fetchTwseCandles, fetchTwseFundamentalsAll, fetchTwseQuote, fetchTwseQuotesBatch } from "./twse";
import { fetchUsCandles, fetchUsFundamentals, fetchUsQuote, fetchUsQuotesBatch } from "./us";
import { computeSignals, type Signal } from "@/lib/signals";

export * from "./types";
export { sectorsFor } from "./universe";

export function detectMarket(symbolInput: string): Market {
  const known = findInUniverse(symbolInput);
  if (known) return known.market;
  return /^\d{3,6}$/.test(symbolInput.trim()) ? "TW" : "US";
}

export function normalizeSymbol(symbolInput: string): string {
  return symbolInput.trim().toUpperCase().replace(/\.(TW|TWO|US)$/i, "");
}

const QUOTE_TTL_MS = 20_000;
const CHART_TTL_MS = 5 * 60_000;

export async function getQuote(symbolInput: string, marketHint?: Market): Promise<Quote> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  return cached(`quote:${market}:${symbol}`, QUOTE_TTL_MS, async () => {
    try {
      return market === "TW" ? await fetchTwseQuote(symbol) : await fetchUsQuote(symbol);
    } catch {
      return mockQuote(symbol, market);
    }
  });
}

export async function getChart(symbolInput: string, range: ChartRange, marketHint?: Market): Promise<{
  symbol: string;
  market: Market;
  range: ChartRange;
  candles: Candle[];
  isMock: boolean;
}> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  return cached(`chart:${market}:${symbol}:${range}`, CHART_TTL_MS, async () => {
    try {
      const candles = market === "TW" ? await fetchTwseCandles(symbol, range) : await fetchUsCandles(symbol, range);
      return { symbol, market, range, candles, isMock: false };
    } catch {
      return { symbol, market, range, candles: mockCandles(symbol, range, market), isMock: true };
    }
  });
}

const FUNDAMENTALS_TTL_MS = 60 * 60_000; // fundamentals don't move intraday; refresh hourly

/**
 * Returns null (not a mock value) when unavailable — fabricating a P/E
 * ratio or dividend yield next to a real price is more misleading than
 * just omitting it, unlike price data which is clearly demo-labeled.
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

const INDEX_DEFS: Array<{ symbol: string; name: string; market: Market; misCode?: string; basePrice: number }> = [
  { symbol: "TAIEX", name: "台股加權指數", market: "TW", misCode: "t00", basePrice: 22800 },
  { symbol: "^DJI", name: "道瓊工業指數", market: "US", basePrice: 42500 },
  { symbol: "^GSPC", name: "S&P 500", market: "US", basePrice: 5850 },
  { symbol: "^IXIC", name: "那斯達克指數", market: "US", basePrice: 18500 },
];

export async function getIndices(): Promise<IndexQuote[]> {
  return cached("indices", QUOTE_TTL_MS, async () => {
    return Promise.all(
      INDEX_DEFS.map(async (def) => {
        try {
          if (def.market === "TW" && def.misCode) {
            const q = await fetchTwseQuote(def.misCode);
            return toIndexQuote(def, q.price, q.change, q.changePercent, false);
          }
          const q = await fetchUsQuote(def.symbol);
          return toIndexQuote(def, q.price, q.change, q.changePercent, false);
        } catch {
          const mock = mockQuoteFromBase(def.symbol, def.name, def.market, def.market === "TW" ? "TWD" : "USD", def.basePrice);
          return toIndexQuote(def, mock.price, mock.change, mock.changePercent, true);
        }
      })
    );
  });
}

function toIndexQuote(
  def: { symbol: string; name: string; market: Market },
  price: number,
  change: number,
  changePercent: number,
  isMock: boolean
): IndexQuote {
  return { symbol: def.symbol, name: def.name, market: def.market, price, change, changePercent, isMock };
}

/**
 * All of a market's universe quotes in one batched network call (plus a
 * per-symbol fallback for whatever the batch didn't cover), cached and
 * shared across every caller — search page, both market tabs, homepage
 * movers, highlights boards, and the daily brief all hit the same cached
 * map instead of each re-fetching (or worse, each firing 20+ of their own
 * concurrent per-symbol requests, which is what made list pages show
 * mostly-mock data even when single-stock pages were fetching real quotes
 * fine: TWSE/Yahoo's single-symbol endpoints aren't meant for that many
 * concurrent hits from one caller and tend to time out or get throttled).
 */
async function fetchMarketQuoteMap(market: Market): Promise<Map<string, Quote>> {
  const pool = market === "TW" ? TW_UNIVERSE : US_UNIVERSE;
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
      missing.map(async (entry): Promise<[string, Quote]> => {
        try {
          const q = market === "TW" ? await fetchTwseQuote(entry.symbol) : await fetchUsQuote(entry.symbol);
          return [entry.symbol, q];
        } catch {
          return [entry.symbol, mockQuote(entry.symbol, entry.market)];
        }
      })
    );
    for (const [symbol, quote] of singles) map.set(symbol, quote);
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

export async function searchStocks(filters: SearchFilters): Promise<SearchItem[]> {
  let pool: UniverseEntry[] = [...TW_UNIVERSE, ...US_UNIVERSE];
  if (filters.market) pool = pool.filter((e) => e.market === filters.market);
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

  let items: SearchItem[] = pool.map((entry) => {
    const q = quoteBySymbol.get(`${entry.market}:${entry.symbol}`);
    return {
      symbol: entry.symbol,
      market: entry.market,
      name: entry.name,
      sector: entry.sector,
      price: q?.price ?? 0,
      changePercent: q?.changePercent ?? 0,
      volume: q?.volume ?? 0,
      isMock: q?.isMock ?? true,
    };
  });

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
    const pool = market === "TW" ? TW_UNIVERSE : US_UNIVERSE;
    const quoteMap = await getMarketQuoteMap(market);

    const results = await Promise.all(
      pool.map(async (entry): Promise<MomentumItem | null> => {
        const quote = quoteMap.get(entry.symbol);
        if (!quote) return null;
        try {
          const chart = await getChart(entry.symbol, "3m", entry.market);
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
            isMock: quote.isMock || chart.isMock,
            signals,
          };
        } catch {
          return null;
        }
      })
    );

    return results
      .filter((r): r is MomentumItem => r !== null)
      .sort((a, b) => b.signals.length - a.signals.length);
  });
}
