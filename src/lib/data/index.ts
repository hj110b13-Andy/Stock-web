import { cached, cachedMap, mapWithConcurrency } from "./cache";
import type { Candle, ChartRange, ChartResponse, Chips, Earnings, Fundamentals, IndexQuote, Market, MaterialAnnouncement, Quote, SearchItem } from "./types";
import { US_UNIVERSE, findInUniverse, findSymbolByName, getTwUniverse, UniverseEntry } from "./universe";
import {
  fetchTwseCandles,
  fetchTwseFundamentalsAll,
  fetchTwseInstitutionalTradingAll,
  fetchTwseMarginTradingAll,
  fetchTwseMaterialAnnouncementsAll,
  fetchTwseMonthlyRevenueAll,
  fetchTwseQuarterlyEpsAll,
  fetchTwseQuote,
  fetchTwseQuotesBatch,
} from "./twse";
import {
  fetchTpexCandles,
  fetchTpexFundamentalsAll,
  fetchTpexInstitutionalTradingAll,
  fetchTpexMarginTradingAll,
  fetchTpexMaterialAnnouncementsAll,
  fetchTpexMonthlyRevenueAll,
  fetchTpexQuarterlyEpsAll,
  fetchTpexQuote,
  fetchTpexQuotesBatch,
} from "./tpex";
import { fetchUsCandles, fetchUsEarnings, fetchUsFundamentals, fetchUsQuote, fetchUsQuotesBatch } from "./us";
import { fetchTaifexNightFutures } from "./taifex";
import type { TaifexFuturesQuote } from "./types";
import { computeSignals, type Signal } from "@/lib/signals";
import { computeVolumeMetrics, getTrailingAverageVolumeMap, maybeRecordDailyVolumeSnapshot } from "./volumeHistory";
import type { VolumeTrend } from "./types";

export * from "./types";
export { sectorsFor, getTwUniverse, findSymbolByName, findAllSymbolsByName, findInUniverse } from "./universe";
export { describeTaifexNightFutures } from "./taifex";

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
 * TW has two exchanges behind one public "TW" market — a given symbol must
 * be routed to the right one before a per-symbol (single-source) fetch can
 * happen at all. `findInUniverse` carries the answer whenever the symbol is
 * already known; for the rare case of a symbol not indexed yet (a very new
 * IPO, or simply a wrong/nonexistent code), TWSE is tried first (unchanged
 * default/common-case latency) and TPEx only as a second attempt — this
 * ambiguous-symbol path is rare enough that the extra latency it can incur
 * is an acceptable tradeoff, and it must never slow down the common case
 * where the exchange is already known.
 */
function resolveTwExchange(symbol: string): "TWSE" | "TPEx" | undefined {
  return findInUniverse(symbol, "TW")?.exchange;
}

async function fetchTwQuote(symbol: string): Promise<Quote> {
  const exchange = resolveTwExchange(symbol);
  if (exchange === "TPEx") return fetchTpexQuote(symbol);
  if (exchange === "TWSE") return fetchTwseQuote(symbol);
  try {
    return await fetchTwseQuote(symbol);
  } catch (err) {
    try {
      return await fetchTpexQuote(symbol);
    } catch {
      throw err;
    }
  }
}

async function fetchTwChart(symbol: string, range: ChartRange): Promise<Candle[]> {
  const exchange = resolveTwExchange(symbol);
  if (exchange === "TPEx") return fetchTpexCandles(symbol, range);
  if (exchange === "TWSE") return fetchTwseCandles(symbol, range);
  try {
    return await fetchTwseCandles(symbol, range);
  } catch (err) {
    try {
      return await fetchTpexCandles(symbol, range);
    } catch {
      throw err;
    }
  }
}

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
      return market === "TW" ? await fetchTwQuote(symbol) : await fetchUsQuote(symbol);
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
      const candles = market === "TW" ? await fetchTwChart(symbol, range) : await fetchUsCandles(symbol, range);
      return { symbol, market, range, candles };
    } catch {
      return null;
    }
  });
}

