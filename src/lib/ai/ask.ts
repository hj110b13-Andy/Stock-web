import { findSymbolByName, getChart, getIndices, getMultiSignalStocks, getQuote, searchStocks } from "@/lib/data";
import type { Market } from "@/lib/data";
import { callAiProviders } from "@/lib/ai/provider";
import type { ChatTurn } from "@/lib/ai/types";

export interface AskResult {
  answer: string;
  groundedSymbol?: string;
  usedAi: boolean;
}

// The negative lookahead keeps a plain year mention ("2025年台股展望") from
// being read as TW stock code 2025 (千興) — TWSE codes are 4-6 digits with
// no reserved range, so any bare number in that span is otherwise ambiguous
// with a year, and "20XX年" is by far the most common way one shows up in a
// question that isn't about a specific stock at all.
const SYMBOL_PATTERN = /\b\d{4,6}\b(?!\s*年)|\b[A-Z]{1,5}\b/g;
const STOPWORDS = new Set([
  "THE", "AND", "FOR", "ARE", "WHY", "HOW", "WHAT", "WILL", "WITH", "THIS",
  "THAT", "CAN", "YOU", "PLEASE", "STOCK", "TODAY", "NOW", "AI", "US", "TW",
]);

async function buildStockGrounding(
  target: { symbol: string; market: Market | undefined }
): Promise<{ symbol: string; text: string } | undefined> {
  const [quote, chart] = await Promise.all([
    getQuote(target.symbol, target.market),
    getChart(target.symbol, "3m", target.market),
  ]);
  if (!quote) return undefined;
  const changeLabel = quote.change >= 0 ? "上漲" : "下跌";
  const lines = [
    `股票：${quote.name}（${quote.symbol}，${quote.market === "TW" ? "台股" : "美股"}）`,
    `目前價格：${quote.price} ${quote.currency}，${changeLabel} ${Math.abs(quote.change)}（${quote.changePercent}%）`,
    `今日：開 ${quote.open} / 高 ${quote.high} / 低 ${quote.low} / 昨收 ${quote.prevClose}，成交量 ${quote.volume.toLocaleString()}`,
  ];
  if (chart) {
    const recent = chart.candles.slice(-10);
    lines.push(`近 10 個交易日收盤價：${recent.map((c) => `${c.time}=${c.close}`).join(", ")}`);
  } else {
    lines.push("（歷史走勢資料目前無法取得）");
  }
  lines.push("（來源：即時/近即時公開資料）");
  return { symbol: quote.symbol, text: lines.join("\n") };
}

// Matches "有哪些股票不錯"/"什麼股票要漲了"/"推薦一下"/"今天有什麼強勢股" style
// questions that aren't about any one stock — asking for a list, not a lookup.
// Without this, guessSymbolFromText finds nothing, no grounding is attached,
// and the model (correctly, per its instructions not to invent numbers) just
// says it has no data — even though the site already computes exactly this
// kind of thing (焦點排行/技術訊號共振) for the /highlights page.
const MOVERS_INTENT_PATTERN = /有哪些|哪幾檔|哪支|哪些股票|推薦|不錯的股票|強勢股|熱門股|飆股|焦點股|上漲的股票|要漲|要噴|準備上漲/;

// Momentum stocks get more slots than plain gainers: a gainer is just one
// number (today's %), but each momentum entry carries several independent,
// quantified technical readings (volume ratio, MA position, streak length,
// new high/low) that are worth surfacing in bulk so the model has enough
// material to explain *why* each one screens as technically strong, not
// just name it.
const GAINERS_N = 8;
const MOMENTUM_N = 12;

async function buildMoversGrounding(): Promise<string> {
  try {
    const [twGainers, usGainers, twMomentum, usMomentum] = await Promise.all([
      searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
      getMultiSignalStocks("TW"),
      getMultiSignalStocks("US"),
    ]);
    const fmtGainer = (items: typeof twGainers) =>
      items.slice(0, GAINERS_N).map((s) => `${s.name}(${s.symbol}) ${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%`).join("、") || "（無資料）";
    const fmtMomentum = (items: typeof twMomentum) =>
      items
        .slice(0, MOMENTUM_N)
        .map((s) => `${s.name}(${s.symbol})，現價${s.price}(${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%)：${s.signals.map((sig) => sig.label).join("、")}`)
        .join("\n") || "（無資料）";
    return [
      `台股今日漲幅榜前${GAINERS_N}：${fmtGainer(twGainers)}`,
      `美股今日漲幅榜前${GAINERS_N}：${fmtGainer(usGainers)}`,
      `台股技術訊號共振股（同時符合≥2個客觀技術訊號，依訊號數量排序，共${twMomentum.length}檔，列出前${MOMENTUM_N}）：\n${fmtMomentum(twMomentum)}`,
      `美股技術訊號共振股（共${usMomentum.length}檔，列出前${MOMENTUM_N}）：\n${fmtMomentum(usMomentum)}`,
    ].join("\n\n");
  } catch {
    return "";
  }
}

function guessSymbolFromText(text: string): { symbol: string; market: Market } | undefined {
  const byName = findSymbolByName(text);
  if (byName) return { symbol: byName.symbol, market: byName.market };

  const matches = text.toUpperCase().match(SYMBOL_PATTERN);
  if (!matches) return undefined;
  for (const m of matches) {
    if (/^\d{4,6}$/.test(m)) return { symbol: m, market: "TW" };
  }
  for (const m of matches) {
    if (!STOPWORDS.has(m) && /^[A-Z]{1,5}$/.test(m)) return { symbol: m, market: "US" };
  }
  return undefined;
}

