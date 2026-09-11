export type Market = "TW" | "US";

export interface Quote {
  symbol: string;
  market: Market;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  currency: string;
  updatedAt: string;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartResponse {
  symbol: string;
  market: Market;
  range: ChartRange;
  candles: Candle[];
}

export type ChartRange = "1m" | "3m" | "6m" | "1y";

export interface SearchItem {
  symbol: string;
  market: Market;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  change: number;
  changePercent: number;
}

export interface Fundamentals {
  peRatio?: number;
  dividendYield?: number;
  marketCap?: number;
}

export interface Earnings {
  /** TW：最新月營收年增率(%)，台股投資人最常看的財報先行指標 */
  monthlyRevenueYoyPercent?: number;
  /** e.g. "2026年7月" */
  monthlyRevenuePeriod?: string;
  /** 最新一季每股盈餘（TW：元；US：美元） */
  quarterlyEps?: number;
  /** e.g. "115年Q2"（TW）或 "2026 Q2"（US） */
  quarterlyEpsPeriod?: string;
  /** US only：實際 EPS 相對市場預期的驚喜幅度(%)，正值代表優於預期 */
  epsSurprisePercent?: number;
  /** US only：下次公布財報的日期（ISO 格式） */
  nextEarningsDate?: string;
}
