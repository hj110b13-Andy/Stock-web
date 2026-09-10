import { chunk, fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Fundamentals, Quote } from "./types";
import { findInUniverse, type UniverseEntry } from "./universe";

// TWSE (Taiwan Stock Exchange) public data endpoints. No API key required.
// - Real-time-ish quote (delayed): mis.twse.com.tw "getStockInfo"
// - Daily OHLC history: www.twse.com.tw "STOCK_DAY"
// Both are unofficial-but-widely-used public JSON endpoints. They may be
// unreachable from sandboxed/offline environments; callers treat any
// failure as "data unavailable" (see lib/data/index.ts) rather than
// fabricating a substitute value.

interface MisRow {
  c: string; // code
  n: string; // name
  z: string; // current price, "-" if no trade yet today
  y: string; // previous close
  o: string; // open
  h: string; // high
  l: string; // low
  v: string; // 累積成交量，單位是「張」（1 張 = 1000 股），需乘 1000 才能跟 STOCK_DAY 的股數對齊
}

function rowToQuote(row: MisRow): Quote {
  const prevClose = parseFloat(row.y);
  const last = row.z === "-" || row.z === "" ? prevClose : parseFloat(row.z);
  const change = last - prevClose;
  const known = findInUniverse(row.c, "TW");

  return {
    symbol: row.c,
    market: "TW",
    name: row.n || known?.name || row.c,
    price: round2(last),
    change: round2(change),
    changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
    open: round2(parseFloat(row.o) || last),
    high: round2(parseFloat(row.h) || last),
    low: round2(parseFloat(row.l) || last),
    prevClose: round2(prevClose),
    // MIS's v is in 張 (board lots); STOCK_DAY's 成交股數 (used for chart
    // volume) is in raw shares. Normalize to shares here so a stock's
    // headline volume and its chart's volume bars are the same unit and
    // don't disagree by 1000x.
    volume: (parseInt(row.v, 10) || 0) * 1000,
    currency: "TWD",
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchTwseQuote(stockNo: string): Promise<Quote> {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`;
  const res = await fetchWithTimeout(url, 4000, {
    headers: { Referer: "https://mis.twse.com.tw/stock/index.jsp" },
  });
  const data = (await res.json()) as { msgArray?: MisRow[] };
  const row = data.msgArray?.[0];
  if (!row) throw new Error(`No TWSE quote for ${stockNo}`);
  return rowToQuote(row);
}

/**
 * MIS supports querying many stocks in one request via a pipe-separated
 * ex_ch list. Listing pages (search/highlights/homepage movers) were each
 * calling fetchTwseQuote() per stock — 20+ concurrent requests to an
 * endpoint meant for single-stock lookups, which tends to get rate-limited
 * or time out under that load and silently fall back to mock data for the
 * whole list. One batched request is far more likely to actually succeed.
 *
 * Now that the universe can run into the low hundreds of stocks (see
 * getTwUniverse in ./universe), a single request would build an
 * enormous query string, so the symbol list is chunked into a handful of
 * parallel requests instead of one unbounded one. Kept well under what
 * MIS has been observed to accept in one request — better to fire a few
 * more small parallel chunks than risk one oversized request getting
 * truncated or rejected outright.
 */
const QUOTE_BATCH_CHUNK_SIZE = 50;

export async function fetchTwseQuotesBatch(stockNos: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  if (stockNos.length === 0) return map;

  const chunks = chunk(stockNos, QUOTE_BATCH_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map(async (group) => {
      const chExpr = group.map((s) => `tse_${s}.tw`).join("|");
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${chExpr}&json=1&delay=0`;
      try {
        const res = await fetchWithTimeout(url, 6000, {
          headers: { Referer: "https://mis.twse.com.tw/stock/index.jsp" },
        });
        const data = (await res.json()) as { msgArray?: MisRow[] };
        return data.msgArray ?? [];
      } catch {
        return [];
      }
    })
  );
  for (const row of results.flat()) {
    map.set(row.c, rowToQuote(row));
  }
  return map;
}

const RANGE_MONTHS: Record<ChartRange, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };

interface StockDayResponse {
  stat: string;
  data?: string[][];
}

