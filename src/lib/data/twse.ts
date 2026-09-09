import { fetchWithTimeout } from "./cache";
import type { Candle, ChartRange, Quote } from "./types";
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
  v: string; // volume (in 千股/lots depending on field, treated as shares here)
}

export async function fetchTwseQuote(stockNo: string): Promise<Quote> {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`;
  const res = await fetchWithTimeout(url, 4000, {
    headers: { Referer: "https://mis.twse.com.tw/stock/index.jsp" },
  });
  const data = (await res.json()) as { msgArray?: MisRow[] };
  const row = data.msgArray?.[0];
  if (!row) throw new Error(`No TWSE quote for ${stockNo}`);

  const prevClose = parseFloat(row.y);
  const last = row.z === "-" || row.z === "" ? prevClose : parseFloat(row.z);
  const change = last - prevClose;
  const known = findInUniverse(stockNo, "TW");

  return {
    symbol: stockNo,
    market: "TW",
    name: row.n || known?.name || stockNo,
    price: round2(last),
    change: round2(change),
    changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
    open: round2(parseFloat(row.o) || last),
    high: round2(parseFloat(row.h) || last),
    low: round2(parseFloat(row.l) || last),
    prevClose: round2(prevClose),
    volume: parseInt(row.v, 10) || 0,
    currency: "TWD",
    updatedAt: new Date().toISOString(),
    isMock: false,
  };
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
