// 台灣期貨交易所（TAIFEX）台指期（TX，大台指）夜盤近月合約報價。
//
// 資料源研究過程（2026-09-14）：TAIFEX 官方 OpenAPI（openapi.taifex.com.tw）跟
// 官網「期貨每日交易行情查詢」頁面（www.taifex.com.tw/cht/3/futDailyMarketReport）
// 雖然都有區分「一般交易時段」（日盤）／「盤後交易時段」（夜盤），但實測發現這兩個
// 都是「T+1 結算後才公布」等級的資料（同一天 23:30 測試，最新資料仍停在前一個交易日，
// 落後超過一整個交易日），完全不符合「最近一次夜盤」或「夜盤交易中」這種需要接近
// 當下狀態的用途，所以都沒有採用。
//
// 真正可用的是 TAIFEX 自己的官方免費看盤網站 mis.taifex.com.tw/futures/（不需登入、
// 不需金鑰、頁面本身公開），跟這個 repo 既有的 mis.twse.com.tw 是同一種公開 MIS
// 看盤系統的架構慣例（TWSE/TAIFEX 這類交易所常見的作法：官方 OpenAPI 給的是隔日
// 結算後的正式報表，另外有一個給看盤網站用的近即時 MIS 端點）。這個網站的前端是
// 一個 Nuxt.js SPA，實際的報價資料是呼叫它自己的 REST API：
//   POST https://mis.taifex.com.tw/futures/api/getQuoteList
//   body: {"MarketType":"1","SymbolType":"F","KindID":"1","CID":"","ExpireMonth":""}
// （MarketType "0"＝一般交易時段/日盤，"1"＝盤後交易時段/夜盤；這是該網站前端自己
// 用來畫「國內指數期貨」報價表格的 API，不是這個專案發明的端點，是從該網站實際載入
// 的 JS bundle 裡找到 apiBaseUrl + pageAttr 的真實呼叫方式後驗證出來的）。
// 實測驗證：晚上 23:38 呼叫時，回傳資料裡 CTime 剛好等於呼叫當下的時間（HH:MM:SS
// 對得上），確認這是真正近即時、不是延遲資料。
//
// 換月：不用自己判斷。這個端點回傳的「國內指數期貨」清單已經由交易所自己依到期
// 月份排序，近月合約永遠排在最前面，結算日隔天交易所自己就會把新的近月排到第一筆，
// 這裡只需要抓「SymbolID 開頭是 TXF、且不是現貨假列的 -P 後綴」的第一筆即可。
//
// 交易中／已收盤判斷：不用自己算夜盤時間區間（15:00~次日05:00）去猜，直接沿用
// 交易所回傳的 Status 欄位（這個網站自己的字典檔裡定義：""＝正常交易中，
// "TC"＝收盤，其餘 PT/NCP/TH/PO/PC/CO 是試撮/暫停/延長開收盤/冷卻等罕見狀態）。
// 這樣即使遇到國定假日調整交易時段之類的特殊情況，也是交易所自己說了算，不會被
// 本站寫死的時間表誤判——這是這個 session 在 TPEx/marketStatus.ts 那幾次教訓後
// 特意採用的更保守作法。
//
// TLS 憑證：mis.taifex.com.tw 的憑證由 Google Trust Services（WE1）簽發，是
// 全球主要瀏覽器/Node.js 內建信任清單都有的標準中繼憑證，跟 PROGRESS.md 記錄過的
// www.tpex.org.tw 那次「台灣本地簽發的 TWCA 中繼憑證在境外連線時缺漏」問題是完全
// 不同的憑證鏈，理論上不會重演同一個問題，但仍要在正式站部署後實際驗證一次
// （見 PROGRESS.md 工作日誌）。

import type { TaifexFuturesQuote } from "./types";

const QUOTE_LIST_URL = "https://mis.taifex.com.tw/futures/api/getQuoteList";

// 固定查夜盤（盤後交易時段）。日盤的台股大盤已經有加權指數（twse.ts 的 t00）涵蓋，
// 這個函式的用途明確是「現貨收盤後到隔天開盤前」這段資訊真空期的市場情緒指標，
// 不需要另外查日盤這組。
const NIGHT_SESSION_BODY = JSON.stringify({
  MarketType: "1",
  SymbolType: "F",
  KindID: "1",
  CID: "",
  ExpireMonth: "",
});

