import { findSymbolByName, getChart, getIndices, getQuote } from "@/lib/data";
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

  let groundedSymbol: string | undefined;

  // Always ground with both markets' index levels (not just whichever
  // market the question is about), plus the specific stock's data when one
  // is targeted, so the model can reason about TW/US cross-market influence
  // (e.g. Nasdaq overnight moves affecting semiconductor names) instead of
  // only seeing the one stock in isolation.
  const [stockGrounding, indexGrounding] = await Promise.all([
    target ? buildStockGrounding(target) : Promise.resolve(undefined),
    getIndices()
      .then((indices) => {
        if (indices.length === 0) return "（大盤指數目前無法取得）";
        return indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n");
      })
      .catch(() => ""),
  ]);

  if (stockGrounding) groundedSymbol = stockGrounding.symbol;

  const grounding = [
    stockGrounding ? `【個股資料】\n${stockGrounding.text}` : "",
    indexGrounding ? `【大盤概況（台股＋美股）】\n${indexGrounding}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "你是一個股票研究網站上的助理，回答繁體中文問題，語氣專業、精簡、條列清楚。",
    "你會同時拿到「個股資料」（若使用者問特定股票）與「大盤概況」（台股加權指數、道瓊、S&P 500、那斯達克）。",
    "台股與美股常互相影響（例如美股科技股/半導體夜間走勢，隔天常牽動台股電子權值股），請在分析時主動連結兩邊的資料，而不是只看單一市場；沒有明顯關聯時不用勉強牽拖。",
    "請根據資料回答，不要編造資料中沒有的數字；若資料標示為無法取得，請誠實告知使用者目前查不到該資訊，不要用其他數字代替。",
    "務必提醒使用者：這是資訊整理，不構成投資建議。",
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
    "本站資訊僅供參考，不構成投資建議。",
  ];
  return lines.join("\n");
}