/**
 * Merges a TWSE whole-market map with TPEx's equivalent for the same
 * category (fundamentals, monthly revenue, quarterly EPS, institutional
 * trading, margin trading, material announcements all follow this exact
 * shape) — no symbol-collision risk (see getTwUniverse's comment: TW codes
 * come from one shared national registry). Each side is wrapped in its own
 * catch so a TPEx endpoint outage never takes down TWSE data for that
 * category, or vice versa — same "degrade per source" pattern as
 * getIndices' per-index try/catch and getTwUniverse's per-exchange fetch.
 */
async function mergeTwMaps<V>(
  fetchTwse: () => Promise<Map<string, V>>,
  fetchTpex: () => Promise<Map<string, V>>
): Promise<Map<string, V>> {
  const [twse, tpex] = await Promise.all([
    fetchTwse().catch(() => new Map<string, V>()),
    fetchTpex().catch(() => new Map<string, V>()),
  ]);
  return new Map([...twse, ...tpex]);
}

// Previously 1 hour ("fundamentals don't move intraday") — shortened to
// match the site-wide "everything should feel current within ~5 minutes"
// standard the user asked for after finding several caches (daily brief,
// action brief, news feed) sitting on much longer refresh windows. The
// underlying data source itself still only updates once a day, so a 5-min
// TTL doesn't create *new* freshness here — it just keeps this in step with
// every other cache on the site rather than being the stale outlier.
const FUNDAMENTALS_TTL_MS = 5 * 60_000;

/**
 * Returns null when unavailable — fabricating a P/E ratio or dividend
 * yield next to a real price would be more misleading than just omitting it.
 */
export async function getFundamentals(symbolInput: string, marketHint?: Market): Promise<Fundamentals | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  try {
    if (market === "TW") {
      const map = await cachedMap("fundamentals:TW:all", FUNDAMENTALS_TTL_MS, () =>
        mergeTwMaps(fetchTwseFundamentalsAll, fetchTpexFundamentalsAll)
      );
      return map.get(symbol) ?? null;
    }
    return await cached(`fundamentals:US:${symbol}`, FUNDAMENTALS_TTL_MS, () => fetchUsFundamentals(symbol));
  } catch {
    return null;
  }
}

const EARNINGS_TTL_MS = 5 * 60_000; // same site-wide 5-min standard as FUNDAMENTALS_TTL_MS above

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
        cachedMap("earnings:TW:revenue", EARNINGS_TTL_MS, () =>
          mergeTwMaps(fetchTwseMonthlyRevenueAll, fetchTpexMonthlyRevenueAll)
        ),
        cachedMap("earnings:TW:eps", EARNINGS_TTL_MS, () =>
          mergeTwMaps(fetchTwseQuarterlyEpsAll, fetchTpexQuarterlyEpsAll)
        ),
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

const CHIPS_TTL_MS = 5 * 60_000; // 全站統一 5 分鐘更新標準，見 FUNDAMENTALS_TTL_MS 說明

/**
 * TW only（籌碼面：三大法人買賣超＋融資融券餘額）— 美股沒有對應的公開資料
 * 源，一律回傳 null，不是抓取失敗。兩份資料都是「整個市場一次回傳」的報表，
 * 各自整包快取一次再依代號查表，不對每檔股票各打一次。
 */
export async function getChips(symbolInput: string, marketHint?: Market): Promise<Chips | null> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  if (market !== "TW") return null;
  try {
    const [institutionalMap, marginMap] = await Promise.all([
      cachedMap("chips:TW:institutional", CHIPS_TTL_MS, () =>
        mergeTwMaps(fetchTwseInstitutionalTradingAll, fetchTpexInstitutionalTradingAll)
      ),
      cachedMap("chips:TW:margin", CHIPS_TTL_MS, () => mergeTwMaps(fetchTwseMarginTradingAll, fetchTpexMarginTradingAll)),
    ]);
    const institutional = institutionalMap.get(symbol);
    const margin = marginMap.get(symbol);
    if (!institutional && !margin) return null;
    return { ...institutional, ...margin };
  } catch {
    return null;
  }
}

const ANNOUNCEMENTS_TTL_MS = 5 * 60_000; // 全站統一 5 分鐘更新標準，見 FUNDAMENTALS_TTL_MS 說明

