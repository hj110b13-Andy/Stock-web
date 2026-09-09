import { fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Fundamentals, Quote } from "./types";
import { findInUniverse } from "./universe";

// TWSE (Taiwan Stock Exchange) public data endpoints. No API key required.
// - Real-time-ish quote (delayed): mis.twse.com.tw "getStockInfo"
// - Daily OHLC history: www.twse.com.tw "STOCK_DAY"
// Both are unofficial-but-widely-used public JSON endpoints. They may be
// unreachable from sandboxed/offline environments; callers must fall back
// to mock data on any failure (see lib/data/index.ts).

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
    isMock: false,
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
 */
export async function fetchTwseQuotesBatch(stockNos: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  if (stockNos.length === 0) return map;

  const chExpr = stockNos.map((s) => `tse_${s}.tw`).join("|");
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${chExpr}&json=1&delay=0`;
  const res = await fetchWithTimeout(url, 6000, {
    headers: { Referer: "https://mis.twse.com.tw/stock/index.jsp" },
  });
  const data = (await res.json()) as { msgArray?: MisRow[] };
  for (const row of data.msgArray ?? []) {
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
