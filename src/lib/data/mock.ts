import type { Candle, ChartRange, Market, Quote } from "./types";
import { findInUniverse } from "./universe";

// Deterministic PRNG (mulberry32) seeded from the symbol + day, so mock
// quotes stay stable within a day instead of jumping on every request.
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function guessMeta(symbol: string, market?: Market) {
  const entry = findInUniverse(symbol, market);
  if (entry) return entry;
  const inferredMarket: Market = market ?? (/^\d{4,6}$/.test(symbol) ? "TW" : "US");
  return {
    symbol: symbol.toUpperCase(),
    market: inferredMarket,
    name: symbol.toUpperCase(),
    sector: "未分類",
    currency: inferredMarket === "TW" ? "TWD" : "USD",
    basePrice: 50 + (hashSeed(symbol) % 500),
  };
}

export function mockQuote(symbolInput: string, market?: Market): Quote {
  const meta = guessMeta(symbolInput, market);
  return mockQuoteFromBase(meta.symbol, meta.name, meta.market, meta.currency, meta.basePrice);
}

export function mockQuoteFromBase(
  symbol: string,
  name: string,
  market: Market,
  currency: string,
  basePrice: number
): Quote {
  const rand = mulberry32(hashSeed(`${symbol}:${todayKey()}`));
  const drift = (rand() - 0.5) * 0.06; // up to +-3% for the day
  const prevClose = basePrice;
  const price = round(prevClose * (1 + drift), market);
  const change = round(price - prevClose, market);
  const changePercent = round((change / prevClose) * 100, "PCT");
  const intraSpread = Math.abs(drift) + 0.01;
  const high = round(Math.max(price, prevClose) * (1 + rand() * intraSpread), market);
  const low = round(Math.min(price, prevClose) * (1 - rand() * intraSpread), market);
  const open = round(prevClose * (1 + (rand() - 0.5) * intraSpread), market);
  const volume = Math.floor(1_000_000 + rand() * 20_000_000);

  return {
    symbol,
    market,
    name,
    price,
    change,
    changePercent,
    open,
    high,
    low,
    prevClose,
    volume,
    currency,
    updatedAt: new Date().toISOString(),
    isMock: true,
  };
}

const RANGE_DAYS: Record<ChartRange, number> = {
  "1m": 22,
  "3m": 65,
  "6m": 130,
  "1y": 252,
};

export function mockCandles(symbolInput: string, range: ChartRange, market?: Market): Candle[] {
  const meta = guessMeta(symbolInput, market);
  const days = RANGE_DAYS[range];
  const rand = mulberry32(hashSeed(`${meta.symbol}:candles`));
  const candles: Candle[] = [];

  let price = meta.basePrice * (0.85 + rand() * 0.3);
  const now = new Date();
  const points: Date[] = [];
  const cursor = new Date(now);
  while (points.length < days) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      points.unshift(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  for (const date of points) {
    const dailyDrift = (rand() - 0.48) * 0.035;
    const open = price;
    const close = Math.max(0.5, open * (1 + dailyDrift));
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    const volume = Math.floor(800_000 + rand() * 15_000_000);
    candles.push({
      time: date.toISOString().slice(0, 10),
      open: round(open, meta.market),
      high: round(high, meta.market),
      low: round(low, meta.market),
      close: round(close, meta.market),
      volume,
    });
    price = close;
  }

  return candles;
}

function round(value: number, market: Market | "PCT"): number {
  if (market === "PCT") return Math.round(value * 100) / 100;
  const decimals = market === "TW" ? (value >= 100 ? 1 : 2) : 2;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
