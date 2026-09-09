import { cached } from "@/lib/data/cache";
import { getIndices, searchStocks, getMultiSignalStocks } from "@/lib/data";
import { callAiProviders } from "@/lib/ai/provider";

export interface DailyBrief {
  text: string;
  usedAi: boolean;
  generatedAt: string;
}

// AI calls are relatively slow/rate-limited, and this content is meant to
// feel like a "daily" wrap rather than something recomputed on every page
// view. Keyed by Taiwan-local calendar date so it's generated once per day
// (a Vercel Cron job pre-warms it each morning — see api/cron/daily-brief)
// and stays stable for everyone visiting that day instead of rolling every
// 20 minutes.
const BRIEF_TTL_MS = 25 * 60 * 60_000; // outlives a day; the date-keyed cache key is what actually rotates it

function todayKeyTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function listStocks(items: Array<{ name: string; symbol: string; changePercent: number }>): string {
  return items.map((i) => `${i.name}(${i.symbol})：${i.changePercent >= 0 ? "+" : ""}${i.changePercent}%`).join("、");
}

export async function getDailyBrief(): Promise<DailyBrief> {
  return cached(`daily-brief:${todayKeyTaipei()}`, BRIEF_TTL_MS, async () => {
    const [indices, twGainers, usGainers, twLosers, usLosers, twMomentum, usMomentum] = await Promise.all([
      getIndices(),
      searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "asc" }),
      searchStocks({ market: "US", sortBy: "changePercent", sortDir: "asc" }),
      getMultiSignalStocks("TW"),
      getMultiSignalStocks("US"),
    ]);

    const grounding = [
      "【大盤概況（台股＋美股）】",
      indices.length > 0
        ? indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n")
        : "（大盤指數目前無法取得）",
      "",
      "【台股漲幅前8】", listStocks(twGainers.slice(0, 8)),
      "【台股跌幅前8】", listStocks(twLosers.slice(0, 8)),
      "",
      "【美股漲幅前8】", listStocks(usGainers.slice(0, 8)),
      "【美股跌幅前8】", listStocks(usLosers.slice(0, 8)),
      "",
      "【台股技術訊號共振股（同時符合2個以上客觀技術訊號，如爆量、站上均線、連漲）】",
      twMomentum.length > 0
        ? twMomentum.slice(0, 6).map((i) => `${i.name}(${i.symbol})：${i.signals.map((s) => s.label).join("、")}`).join("\n")
        : "（今日無）",
      "【美股技術訊號共振股】",
      usMomentum.length > 0
        ? usMomentum.slice(0, 6).map((i) => `${i.name}(${i.symbol})：${i.signals.map((s) => s.label).join("、")}`).join("\n")
        : "（今日無）",
    ].join("\n");

    const system = [
      "你是一個股票研究網站的市場快報撰稿人，用繁體中文寫一份「今日市場快報」。",
      "字數約280-400字，語氣客觀、專業、口語化，像新聞摘要，分成三個小段落（用換行分段，不用條列）：",
      "第一段：大盤整體表現（台股加權指數 + 美股道瓊/S&P/那斯達克），以及台股與美股之間可能的關聯（例如美股夜盤走勢是否牽動台股電子/半導體權值股），沒有明顯關聯時不要勉強牽拖。",
      "第二段：台股焦點，具體點名至少4-5檔漲跌幅顯著的個股並簡短說明數字。",
      "第三段：美股焦點，具體點名至少4-5檔漲跌幅顯著的個股並簡短說明數字；如果「技術訊號共振股」資料中有股票，可以自然帶到一兩檔，說明其同時出現哪些客觀技術訊號（例如爆量、站上均線），但只能描述「目前呈現的數據狀態」，絕對不能說這代表未來會漲或該買。",
      "全文只描述現象與客觀關聯，絕對不要給出「建議買進/賣出/加碼/減碼」等任何操作建議或目標價，也不要用「值得買」「該賣」「即將噴出」「準備上漲」這類預測性或推薦性字眼。",
      "若參考資料中某部分標示為無法取得，請如實反映（例如略過或簡短說明查無資料），不要編造數字。",
      "結尾不需要再加免責聲明，網站會自動附上。",
    ].join("\n");

    const result = await callAiProviders(system, [{ role: "user", content: `參考資料：\n${grounding}` }]);

    if (result.usedAi) {
      return { text: result.answer, usedAi: true, generatedAt: new Date().toISOString() };
    }

    const fallback = [
      indices.length > 0
        ? `大盤：${indices.map((i) => `${i.name} ${i.change >= 0 ? "+" : ""}${i.changePercent}%`).join("、")}。`
        : "大盤指數目前無法取得。",
      twGainers[0] ? `台股漲幅居首：${twGainers[0].name}(${twGainers[0].symbol}) ${twGainers[0].changePercent}%。` : "",
      usGainers[0] ? `美股漲幅居首：${usGainers[0].name}(${usGainers[0].symbol}) ${usGainers[0].changePercent}%。` : "",
      twLosers[0] ? `台股跌幅居首：${twLosers[0].name}(${twLosers[0].symbol}) ${twLosers[0].changePercent}%。` : "",
      usLosers[0] ? `美股跌幅居首：${usLosers[0].name}(${usLosers[0].symbol}) ${usLosers[0].changePercent}%。` : "",
      `（AI 快報暫時無法產生：${result.failureReason ?? "未知原因"}，以上為原始資料整理）`,
    ]
      .filter(Boolean)
      .join(" ");

    return { text: fallback, usedAi: false, generatedAt: new Date().toISOString() };
  });
}
