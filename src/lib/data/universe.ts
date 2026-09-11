import { cached } from "./cache";
import type { Market } from "./types";

export interface UniverseEntry {
  symbol: string;
  market: Market;
  name: string;
  sector: string;
  currency: string;
}

// Small hand-curated seed list. Used as the TW universe until the full
// official listing (see getTwUniverse below) has been fetched at least
// once, and as a safety net if that fetch ever fails outright — search,
// rankings, and name lookups keep working with a smaller-but-real set of
// stocks instead of breaking or falling back to made-up data.
const TW_UNIVERSE_SEED: UniverseEntry[] = [
  { symbol: "2330", market: "TW", name: "台積電", sector: "半導體", currency: "TWD" },
  { symbol: "2317", market: "TW", name: "鴻海", sector: "電子零組件", currency: "TWD" },
  { symbol: "2454", market: "TW", name: "聯發科", sector: "半導體", currency: "TWD" },
  { symbol: "2308", market: "TW", name: "台達電", sector: "電子零組件", currency: "TWD" },
  { symbol: "2382", market: "TW", name: "廣達", sector: "電腦及週邊設備", currency: "TWD" },
  { symbol: "2412", market: "TW", name: "中華電", sector: "電信服務", currency: "TWD" },
  { symbol: "2881", market: "TW", name: "富邦金", sector: "金融保險", currency: "TWD" },
  { symbol: "2882", market: "TW", name: "國泰金", sector: "金融保險", currency: "TWD" },
  { symbol: "2886", market: "TW", name: "兆豐金", sector: "金融保險", currency: "TWD" },
  { symbol: "2891", market: "TW", name: "中信金", sector: "金融保險", currency: "TWD" },
  { symbol: "1301", market: "TW", name: "台塑", sector: "塑膠工業", currency: "TWD" },
  { symbol: "1303", market: "TW", name: "南亞", sector: "塑膠工業", currency: "TWD" },
  { symbol: "2002", market: "TW", name: "中鋼", sector: "鋼鐵工業", currency: "TWD" },
  { symbol: "2603", market: "TW", name: "長榮", sector: "航運業", currency: "TWD" },
  { symbol: "2609", market: "TW", name: "陽明", sector: "航運業", currency: "TWD" },
  { symbol: "3008", market: "TW", name: "大立光", sector: "光學元件", currency: "TWD" },
  { symbol: "3711", market: "TW", name: "日月光投控", sector: "半導體", currency: "TWD" },
  { symbol: "2379", market: "TW", name: "瑞昱", sector: "半導體", currency: "TWD" },
  { symbol: "2357", market: "TW", name: "華碩", sector: "電腦及週邊設備", currency: "TWD" },
  { symbol: "2395", market: "TW", name: "研華", sector: "電腦及週邊設備", currency: "TWD" },
  { symbol: "1216", market: "TW", name: "統一", sector: "食品工業", currency: "TWD" },
  { symbol: "2801", market: "TW", name: "彰銀", sector: "金融保險", currency: "TWD" },
  { symbol: "5880", market: "TW", name: "合庫金", sector: "金融保險", currency: "TWD" },
  { symbol: "3034", market: "TW", name: "聯詠", sector: "半導體", currency: "TWD" },
  { symbol: "2303", market: "TW", name: "聯電", sector: "半導體", currency: "TWD" },
  { symbol: "2884", market: "TW", name: "玉山金", sector: "金融保險", currency: "TWD" },
  { symbol: "2885", market: "TW", name: "元大金", sector: "金融保險", currency: "TWD" },
  { symbol: "2892", market: "TW", name: "第一金", sector: "金融保險", currency: "TWD" },
  { symbol: "2880", market: "TW", name: "華南金", sector: "金融保險", currency: "TWD" },
  { symbol: "2887", market: "TW", name: "台新金", sector: "金融保險", currency: "TWD" },
  { symbol: "2890", market: "TW", name: "永豐金", sector: "金融保險", currency: "TWD" },
  { symbol: "3045", market: "TW", name: "台灣大", sector: "電信服務", currency: "TWD" },
  { symbol: "4904", market: "TW", name: "遠傳", sector: "電信服務", currency: "TWD" },
  { symbol: "2912", market: "TW", name: "統一超", sector: "貿易百貨", currency: "TWD" },
  { symbol: "2903", market: "TW", name: "遠百", sector: "貿易百貨", currency: "TWD" },
  { symbol: "4938", market: "TW", name: "和碩", sector: "電腦及週邊設備", currency: "TWD" },
  { symbol: "3231", market: "TW", name: "緯創", sector: "電腦及週邊設備", currency: "TWD" },
  { symbol: "2354", market: "TW", name: "鴻準", sector: "電子零組件", currency: "TWD" },
  { symbol: "6505", market: "TW", name: "台塑化", sector: "油電燃氣", currency: "TWD" },
  { symbol: "5871", market: "TW", name: "中租-KY", sector: "其他", currency: "TWD" },
  { symbol: "1504", market: "TW", name: "東元", sector: "電機機械", currency: "TWD" },
  { symbol: "1717", market: "TW", name: "長興", sector: "化學工業", currency: "TWD" },
  { symbol: "2707", market: "TW", name: "晶華", sector: "觀光事業", currency: "TWD" },
  { symbol: "6446", market: "TW", name: "藥華藥", sector: "生技醫療", currency: "TWD" },
];

