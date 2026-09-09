import { cached } from "./cache";
import { mockCandles, mockQuote, mockQuoteFromBase } from "./mock";
import type { Candle, ChartRange, IndexQuote, Market, Quote, SearchItem } from "./types";
import { TW_UNIVERSE, US_UNIVERSE, findInUniverse, UniverseEntry } from "./universe";
import { fetchTwseCandles, fetchTwseQuote } from "./twse";
import { fetchUsCandles, fetchUsQuote } from "./us";

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

export interface SearchFilters {
  market?: Market;
  sector?: string;
  query?: string;
  minChangePercent?: number;
  maxChangePercent?: number;
  sortBy?: "changePercent" | "volume" | "price";
  sortDir?: "asc" | "desc";
}

export async function searchStocks(filters: SearchFilters): Promise<SearchItem[]> {
  let pool: UniverseEntry[] = [...TW_UNIVERSE, ...US_UNIVERSE];
  if (filters.market) pool = pool.filter((e) => e.market === filters.market);
  if (filters.sector) pool = pool.filter((e) => e.sector === filters.sector);
  if (filters.query) {
    const q = filters.query.trim().toLowerCase();
    pool = pool.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }

  let items: SearchItem[] = await Promise.all(
    pool.map(async (entry) => {
      const q = await getQuote(entry.symbol, entry.market);
      return {
        symbol: entry.symbol,
        market: entry.market,
        name: entry.name,
        sector: entry.sector,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        isMock: q.isMock,
      };
    })
  );

  if (filters.minChangePercent !== undefined) {
    items = items.filter((i) => i.changePercent >= filters.minChangePercent!);
  }
  if (filters.maxChangePercent !== undefined) {
    items = items.filter((i) => i.changePercent <= filters.maxChangePercent!);
  }

  const sortBy = filters.sortBy ?? "changePercent";
  const sortDir = filters.sortDir ?? "desc";
  items.sort((a, b) => {
    const diff = a[sortBy] - b[sortBy];
    return sortDir === "desc" ? -diff : diff;
  });

  return items;
}
