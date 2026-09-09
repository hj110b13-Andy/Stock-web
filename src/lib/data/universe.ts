import type { Market } from "./types";

export interface UniverseEntry {
  symbol: string;
  market: Market;
  name: string;
  sector: string;
  currency: string;
  basePrice: number;
}

// Curated demo universe. Real deployments should replace/extend this with a
// full listing pulled from TWSE OpenAPI (上市/上櫃股票代碼) and a US ticker
// database, but a static list keeps search/filter and the homepage movers
// fast and deterministic for the demo.
export const TW_UNIVERSE: UniverseEntry[] = [
  { symbol: "2330", market: "TW", name: "台積電", sector: "半導體", currency: "TWD", basePrice: 1015 },
  { symbol: "2317", market: "TW", name: "鴻海", sector: "電子零組件", currency: "TWD", basePrice: 205 },
  { symbol: "2454", market: "TW", name: "聯發科", sector: "半導體", currency: "TWD", basePrice: 1280 },
  { symbol: "2308", market: "TW", name: "台達電", sector: "電子零組件", currency: "TWD", basePrice: 415 },
  { symbol: "2382", market: "TW", name: "廣達", sector: "電腦及週邊設備", currency: "TWD", basePrice: 285 },
  { symbol: "2412", market: "TW", name: "中華電", sector: "電信服務", currency: "TWD", basePrice: 128 },
  { symbol: "2881", market: "TW", name: "富邦金", sector: "金融保險", currency: "TWD", basePrice: 92 },
  { symbol: "2882", market: "TW", name: "國泰金", sector: "金融保險", currency: "TWD", basePrice: 68 },
  { symbol: "2886", market: "TW", name: "兆豐金", sector: "金融保險", currency: "TWD", basePrice: 42 },
  { symbol: "2891", market: "TW", name: "中信金", sector: "金融保險", currency: "TWD", basePrice: 45 },
  { symbol: "1301", market: "TW", name: "台塑", sector: "塑膠工業", currency: "TWD", basePrice: 78 },
  { symbol: "1303", market: "TW", name: "南亞", sector: "塑膠工業", currency: "TWD", basePrice: 62 },
  { symbol: "2002", market: "TW", name: "中鋼", sector: "鋼鐵工業", currency: "TWD", basePrice: 26 },
  { symbol: "2603", market: "TW", name: "長榮", sector: "航運業", currency: "TWD", basePrice: 195 },
  { symbol: "2609", market: "TW", name: "陽明", sector: "航運業", currency: "TWD", basePrice: 88 },
  { symbol: "3008", market: "TW", name: "大立光", sector: "光學元件", currency: "TWD", basePrice: 2350 },
  { symbol: "3711", market: "TW", name: "日月光投控", sector: "半導體", currency: "TWD", basePrice: 168 },
  { symbol: "2379", market: "TW", name: "瑞昱", sector: "半導體", currency: "TWD", basePrice: 545 },
  { symbol: "2357", market: "TW", name: "華碩", sector: "電腦及週邊設備", currency: "TWD", basePrice: 485 },
  { symbol: "2395", market: "TW", name: "研華", sector: "電腦及週邊設備", currency: "TWD", basePrice: 385 },
  { symbol: "1216", market: "TW", name: "統一", sector: "食品工業", currency: "TWD", basePrice: 82 },
  { symbol: "2801", market: "TW", name: "彰銀", sector: "金融保險", currency: "TWD", basePrice: 24 },
  { symbol: "5880", market: "TW", name: "合庫金", sector: "金融保險", currency: "TWD", basePrice: 27 },
  { symbol: "3034", market: "TW", name: "聯詠", sector: "半導體", currency: "TWD", basePrice: 465 },
];

export const US_UNIVERSE: UniverseEntry[] = [
  { symbol: "AAPL", market: "US", name: "Apple Inc.", sector: "Technology", currency: "USD", basePrice: 228 },
  { symbol: "MSFT", market: "US", name: "Microsoft Corp.", sector: "Technology", currency: "USD", basePrice: 415 },
  { symbol: "NVDA", market: "US", name: "NVIDIA Corp.", sector: "Semiconductors", currency: "USD", basePrice: 135 },
  { symbol: "GOOGL", market: "US", name: "Alphabet Inc.", sector: "Communication Services", currency: "USD", basePrice: 172 },
  { symbol: "AMZN", market: "US", name: "Amazon.com Inc.", sector: "Consumer Discretionary", currency: "USD", basePrice: 186 },
  { symbol: "META", market: "US", name: "Meta Platforms Inc.", sector: "Communication Services", currency: "USD", basePrice: 565 },
  { symbol: "TSLA", market: "US", name: "Tesla Inc.", sector: "Consumer Discretionary", currency: "USD", basePrice: 248 },
  { symbol: "AVGO", market: "US", name: "Broadcom Inc.", sector: "Semiconductors", currency: "USD", basePrice: 168 },
  { symbol: "AMD", market: "US", name: "Advanced Micro Devices", sector: "Semiconductors", currency: "USD", basePrice: 142 },
  { symbol: "TSM", market: "US", name: "Taiwan Semiconductor ADR", sector: "Semiconductors", currency: "USD", basePrice: 188 },
  { symbol: "JPM", market: "US", name: "JPMorgan Chase & Co.", sector: "Financials", currency: "USD", basePrice: 232 },
  { symbol: "V", market: "US", name: "Visa Inc.", sector: "Financials", currency: "USD", basePrice: 285 },
  { symbol: "NFLX", market: "US", name: "Netflix Inc.", sector: "Communication Services", currency: "USD", basePrice: 895 },
  { symbol: "XOM", market: "US", name: "Exxon Mobil Corp.", sector: "Energy", currency: "USD", basePrice: 118 },
  { symbol: "JNJ", market: "US", name: "Johnson & Johnson", sector: "Healthcare", currency: "USD", basePrice: 162 },
  { symbol: "WMT", market: "US", name: "Walmart Inc.", sector: "Consumer Staples", currency: "USD", basePrice: 92 },
  { symbol: "COST", market: "US", name: "Costco Wholesale Corp.", sector: "Consumer Staples", currency: "USD", basePrice: 925 },
  { symbol: "ORCL", market: "US", name: "Oracle Corp.", sector: "Technology", currency: "USD", basePrice: 178 },
  { symbol: "ADBE", market: "US", name: "Adobe Inc.", sector: "Technology", currency: "USD", basePrice: 465 },
  { symbol: "CRM", market: "US", name: "Salesforce Inc.", sector: "Technology", currency: "USD", basePrice: 325 },
];

export const UNIVERSE: UniverseEntry[] = [...TW_UNIVERSE, ...US_UNIVERSE];

export function findInUniverse(symbol: string, market?: Market): UniverseEntry | undefined {
  const upper = symbol.toUpperCase();
  return UNIVERSE.find(
    (e) => e.symbol.toUpperCase() === upper && (market === undefined || e.market === market)
  );
}

export function sectorsFor(market: Market): string[] {
  const set = new Set(UNIVERSE.filter((e) => e.market === market).map((e) => e.sector));
  return Array.from(set).sort();
}