// No single free, reliable "full US market" listing endpoint exists without
// an API key/paid data provider, so this is a large hand-curated set of
// well-known, high-confidence large-cap tickers spanning every major GICS
// sector — a big step up from a 20-stock demo list, not a claim of covering
// every US-listed ticker. A stale or since-delisted entry here degrades
// safely: the live quote fetch for it simply fails and it's omitted from
// results (see lib/data/index.ts), it never produces fabricated data.
export const US_UNIVERSE: UniverseEntry[] = [
  // Technology
  { symbol: "AAPL", market: "US", name: "Apple Inc.", sector: "Technology", currency: "USD" },
  { symbol: "MSFT", market: "US", name: "Microsoft Corp.", sector: "Technology", currency: "USD" },
  { symbol: "NVDA", market: "US", name: "NVIDIA Corp.", sector: "Technology", currency: "USD" },
  { symbol: "AVGO", market: "US", name: "Broadcom Inc.", sector: "Technology", currency: "USD" },
  { symbol: "ORCL", market: "US", name: "Oracle Corp.", sector: "Technology", currency: "USD" },
  { symbol: "ADBE", market: "US", name: "Adobe Inc.", sector: "Technology", currency: "USD" },
  { symbol: "CRM", market: "US", name: "Salesforce Inc.", sector: "Technology", currency: "USD" },
  { symbol: "CSCO", market: "US", name: "Cisco Systems Inc.", sector: "Technology", currency: "USD" },
  { symbol: "ACN", market: "US", name: "Accenture plc", sector: "Technology", currency: "USD" },
  { symbol: "IBM", market: "US", name: "International Business Machines", sector: "Technology", currency: "USD" },
  { symbol: "INTU", market: "US", name: "Intuit Inc.", sector: "Technology", currency: "USD" },
  { symbol: "NOW", market: "US", name: "ServiceNow Inc.", sector: "Technology", currency: "USD" },
  { symbol: "AMD", market: "US", name: "Advanced Micro Devices", sector: "Technology", currency: "USD" },
  { symbol: "TXN", market: "US", name: "Texas Instruments", sector: "Technology", currency: "USD" },
  { symbol: "QCOM", market: "US", name: "Qualcomm Inc.", sector: "Technology", currency: "USD" },
  { symbol: "AMAT", market: "US", name: "Applied Materials", sector: "Technology", currency: "USD" },
  { symbol: "MU", market: "US", name: "Micron Technology", sector: "Technology", currency: "USD" },
  { symbol: "LRCX", market: "US", name: "Lam Research Corp.", sector: "Technology", currency: "USD" },
  { symbol: "KLAC", market: "US", name: "KLA Corp.", sector: "Technology", currency: "USD" },
  { symbol: "PANW", market: "US", name: "Palo Alto Networks", sector: "Technology", currency: "USD" },
  { symbol: "SNPS", market: "US", name: "Synopsys Inc.", sector: "Technology", currency: "USD" },
  { symbol: "CDNS", market: "US", name: "Cadence Design Systems", sector: "Technology", currency: "USD" },
  { symbol: "ADI", market: "US", name: "Analog Devices", sector: "Technology", currency: "USD" },
  { symbol: "INTC", market: "US", name: "Intel Corp.", sector: "Technology", currency: "USD" },
  { symbol: "DELL", market: "US", name: "Dell Technologies", sector: "Technology", currency: "USD" },
  { symbol: "HPQ", market: "US", name: "HP Inc.", sector: "Technology", currency: "USD" },
  { symbol: "UBER", market: "US", name: "Uber Technologies", sector: "Technology", currency: "USD" },
  { symbol: "ABNB", market: "US", name: "Airbnb Inc.", sector: "Technology", currency: "USD" },
  { symbol: "TSM", market: "US", name: "Taiwan Semiconductor ADR", sector: "Technology", currency: "USD" },

  // Communication Services
  { symbol: "GOOGL", market: "US", name: "Alphabet Inc.", sector: "Communication Services", currency: "USD" },
  { symbol: "META", market: "US", name: "Meta Platforms Inc.", sector: "Communication Services", currency: "USD" },
  { symbol: "NFLX", market: "US", name: "Netflix Inc.", sector: "Communication Services", currency: "USD" },
  { symbol: "DIS", market: "US", name: "Walt Disney Co.", sector: "Communication Services", currency: "USD" },
  { symbol: "CMCSA", market: "US", name: "Comcast Corp.", sector: "Communication Services", currency: "USD" },
  { symbol: "T", market: "US", name: "AT&T Inc.", sector: "Communication Services", currency: "USD" },
  { symbol: "VZ", market: "US", name: "Verizon Communications", sector: "Communication Services", currency: "USD" },
  { symbol: "TMUS", market: "US", name: "T-Mobile US Inc.", sector: "Communication Services", currency: "USD" },
  { symbol: "EA", market: "US", name: "Electronic Arts Inc.", sector: "Communication Services", currency: "USD" },

  // Consumer Discretionary
  { symbol: "AMZN", market: "US", name: "Amazon.com Inc.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "TSLA", market: "US", name: "Tesla Inc.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "HD", market: "US", name: "Home Depot Inc.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "MCD", market: "US", name: "McDonald's Corp.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "NKE", market: "US", name: "Nike Inc.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "SBUX", market: "US", name: "Starbucks Corp.", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "LOW", market: "US", name: "Lowe's Companies", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "BKNG", market: "US", name: "Booking Holdings", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "TJX", market: "US", name: "TJX Companies", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "CMG", market: "US", name: "Chipotle Mexican Grill", sector: "Consumer Discretionary", currency: "USD" },

  // Consumer Staples
  { symbol: "WMT", market: "US", name: "Walmart Inc.", sector: "Consumer Staples", currency: "USD" },
  { symbol: "PG", market: "US", name: "Procter & Gamble", sector: "Consumer Staples", currency: "USD" },
  { symbol: "KO", market: "US", name: "Coca-Cola Co.", sector: "Consumer Staples", currency: "USD" },
  { symbol: "PEP", market: "US", name: "PepsiCo Inc.", sector: "Consumer Staples", currency: "USD" },
  { symbol: "COST", market: "US", name: "Costco Wholesale Corp.", sector: "Consumer Staples", currency: "USD" },
  { symbol: "PM", market: "US", name: "Philip Morris International", sector: "Consumer Staples", currency: "USD" },
  { symbol: "MO", market: "US", name: "Altria Group", sector: "Consumer Staples", currency: "USD" },
  { symbol: "CL", market: "US", name: "Colgate-Palmolive", sector: "Consumer Staples", currency: "USD" },
  { symbol: "MDLZ", market: "US", name: "Mondelez International", sector: "Consumer Staples", currency: "USD" },
  { symbol: "TGT", market: "US", name: "Target Corp.", sector: "Consumer Staples", currency: "USD" },

  // Healthcare
  { symbol: "UNH", market: "US", name: "UnitedHealth Group", sector: "Healthcare", currency: "USD" },
  { symbol: "JNJ", market: "US", name: "Johnson & Johnson", sector: "Healthcare", currency: "USD" },
  { symbol: "LLY", market: "US", name: "Eli Lilly and Co.", sector: "Healthcare", currency: "USD" },
  { symbol: "ABBV", market: "US", name: "AbbVie Inc.", sector: "Healthcare", currency: "USD" },
  { symbol: "MRK", market: "US", name: "Merck & Co.", sector: "Healthcare", currency: "USD" },
  { symbol: "PFE", market: "US", name: "Pfizer Inc.", sector: "Healthcare", currency: "USD" },
  { symbol: "TMO", market: "US", name: "Thermo Fisher Scientific", sector: "Healthcare", currency: "USD" },
  { symbol: "ABT", market: "US", name: "Abbott Laboratories", sector: "Healthcare", currency: "USD" },
  { symbol: "DHR", market: "US", name: "Danaher Corp.", sector: "Healthcare", currency: "USD" },
  { symbol: "BMY", market: "US", name: "Bristol-Myers Squibb", sector: "Healthcare", currency: "USD" },
  { symbol: "AMGN", market: "US", name: "Amgen Inc.", sector: "Healthcare", currency: "USD" },
  { symbol: "GILD", market: "US", name: "Gilead Sciences", sector: "Healthcare", currency: "USD" },
  { symbol: "ISRG", market: "US", name: "Intuitive Surgical", sector: "Healthcare", currency: "USD" },
  { symbol: "CVS", market: "US", name: "CVS Health Corp.", sector: "Healthcare", currency: "USD" },
  { symbol: "MDT", market: "US", name: "Medtronic plc", sector: "Healthcare", currency: "USD" },

  // Financials
  { symbol: "JPM", market: "US", name: "JPMorgan Chase & Co.", sector: "Financials", currency: "USD" },
  { symbol: "V", market: "US", name: "Visa Inc.", sector: "Financials", currency: "USD" },
  { symbol: "MA", market: "US", name: "Mastercard Inc.", sector: "Financials", currency: "USD" },
  { symbol: "BAC", market: "US", name: "Bank of America Corp.", sector: "Financials", currency: "USD" },
  { symbol: "WFC", market: "US", name: "Wells Fargo & Co.", sector: "Financials", currency: "USD" },
  { symbol: "GS", market: "US", name: "Goldman Sachs Group", sector: "Financials", currency: "USD" },
  { symbol: "MS", market: "US", name: "Morgan Stanley", sector: "Financials", currency: "USD" },
  { symbol: "AXP", market: "US", name: "American Express Co.", sector: "Financials", currency: "USD" },
  { symbol: "C", market: "US", name: "Citigroup Inc.", sector: "Financials", currency: "USD" },
  { symbol: "SCHW", market: "US", name: "Charles Schwab Corp.", sector: "Financials", currency: "USD" },
  { symbol: "BLK", market: "US", name: "BlackRock Inc.", sector: "Financials", currency: "USD" },
  { symbol: "SPGI", market: "US", name: "S&P Global Inc.", sector: "Financials", currency: "USD" },
  { symbol: "PYPL", market: "US", name: "PayPal Holdings", sector: "Financials", currency: "USD" },

  // Industrials
  { symbol: "GE", market: "US", name: "General Electric Co.", sector: "Industrials", currency: "USD" },
  { symbol: "CAT", market: "US", name: "Caterpillar Inc.", sector: "Industrials", currency: "USD" },
  { symbol: "BA", market: "US", name: "Boeing Co.", sector: "Industrials", currency: "USD" },
  { symbol: "HON", market: "US", name: "Honeywell International", sector: "Industrials", currency: "USD" },
  { symbol: "UPS", market: "US", name: "United Parcel Service", sector: "Industrials", currency: "USD" },
  { symbol: "RTX", market: "US", name: "RTX Corp.", sector: "Industrials", currency: "USD" },
  { symbol: "LMT", market: "US", name: "Lockheed Martin Corp.", sector: "Industrials", currency: "USD" },
  { symbol: "DE", market: "US", name: "Deere & Co.", sector: "Industrials", currency: "USD" },
  { symbol: "UNP", market: "US", name: "Union Pacific Corp.", sector: "Industrials", currency: "USD" },
  { symbol: "MMM", market: "US", name: "3M Co.", sector: "Industrials", currency: "USD" },

  // Energy
  { symbol: "XOM", market: "US", name: "Exxon Mobil Corp.", sector: "Energy", currency: "USD" },
  { symbol: "CVX", market: "US", name: "Chevron Corp.", sector: "Energy", currency: "USD" },
  { symbol: "COP", market: "US", name: "ConocoPhillips", sector: "Energy", currency: "USD" },
  { symbol: "SLB", market: "US", name: "Schlumberger (SLB)", sector: "Energy", currency: "USD" },

  // Utilities
  { symbol: "NEE", market: "US", name: "NextEra Energy Inc.", sector: "Utilities", currency: "USD" },
  { symbol: "DUK", market: "US", name: "Duke Energy Corp.", sector: "Utilities", currency: "USD" },
  { symbol: "SO", market: "US", name: "Southern Co.", sector: "Utilities", currency: "USD" },

  // Real Estate
  { symbol: "AMT", market: "US", name: "American Tower Corp.", sector: "Real Estate", currency: "USD" },
  { symbol: "PLD", market: "US", name: "Prologis Inc.", sector: "Real Estate", currency: "USD" },

  // Materials
  { symbol: "LIN", market: "US", name: "Linde plc", sector: "Materials", currency: "USD" },
  { symbol: "SHW", market: "US", name: "Sherwin-Williams Co.", sector: "Materials", currency: "USD" },
];

const TW_UNIVERSE_TTL_MS = 24 * 60 * 60_000; // official company list changes rarely; refresh once a day
// Bounds how many TW symbols downstream code batch-fetches quotes/charts
// for at once — TWSE lists roughly 1000 companies, and rankings/momentum
// screens need to stay responsive rather than firing hundreds of concurrent
// requests. Capped, not fabricated: everything past the cap simply isn't
// included, the same way an unreachable quote is omitted rather than
// replaced with a guess. Kept deliberately conservative (not the full
// ~1000) because a burst of hundreds of concurrent requests to TWSE's
// unofficial MIS endpoint risks getting the whole site rate-limited —
// including single-stock lookups that have nothing to do with this list —
// rather than just leaving this particular screen slow.
const MAX_TW_UNIVERSE = 100;

// Kept in sync (best-effort, in the background) so the synchronous
// findInUniverse/sectorsFor helpers below get the fuller official list as
// soon as it's been fetched once, without every caller having to await it.
let twUniverseSnapshot: UniverseEntry[] = TW_UNIVERSE_SEED;

/**
 * The full TW stock universe, sourced from TWSE's official open-data
 * company listing (see fetchTwseListedCompanies in ./twse) instead of a
 * small hand-picked list. Falls back to the seed list if the official
 * endpoint is unreachable — never a fabricated one.
 */
/**
 * Applies MAX_TW_UNIVERSE without letting the cap decide *which* stocks
 * survive by accident. TWSE's listing comes back ordered by 公司代號, so a
 * plain `slice(0, 100)` keeps codes 1101-~1800 (水泥/食品/塑膠/紡織…) and
 * drops every stock a Taiwanese user actually looks for — 2330 台積電,
 * 2317 鴻海, 2454 聯發科, 2412 中華電 and the whole 28xx 金融 block are all
 * above the cut. That silently emptied the TW side of the site of anything
 * recognizable: 焦點排行, 漲跌幅榜, 成交量榜, 技術訊號共振股 and the daily
 * brief were ranking only obscure traditional-industry small caps.
 *
 * So the hand-curated seed (the well-known large caps) is placed first and
 * the rest of the official list fills the remaining slots. Entries still
 * carry TWSE's own official name/industry — the seed only decides priority,
 * never the data itself, and a seed symbol that isn't actually listed
 * anymore simply doesn't appear.
 */
function capUniverse(companies: UniverseEntry[]): UniverseEntry[] {
  const official = new Map(companies.map((e) => [e.symbol, e]));
  const picked = new Map<string, UniverseEntry>();
  for (const seed of TW_UNIVERSE_SEED) {
    const match = official.get(seed.symbol);
    if (match) picked.set(match.symbol, match);
  }
  for (const entry of companies) {
    if (picked.size >= MAX_TW_UNIVERSE) break;
    if (!picked.has(entry.symbol)) picked.set(entry.symbol, entry);
  }
  return Array.from(picked.values()).slice(0, MAX_TW_UNIVERSE);
}

export async function getTwUniverse(): Promise<UniverseEntry[]> {
  const { fetchTwseListedCompanies } = await import("./twse");
  const result = await cached("tw-universe-full", TW_UNIVERSE_TTL_MS, async () => {
    try {
      const companies = await fetchTwseListedCompanies();
      return companies.length > 0 ? capUniverse(companies) : TW_UNIVERSE_SEED;
    } catch {
      return TW_UNIVERSE_SEED;
    }
  });
  twUniverseSnapshot = result;
  return result;
}

export function findInUniverse(symbol: string, market?: Market): UniverseEntry | undefined {
  const upper = symbol.toUpperCase();
  const pool = market === "US" ? US_UNIVERSE : market === "TW" ? twUniverseSnapshot : [...twUniverseSnapshot, ...US_UNIVERSE];
  return pool.find((e) => e.symbol.toUpperCase() === upper);
}

/**
 * Finds a stock by scanning free-form text for a known company name as a
 * substring (e.g. picks "鴻海" out of "鴻海現在多少錢" or "台積電" out of a
 * longer sentence). Names are checked longest-first so a specific match
 * (e.g. "台積電") wins over any shorter name that happens to also be a
 * substring of the text. Used to ground the AI chat when a user types a
 * company name instead of a ticker/code.
 */
export function findSymbolByName(text: string): UniverseEntry | undefined {
  const pool = [...twUniverseSnapshot, ...US_UNIVERSE].sort((a, b) => b.name.length - a.name.length);
  return pool.find((entry) => entry.name.length >= 2 && text.includes(entry.name));
}

export function sectorsFor(market: Market): string[] {
  const pool = market === "TW" ? twUniverseSnapshot : US_UNIVERSE;
  const set = new Set(pool.map((e) => e.sector));
  return Array.from(set).sort();
}