export async function fetchTwseCandles(stockNo: string, range: ChartRange): Promise<Candle[]> {
  const months = RANGE_MONTHS[range];
  const requests: Promise<Candle[]>[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < months; i++) {
    const dateParam = `${cursor.getFullYear()}${pad(cursor.getMonth() + 1)}01`;
    requests.push(fetchMonth(stockNo, dateParam));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  const monthly = await Promise.all(requests);
  const merged = monthly.flat().sort((a, b) => a.time.localeCompare(b.time));
  if (merged.length === 0) throw new Error(`No TWSE candles for ${stockNo}`);
  return merged;
}

async function fetchMonth(stockNo: string, dateParam: string): Promise<Candle[]> {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateParam}&stockNo=${stockNo}`;
  const res = await fetchWithTimeout(url, 5000);
  const data = (await res.json()) as StockDayResponse;
  if (data.stat !== "OK" || !data.data) return [];
  return data.data.map((row) => {
    const [rocDate, , , open, high, low, close] = row;
    return {
      time: rocToIso(rocDate),
      open: parseFloat(open.replace(/,/g, "")),
      high: parseFloat(high.replace(/,/g, "")),
      low: parseFloat(low.replace(/,/g, "")),
      close: parseFloat(close.replace(/,/g, "")),
      volume: parseInt(row[1].replace(/,/g, ""), 10) || 0,
    };
  });
}

interface BwibbuRow {
  Code: string;
  Name: string;
  PEratio: string;
  DividendYield: string;
  PBratio: string;
}

/**
 * TWSE's official (not the unofficial MIS one) open-data endpoint for
 * 本益比/殖利率/股價淨值比 — one request covers every listed stock, so
 * this is fetched and cached once rather than per symbol. No market cap
 * in this dataset (would need shares-outstanding data TWSE doesn't expose
 * this simply); the fundamentals card just omits it for TW.
 */
export async function fetchTwseFundamentalsAll(): Promise<Map<string, Fundamentals>> {
  const url = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL";
  const res = await fetchWithTimeout(url, 8000);
  const rows = (await res.json()) as BwibbuRow[];
  const map = new Map<string, Fundamentals>();
  for (const row of rows) {
    const peRatio = parseFloat(row.PEratio);
    const dividendYield = parseFloat(row.DividendYield);
    map.set(row.Code, {
      peRatio: Number.isFinite(peRatio) && peRatio > 0 ? peRatio : undefined,
      dividendYield: Number.isFinite(dividendYield) && dividendYield > 0 ? dividendYield : undefined,
    });
  }
  return map;
}

interface CompanyRow {
  公司代號: string;
  公司簡稱: string;
  產業別: string;
}

/**
 * t187ap03_L's 產業別 field is TWSE's own two-digit industry classification
 * *code* (e.g. "01"), not the category name, even though it comes back as a
 * string that looks like it could be either — confirmed by cross-checking
 * real symbols against this table (e.g. 1101 台泥/1102 亞泥/1103 嘉泥, all
 * cement companies, all coded "01"). Maps to the official category names
 * per TWSE's 上市公司產業類別劃分暨調整要點. An unrecognized code (a new
 * category TWSE adds later) falls back to "未分類" rather than showing the
 * raw code.
 */
const TWSE_INDUSTRY_NAMES: Record<string, string> = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "13": "電子工業",
  "14": "建材營造業",
  "15": "航運業",
  "16": "觀光事業",
  "17": "金融保險業",
  "18": "貿易百貨業",
  "19": "綜合",
  "20": "其他業",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "32": "文化創意業",
  "33": "農業科技業",
  "34": "電子商務業",
  "35": "綠能環保業",
  "36": "數位雲端業",
  "37": "運動休閒業",
  "38": "居家生活業",
  "80": "存託憑證",
};

/**
 * TWSE's official open-data endpoint for every listed (上市) company's
 * basic profile — code, short name, industry category. Used to build the
 * full TW stock universe instead of a small hand-curated list (see
 * getTwUniverse in ./universe). Real official metadata; a company missing
 * here just won't appear in search/rankings, it never gets a made-up entry.
 */
export async function fetchTwseListedCompanies(): Promise<UniverseEntry[]> {
  const url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";
  const res = await fetchWithTimeout(url, 8000);
  const rows = (await res.json()) as CompanyRow[];
  return rows
    .filter((r) => r.公司代號 && r.公司簡稱)
    .map((r) => {
      const code = r.產業別?.trim() ?? "";
      return {
        symbol: r.公司代號.trim(),
        market: "TW" as const,
        name: r.公司簡稱.trim(),
        sector: TWSE_INDUSTRY_NAMES[code] ?? "未分類",
        currency: "TWD",
      };
    });
}

function rocToIso(roc: string): string {
  const [y, m, d] = roc.split("/").map((n) => parseInt(n, 10));
  return `${y + 1911}-${pad(m)}-${pad(d)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
