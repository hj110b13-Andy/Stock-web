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
  /** 股價淨值比 (P/B) */
  pbRatio?: number;
}

/**
 * TW only — 三大法人買賣超與融資融券餘額，統稱「籌碼面」，TWSE 官方每個交易日
 * 收盤後公布，美股沒有對應的公開資料源，getChips() 對美股一律回傳 null。
 */
export interface Chips {
  /** 這份籌碼資料對應的交易日（YYYY-MM-DD） */
  date?: string;
  /** 三大法人合計買賣超股數，正值為買超、負值為賣超 */
  institutionalNetShares?: number;
  foreignNetShares?: number;
  trustNetShares?: number;
  dealerNetShares?: number;
  /** 融資今日餘額，單位「張」（1 張 = 1000 股），TWSE 原始資料就是這個單位 */
  marginBalance?: number;
  /** 融資今日餘額 - 前日餘額，單位「張」 */
  marginBalanceChange?: number;
  /** 融券今日餘額，單位「張」 */
  shortBalance?: number;
  /** 融券今日餘額 - 前日餘額，單位「張」 */
  shortBalanceChange?: number;
}

/** TW only — 上市公司每日重大訊息公告（併購、增資、法說會等），來源 TWSE 公開資訊觀測站。 */
export interface MaterialAnnouncement {
  /** 發言日期（YYYY-MM-DD） */
  date: string;
  subject: string;
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
