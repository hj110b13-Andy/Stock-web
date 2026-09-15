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
  /** Daily ranges: a plain "YYYY-MM-DD" calendar date. The "today" intraday
   *  range instead puts a full ISO timestamp here (date+time+offset) — the
   *  two shapes need different handling on the chart-rendering side (see
   *  StockChart.tsx), since lightweight-charts needs a UNIX-seconds
   *  timestamp for intraday points but a plain date string for daily ones. */
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

/**
 * "today" is intraday (minute-level, current trading session only, line
 * chart) — a fundamentally different shape from the other, daily-candle
 * ranges (see Candle.time's comment and StockChart.tsx's rendering split).
 */
export type ChartRange = "today" | "5d" | "10d" | "1m" | "3m" | "6m" | "1y" | "2y" | "5y" | "10y";

/**
 * 價量關係推論的三種結果——**不是真實委買委賣單成交量分類**（本站沒有那種逐筆
 * 成交/內外盤資料來源，見 SearchItem.volumeTrend 的完整說明）：
 * - "buy-leaning"：今日股價上漲，且成交量明顯高於這檔股票自己近期均量（傳統技術
 *   分析講的「價漲量增」，籌碼面偏多的常見判讀）
 * - "sell-leaning"：今日股價下跌，且成交量明顯高於自身近期均量（「價跌量增」，
 *   偏空的常見判讀）
 * - "neutral"：量能沒有明顯高於均量，或均量資料不足，沒有可下判斷的訊號
 */
export type VolumeTrend = "buy-leaning" | "sell-leaning" | "neutral";

export interface SearchItem {
  symbol: string;
  market: Market;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  /** 成交金額＝股價 × 成交量（該股票報價幣別，TW是新台幣、US是美元）——直接從
   *  既有報價資料算出來，不需要額外資料源，是市場上通稱的「成交值」，
   *  跟單純的「成交量（股數/張數）」是不同的排行依據。 */
  turnover: number;
  /**
   * 今日成交量 ÷ 這檔股票自己近期（最多20個交易日，不含今日）平均成交量。
   * 均量資料不足（新股剛掛牌、或站上還沒累積到至少5個交易日的歷史）時為
   * undefined——沒有基準可比較，不代入任何假設值。
   */
  volumeRatio?: number;
  /**
   * 價量關係推論（見上方 VolumeTrend 型別說明）：根據「今日量 vs 這檔股票自己近期
   * 均量」＋「今日漲跌方向」推論出的傳統技術分析價量關係，是一種歷史悠久的看盤
   * 經驗法則，**不是真實的委買委賣單成交量統計**——台股/美股都沒有公開、免費、
   * 提供逐筆成交方向（內外盤）分類的資料源，所以本站不會、也不能算出「今天成交量
   * 裡有多少真的是用市價買、多少是用市價賣」這種真正的買賣單量能數字。UI 顯示這個
   * 欄位時務必連同這個限制一起呈現，不能讓使用者誤以為是真實的買賣單統計。
   */
  volumeTrend: VolumeTrend;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  change: number;
  changePercent: number;
}

/**
 * 台指期（TX，大台指）夜盤近月合約報價 —— 見 lib/data/taifex.ts 的詳細說明。
 * 跟 IndexQuote 分開一個型別，是因為夜盤這個資料源需要額外的「交易中/已收盤」
 * 狀態跟資料時間戳才能誠實呈現（夜盤時段長達 15:00~次日05:00，使用者在這段
 * 期間以外看到這張卡片時，必須清楚知道看到的是「最近一次夜盤」而不是即時資料）。
 */
export interface TaifexFuturesQuote {
  /** 顯示用契約名稱，含近月月份，例如「台指期（近月，09月合約）」。近月合約由
   *  交易所自己的看盤系統決定並在結算日隔天自動換月，這裡不用自己處理換月邏輯。 */
  contractLabel: string;
  price: number;
  change: number;
  changePercent: number;
  /** 合約口數（張），來自交易所當下的合計成交量。 */
  volume: number;
  /** "trading"＝夜盤目前交易中；"closed"＝夜盤已收盤（顯示的是最近一次收盤資料）；
   *  "halted"＝交易所回報其他特殊狀態（試撮/暫停/延長開收盤等罕見情況），這幾種
   *  不強行歸類成 trading 或 closed，UI 顯示「特殊狀態」以免講錯。 */
  status: "trading" | "closed" | "halted";
  /** 資料時間戳（台北時間 "YYYY/MM/DD HH:mm:ss"），直接來自交易所回傳的成交時間，
   *  不是本站抓取當下的系統時間——確保使用者能自行判斷資料新鮮度，不會被誤導成
   *  「這一定是即時的」。 */
  asOf: string;
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