export async function answerQuestion(
  question: string,
  contextSymbol?: string,
  history: ChatTurn[] = []
): Promise<AskResult> {
  const target = contextSymbol
    ? { symbol: contextSymbol, market: undefined as Market | undefined }
    : guessSymbolFromText(question);
  const wantsMovers = !target && MOVERS_INTENT_PATTERN.test(question);

  let groundedSymbol: string | undefined;

  // Always ground with both markets' index levels (not just whichever
  // market the question is about), plus the specific stock's data when one
  // is targeted, so the model can reason about TW/US cross-market influence
  // (e.g. Nasdaq overnight moves affecting semiconductor names) instead of
  // only seeing the one stock in isolation.
  const [stockGrounding, indexGrounding, moversGrounding] = await Promise.all([
    target ? buildStockGrounding(target) : Promise.resolve(undefined),
    getIndices()
      .then((indices) => {
        if (indices.length === 0) return "（大盤指數目前無法取得）";
        return indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n");
      })
      .catch(() => ""),
    wantsMovers ? buildMoversGrounding() : Promise.resolve(""),
  ]);

  if (stockGrounding) groundedSymbol = stockGrounding.symbol;

  const grounding = [
    stockGrounding ? `【個股資料】\n${stockGrounding.text}` : "",
    indexGrounding ? `【大盤概況（台股＋美股）】\n${indexGrounding}` : "",
    moversGrounding ? `【今日焦點數據（純數據排序/客觀技術訊號描述，不是預測）】\n${moversGrounding}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "你是一個股票研究網站上的助理，回答繁體中文問題。",
    "風格要求（很重要）：直接講重點、先講結論，語氣像在跟人對話而不是寫報告。不要模稜兩可、不要鋪陳、不要重複同樣的免責聲明兩次以上。能一兩句話講完的就不要條列；只有在真的有好幾個平行項目時才用條列，且每項一行、不要展開解釋。",
    "你會拿到「個股資料」（使用者問特定股票時）、「大盤概況」（台股加權指數、道瓊、S&P 500、那斯達克），有時候還有「今日焦點數據」（今日漲幅榜、技術訊號共振股——這些是純數據排序或客觀技術狀態描述，不是預測）。",
    "台股與美股常互相影響（例如美股科技股/半導體夜間走勢，隔天常牽動台股電子權值股），有明顯關聯時才連結兩邊資料分析，沒有的話不用勉強牽拖。",
    "使用者問『有哪些股票不錯/今天有什麼強勢股/準備上漲的股票/推薦一下/幫我選股』這類問題時：只要拿到「今日焦點數據」，就直接依那份資料具體回答，不要用『資料中沒有個股清單』這種話迴避——那份資料就是用來回答這類問題的。針對技術訊號共振股，挑幾檔訊號數量較多、比較有代表性的，逐檔講清楚『目前呈現什麼客觀技術現況』，用資料裡給的具體數字說理由（例如「均量的幾倍」「連漲幾天」「站上/跌破哪條均線」），讓使用者知道『為什麼這檔被篩出來』；只有在真的沒拿到「今日焦點數據」時才老實說目前沒有相關數據。",
    "但無論使用者怎麼問（包括直接要求『推薦』『告訴我會不會漲』『幫我選』），都絕對不能說出『建議買進/賣出』『這支會漲/會噴』『看好這檔』這類語句，也不能把技術訊號直接推論成未來走勢——這些訊號只代表『過去到現在的客觀數據狀態』，不是前瞻預測。",
    "請根據資料回答，不要編造資料中沒有的數字；若資料標示為無法取得，直接說目前查不到，不要繞圈子解釋為什麼查不到。",
    "結尾不要寫免責聲明的完整句子，那樣看起來很雜亂。只在最後另起一行加極短的標籤：一般問題用『（僅供參考）』；使用者問法明顯是要買賣建議或漲跌預測時，換成『（僅為客觀數據，非預測非建議）』。只能擇一、只出現一次、就是這幾個字，不要展開成一整句話，也不要在正文中間穿插。",
    "使用者之前的提問與你的回覆會一併附上作為對話紀錄，回答新問題時請自然承接對話脈絡（例如使用者接著問「那美股呢」時，要記得他上一句在問什麼）。",
  ].join("\n");

  const userContent = grounding
    ? `參考資料：\n${grounding}\n\n使用者問題：${question}`
    : `使用者問題：${question}\n（目前沒有可用的參考資料，請根據一般金融知識簡短回答，並說明無法取得即時資料。）`;

  const messages: ChatTurn[] = [...history, { role: "user", content: userContent }];
  const result = await callAiProviders(system, messages);
  if (result.usedAi) return { answer: result.answer, groundedSymbol, usedAi: true };

  return {
    answer: buildCannedAnswer(grounding, groundedSymbol, result.failureReason ?? "未知原因"),
    groundedSymbol,
    usedAi: false,
  };
}

function buildCannedAnswer(grounding: string, groundedSymbol: string | undefined, reason: string): string {
  const lines = [
    groundedSymbol ? `以下是關於 ${groundedSymbol} 的目前資料：` : "以下是目前的市場資料：",
    grounding || "（目前無法取得資料，可能是網路或資料源暫時無法連線。）",
    "",
    `提醒：AI 問答目前無法產生完整回覆（原因：${reason.replace(/。$/, "")}），以上僅為原始資料整理，並非 AI 生成的分析。`,
    "（僅供參考）",
  ];
  return lines.join("\n");
}
