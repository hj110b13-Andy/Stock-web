import Anthropic from "@anthropic-ai/sdk";
import { getChart, getIndices, getQuote } from "@/lib/data";
import type { Market } from "@/lib/data";
import { askGemini } from "@/lib/ai/gemini";

export interface AskResult {
  answer: string;
  groundedSymbol?: string;
  usedAi: boolean;
}

const SYMBOL_PATTERN = /\b\d{4,6}\b|\b[A-Z]{1,5}\b/g;
const STOPWORDS = new Set([
  "THE", "AND", "FOR", "ARE", "WHY", "HOW", "WHAT", "WILL", "WITH", "THIS",
  "THAT", "CAN", "YOU", "PLEASE", "STOCK", "TODAY", "NOW", "AI", "US", "TW",
]);

function guessSymbolFromText(text: string): { symbol: string; market: Market } | undefined {
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

export async function answerQuestion(question: string, contextSymbol?: string): Promise<AskResult> {
  const target = contextSymbol
    ? { symbol: contextSymbol, market: undefined as Market | undefined }
    : guessSymbolFromText(question);

  let grounding = "";
  let groundedSymbol: string | undefined;

  if (target) {
    try {
      const [quote, chart] = await Promise.all([
        getQuote(target.symbol, target.market),
        getChart(target.symbol, "3m", target.market),
      ]);
      groundedSymbol = quote.symbol;
      const recent = chart.candles.slice(-10);
      const changeLabel = quote.change >= 0 ? "上漲" : "下跌";
      grounding = [
        `股票：${quote.name}（${quote.symbol}，${quote.market === "TW" ? "台股" : "美股"}）`,
        `目前價格：${quote.price} ${quote.currency}，${changeLabel} ${Math.abs(quote.change)}（${quote.changePercent}%）`,
        `今日：開 ${quote.open} / 高 ${quote.high} / 低 ${quote.low} / 昨收 ${quote.prevClose}，成交量 ${quote.volume.toLocaleString()}`,
        `近 10 個交易日收盤價：${recent.map((c) => `${c.time}=${c.close}`).join(", ")}`,
        quote.isMock ? "（注意：目前為離線示範資料，非即時真實報價）" : "（來源：即時/近即時公開資料）",
      ].join("\n");
    } catch {
      // ignore, fall through to general answer
    }
  } else {
    try {
      const indices = await getIndices();
      grounding = indices
        .map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`)
        .join("\n");
    } catch {
      // ignore
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    return {
      answer: buildCannedAnswer(grounding, groundedSymbol),
      groundedSymbol,
      usedAi: false,
    };
  }

  const system = [
    "你是一個股票研究網站上的助理，回答繁體中文問題，語氣專業、精簡、條列清楚。",
    "你會拿到即時或近即時的報價資料作為參考依據，請根據資料回答，不要編造數字。",
    "如果資料標示為離線示範資料，請提醒使用者這只是示範用途，不是真實報價。",
    "務必提醒使用者：這是資訊整理，不構成投資建議。",
  ].join("\n");

  const userContent = grounding
    ? `參考資料：\n${grounding}\n\n使用者問題：${question}`
    : `使用者問題：${question}\n（目前沒有可用的參考資料，請根據一般金融知識簡短回答，並說明無法取得即時資料。）`;

  // Prefer Gemini (free tier) when both keys are configured.
  if (geminiKey) {
    try {
      const answer = await askGemini(system, userContent, geminiKey);
      return { answer, groundedSymbol, usedAi: true };
    } catch {
      // fall through to Anthropic (if configured) or the canned answer
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: userContent }],
      });

      const answer = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (answer) return { answer, groundedSymbol, usedAi: true };
    } catch {
      // fall through to the canned answer
    }
  }

  return { answer: buildCannedAnswer(grounding, groundedSymbol), groundedSymbol, usedAi: false };
}

function buildCannedAnswer(grounding: string, groundedSymbol?: string): string {
  const lines = [
    groundedSymbol ? `以下是關於 ${groundedSymbol} 的目前資料：` : "以下是目前的市場資料：",
    grounding || "（目前無法取得資料，可能是網路或資料源暫時無法連線。）",
    "",
    "提醒：AI 問答功能尚未設定 GEMINI_API_KEY 或 ANTHROPIC_API_KEY，以上僅為原始資料整理，並非 AI 生成的分析。設定金鑰後即可取得完整的 AI 問答回覆。",
    "本站資訊僅供參考，不構成投資建議。",
  ];
  return lines.join("\n");
}
