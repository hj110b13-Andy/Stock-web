import { cached } from "@/lib/data/cache";
import { getIndices, searchStocks } from "@/lib/data";
import { callAiProviders } from "@/lib/ai/provider";

export interface DailyBrief {
  text: string;
  usedAi: boolean;
  generatedAt: string;
  isMockData: boolean;
}

// AI calls are relatively slow/rate-limited, and this content is meant to
// feel like a "daily" wrap rather than something recomputed on every page
// view, so cache it server-side well beyond the 20s quote TTL.
const BRIEF_TTL_MS = 20 * 60_000;

export async function getDailyBrief(): Promise<DailyBrief> {
  return cached("daily-brief", BRIEF_TTL_MS, async () => {
    const [indices, gainers, losers] = await Promise.all([
      getIndices(),
      searchStocks({ sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ sortBy: "changePercent", sortDir: "asc" }),
    ]);

    const isMockData = indices.some((i) => i.isMock) || gainers.some((i) => i.isMock);

    const grounding = [
      "【大盤概況（台股＋美股）】",
      indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n"),
      "",
      "【漲幅前5（台股＋美股合併排名）】",
      gainers.slice(0, 5).map((i) => `${i.name}(${i.symbol}, ${i.market === "TW" ? "台股" : "美股"})：${i.changePercent}%`).join("\n"),
      "",
      "【跌幅前5（台股＋美股合併排名）】",
      losers.slice(0, 5).map((i) => `${i.name}(${i.symbol}, ${i.market === "TW" ? "台股" : "美股"})：${i.changePercent}%`).join("\n"),
      isMockData ? "\n（注意：以上為離線示範資料，非真實即時報價）" : "",
    ].join("\n");

    const system = [
      "你是一個股票研究網站的市場快報撰稿人，用繁體中文寫一段簡短的「今日市場快報」。",
      "字數約150-220字，語氣客觀、專業、口語化，像新聞摘要，不要條列，用2-3段短敘述即可。",
      "內容需涵蓋：大盤整體表現、值得注意的漲跌幅股票、以及台股與美股之間可能的關聯（例如美股走勢是否牽動台股電子股），沒有明顯關聯時不要勉強牽拖。",
      "只描述現象與客觀關聯，絕對不要給出「建議買進/賣出/加碼/減碼」等任何操作建議或目標價，也不要用「值得買」「該賣」這類字眼。",
      "如果資料標示為離線示範資料，文中需自然提及這是示範資料、非真實報價。",
      "結尾不需要再加免責聲明，網站會自動附上。",
    ].join("\n");

    const result = await callAiProviders(system, `參考資料：\n${grounding}`);

    if (result.usedAi) {
      return { text: result.answer, usedAi: true, generatedAt: new Date().toISOString(), isMockData };
    }

    const topGainer = gainers[0];
    const topLoser = losers[0];
    const fallback = [
      `大盤：${indices.map((i) => `${i.name} ${i.change >= 0 ? "+" : ""}${i.changePercent}%`).join("、")}。`,
      topGainer ? `漲幅居首：${topGainer.name}(${topGainer.symbol}) ${topGainer.changePercent}%。` : "",
      topLoser ? `跌幅居首：${topLoser.name}(${topLoser.symbol}) ${topLoser.changePercent}%。` : "",
      isMockData ? "（以上為離線示範資料，非真實即時報價）" : "",
      `（AI 快報暫時無法產生：${result.failureReason ?? "未知原因"}，以上為原始資料整理）`,
    ]
      .filter(Boolean)
      .join(" ");

    return { text: fallback, usedAi: false, generatedAt: new Date().toISOString(), isMockData };
  });
}