interface RawQuoteRow {
  SymbolID: string;
  DispCName: string;
  DispEName: string;
  Status: string;
  CLastPrice: string;
  CDiff: string;
  CDiffRate: string;
  CTotalVolume: string;
  CDate: string;
  CTime: string;
}

interface RawQuoteListResponse {
  RtCode: string;
  RtMsg: string;
  RtData?: { QuoteList?: RawQuoteRow[] };
}

/** 見上方檔案說明：直接沿用交易所自己的狀態代碼，不自己猜測交易時段。 */
function classifyStatus(status: string): TaifexFuturesQuote["status"] {
  if (status === "TC") return "closed";
  if (status === "") return "trading";
  return "halted";
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "-") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 近月台指期（TX，大台指）夜盤報價。找不到近月合約、或近月合約還沒有任何成交
 * （例如夜盤剛開盤的頭幾秒，CLastPrice 是空字串）一律回傳 null——絕不用參考價
 * 或其他數字頂替，比照全站「抓不到就顯示資料暫缺」的原則。
 */
export async function fetchTaifexNightFutures(): Promise<TaifexFuturesQuote | null> {
  const res = await fetch(QUOTE_LIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Referer: "https://mis.taifex.com.tw/futures/",
    },
    body: NIGHT_SESSION_BODY,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TAIFEX getQuoteList HTTP ${res.status}`);

  const data = (await res.json()) as RawQuoteListResponse;
  if (data.RtCode !== "0") throw new Error(`TAIFEX getQuoteList RtCode ${data.RtCode}: ${data.RtMsg}`);

  const list = data.RtData?.QuoteList ?? [];
  // "TXF..." 開頭涵蓋大台指本尊；"-P" 後綴是清單裡夾帶的現貨參考列（臺指現貨，
  // 不是期貨合約），要排除。清單本身已經依到期月份排序，第一筆命中的就是近月。
  const nearMonth = list.find((row) => row.SymbolID?.startsWith("TXF") && !row.SymbolID.endsWith("-P"));
  if (!nearMonth) return null;

  const price = toNumber(nearMonth.CLastPrice);
  const change = toNumber(nearMonth.CDiff);
  const changePercent = toNumber(nearMonth.CDiffRate);
  const volume = toNumber(nearMonth.CTotalVolume) ?? 0;
  if (price === null || change === null || changePercent === null) return null;

  // DispEName 例如 "TX096" → 月份標籤 "09"，純粹顯示用，不影響任何判斷邏輯。
  const monthDigits = nearMonth.DispEName?.match(/^TX(\d{2})/)?.[1];
  const contractLabel = monthDigits ? `台指期（近月，${Number(monthDigits)}月合約）` : "台指期（近月）";

  const dateStr = nearMonth.CDate ?? "";
  const timeStr = (nearMonth.CTime ?? "").padStart(6, "0");
  const hasTime = timeStr !== "000000" && nearMonth.CTime;
  const asOf =
    dateStr.length === 8
      ? `${dateStr.slice(0, 4)}/${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}` +
        (hasTime ? ` ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}` : "")
      : "";

  return {
    contractLabel,
    price,
    change,
    changePercent,
    volume,
    status: classifyStatus(nearMonth.Status ?? ""),
    asOf,
  };
}

/**
 * 給 AI 問答（ask.ts）跟每日快報/今日建議（brief.ts/actionBrief.ts）「大盤概況」
 * grounding 共用的一行文字描述。集中寫在這裡（而不是三個呼叫端各自組字串），
 * 避免其中一處改了「交易中/已收盤」的措辭，另外兩處忘記跟著改——跟 format.ts
 * 的 formatSharesWithLots 是同一種「共用邏輯只寫一次」的考量。
 */
export function describeTaifexNightFutures(quote: TaifexFuturesQuote | null): string {
  if (!quote) return "台指期夜盤：目前無法取得資料";
  const statusText =
    quote.status === "trading" ? "夜盤交易中" : quote.status === "closed" ? "最近一次夜盤收盤" : "目前為特殊狀態（試撮/暫停等）";
  const sign = quote.change >= 0 ? "+" : "";
  return `${quote.contractLabel}（${statusText}，資料時間 ${quote.asOf || "未知"}）：${quote.price}點（${sign}${quote.changePercent}%）`;
}
