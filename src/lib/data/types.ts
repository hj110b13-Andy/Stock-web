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
  isMock: boolean;
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
  isMock: boolean;
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
  isMock: boolean;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  change: number;
  changePercent: number;
  isMock: boolean;
}