/** TW only — 最近一個交易日的重大訊息公告；大多數股票當天沒有公告是常態，回傳空陣列而非 null。 */
export async function getMaterialAnnouncements(symbolInput: string, marketHint?: Market): Promise<MaterialAnnouncement[]> {
  const symbol = normalizeSymbol(symbolInput);
  const market = marketHint ?? detectMarket(symbol);
  if (market !== "TW") return [];
  try {
    const map = await cachedMap("announcements:TW:all", ANNOUNCEMENTS_TTL_MS, () =>
      mergeTwMaps(fetchTwseMaterialAnnouncementsAll, fetchTpexMaterialAnnouncementsAll)
    );
    return map.get(symbol) ?? [];
  } catch {
    return [];
  }
}

// "美股四大指數" as this site's Taiwanese audience means it: 道瓊/S&P 500/
// 那斯達克 plus 費城半導體指數（SOX）— the semiconductor-heavy Philadelphia
// index is the conventional 4th "major" one watched alongside the other
// three specifically in Taiwan financial media, given how closely TW's own
// market (TSMC and the broader chip supply chain) tracks it; it is not one
// of the "big 3" in a purely US context, which is why it was missing here.
const INDEX_DEFS: Array<{ symbol: string; name: string; market: Market; misCode?: string }> = [
  { symbol: "TAIEX", name: "台股加權指數", market: "TW", misCode: "t00" },
  { symbol: "^DJI", name: "道瓊工業指數", market: "US" },
  { symbol: "^GSPC", name: "S&P 500", market: "US" },
  { symbol: "^IXIC", name: "那斯達克指數", market: "US" },
  { symbol: "^SOX", name: "費城半導體指數", market: "US" },
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
 * 台指期（TX，大台指）夜盤近月合約報價——見 lib/data/taifex.ts 開頭的完整資料源
 * 研究說明。跟 getIndices() 分開一個函式（而不是塞進 INDEX_DEFS），是因為這個
 * 資料需要額外的 status/asOf 欄位才能誠實呈現「交易中」跟「已收盤」的差異，
 * IndexQuote 型別沒有這兩個欄位。快取沿用跟其他即時報價一樣的 QUOTE_TTL_MS，
 * 抓不到（含近月合約還沒開出成交價）一律回傳 null，不用參考價頂替。
 */
export async function getTaifexNightFutures(): Promise<TaifexFuturesQuote | null> {
  return cached<TaifexFuturesQuote | null>("taifex:tx-night", QUOTE_TTL_MS, async () => {
    try {
      return await fetchTaifexNightFutures();
    } catch {
      return null;
    }
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

  if (market === "TW") {
    // Two separate exchanges behind one "TW" batch: each gets its own
    // request and its own try/catch so a TWSE or TPEx outage only costs
    // that exchange's symbols, not the whole TW screen. TPEx's own batch
    // fetch is always ONE whole-market request regardless of how many TPEx
    // symbols are in `pool` (see tpex.ts's fetchTpexQuoteSnapshot) — unlike
    // TWSE's, it isn't chunked/concurrency-sensitive at all.
    const twsePool = pool.filter((e) => e.exchange !== "TPEx").map((e) => e.symbol);
    const tpexPool = pool.filter((e) => e.exchange === "TPEx").map((e) => e.symbol);
    const [twseBatch, tpexBatch] = await Promise.all([
      fetchTwseQuotesBatch(twsePool).catch(() => new Map<string, Quote>()),
      fetchTpexQuotesBatch(tpexPool).catch(() => new Map<string, Quote>()),
    ]);
    for (const [symbol, quote] of twseBatch) map.set(symbol, quote);
    for (const [symbol, quote] of tpexBatch) map.set(symbol, quote);
  } else {
    try {
      const batch = await fetchUsQuotesBatch(pool.map((e) => e.symbol));
      for (const [symbol, quote] of batch) map.set(symbol, quote);
    } catch {
      // batch endpoint failed outright; every symbol falls through to the
      // per-symbol attempt below instead
    }
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
          const q =
            market === "TW"
              ? entry.exchange === "TPEx"
                ? await fetchTpexQuote(entry.symbol)
                : await fetchTwseQuote(entry.symbol)
              : await fetchUsQuote(entry.symbol);
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

  // Fire-and-forget, piggybacked on this same batch fetch rather than a
  // separate schedule or per-symbol call — see volumeHistory.ts for why this
  // is the "compute the whole-market volume trend cheaply" design: it's a
  // small conditional Redis read+write, not an extra upstream request, and
  // it internally no-ops except once per real trading day. Never awaited so
  // it can't add latency to (or, via its own try/catch, ever fail) this
  // already-expensive batch quote fetch.
  void maybeRecordDailyVolumeSnapshot(market, map);

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
  minVolume?: number;
  maxVolume?: number;
  /**
   * 多選，跟 `sectors` 同一套「不衝突條件可以複選」的設計：不傳或空陣列＝不篩選；
   * 傳了就只保留 volumeTrend 落在這個集合裡的股票。見 types.ts 的 VolumeTrend /
   * SearchItem.volumeTrend 說明——這是價量關係推論，不是真實買賣單量能分類。
   */
  volumeTrends?: VolumeTrend[];
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
  const [quoteMaps, avgVolumeMaps] = await Promise.all([
    Promise.all(marketsNeeded.map((m) => getMarketQuoteMap(m))),
    // Cheap (peekCached, read-only — see volumeHistory.ts): never triggers a
    // fresh computation, just reads whatever the batch-quote piggyback has
    // already accumulated. A market with no history yet just yields an
    // empty map, and every item's volumeTrend falls back to "neutral".
    Promise.all(marketsNeeded.map((m) => getTrailingAverageVolumeMap(m))),
  ]);
  const quoteBySymbol = new Map<string, Quote>();
  const avgVolumeBySymbol = new Map<string, number>();
  marketsNeeded.forEach((m, i) => {
    for (const [symbol, quote] of quoteMaps[i]) quoteBySymbol.set(`${m}:${symbol}`, quote);
    for (const [symbol, avg] of avgVolumeMaps[i]) avgVolumeBySymbol.set(`${m}:${symbol}`, avg);
  });

  let items: SearchItem[] = pool
    .map((entry): SearchItem | null => {
      const q = quoteBySymbol.get(`${entry.market}:${entry.symbol}`);
      if (!q) return null;
      const avgVolume = avgVolumeBySymbol.get(`${entry.market}:${entry.symbol}`);
      return {
        symbol: entry.symbol,
        market: entry.market,
        name: entry.name,
        sector: entry.sector,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        ...computeVolumeMetrics(q.changePercent, q.volume, avgVolume),
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
  if (filters.minVolume !== undefined) {
    items = items.filter((i) => i.volume >= filters.minVolume!);
  }
  if (filters.maxVolume !== undefined) {
    items = items.filter((i) => i.volume <= filters.maxVolume!);
  }
  if (filters.volumeTrends && filters.volumeTrends.length > 0) {
    const wantedTrends = new Set(filters.volumeTrends);
    items = items.filter((i) => wantedTrends.has(i.volumeTrend));
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

// Was doubled to 10 minutes at one point to reduce how often this
// genuinely expensive screen (a chart fetch per candidate stock) has to
// recompute — brought back down to the site-wide 5-min standard (see
// FUNDAMENTALS_TTL_MS) since real visitors were never the ones paying that
// cost anyway: warm-cache's cron (.github/workflows/warm-cache.yml) already
// recomputes this in the background on its own ~5-min schedule regardless
// of whether anyone is actively visiting, so halving the TTL mainly means
// the cron's own background work runs twice as often, not that users wait
// longer for anything.
const MOMENTUM_TTL_MS = 5 * 60_000;
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
    const avgVolumeMap = await getTrailingAverageVolumeMap(market);

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
          ...computeVolumeMetrics(quote.changePercent, quote.volume, avgVolumeMap.get(entry.symbol)),
          signals,
        };
      }
    );

    return results
      .filter((r): r is MomentumItem => r !== null)
      .sort((a, b) => b.signals.length - a.signals.length);
  });
}
