import { cached } from "@/lib/data/cache";
import { getIndices, searchStocks, getMultiSignalStocks, getChips } from "@/lib/data";
import { fetchNews, fetchUsMarketNews } from "@/lib/data/news";
import { formatSharesWithLots } from "@/lib/format";
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

// Chip data is only fetched for a handful of the day's biggest TW movers
// (not the whole market) — it's meant to give the brief a "why" behind the
// headline numbers (was a mover institution-driven or not), not to be a
// comprehensive chip-flow report on its own.
const CHIP_MOVERS_LIMIT = 5;

async function buildTwChipsSummary(
  twGainers: Array<{ name: string; symbol: string }>,
  twLosers: Array<{ name: string; symbol: string }>
): Promise<string> {
  const targets = [...twGainers.slice(0, CHIP_MOVERS_LIMIT), ...twLosers.slice(0, CHIP_MOVERS_LIMIT)];
  const lines = await Promise.all(
    targets.map(async (s) => {
      const chips = await getChips(s.symbol, "TW").catch(() => null);
      if (!chips?.institutionalNetShares) return null;
      return `${s.name}(${s.symbol})：三大法人${formatSharesWithLots(chips.institutionalNetShares)}`;
    })
  );
  const filtered = lines.filter((l): l is string => l !== null);
  return filtered.length > 0 ? filtered.join("\n") : "（今日主要漲跌個股無明顯法人籌碼資料）";
}

export async function getDailyBrief(forceRefresh = false): Promise<DailyBrief> {
  return cached(`daily-brief:${todayKeyTaipei()}`, BRIEF_TTL_MS, async () => {
    const [indices, twGainers, usGainers, twLosers, usLosers, twMomentum, usMomentum, twNews, usNews] =
      await Promise.all([
        getIndices(),
        searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
        searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
        searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "asc" }),
        searchStocks({ market: "US", sortBy: "changePercent", sortDir: "asc" }),
        getMultiSignalStocks("TW"),
        getMultiSignalStocks("US"),
        // Deliberately more than the chat's per-question news limit — Google
        // News' feed for a broad query like "台股"/"美股" naturally spans the
        // last several days, not just today, which is what lets the model
        // write the "近期重點" section below instead of just restating
        // today's numbers a second time.
        fetchNews("台股", 15).catch(() => []),
        fetchUsMarketNews(10).catch(() => []),
      ]);
    const chipsSummary = await buildTwChipsSummary(twGainers, twLosers);

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
      "",
      "【今日主要漲跌個股的三大法人籌碼動向（僅台股，股數已換算好對應張數，直接引用不要自己重算）】",
      chipsSummary,
      "",
      "【近期市場新聞（台股，依時間排序，可能橫跨最近幾天）】",
      twNews.length > 0 ? twNews.map((n) => `- [${n.pubDate.slice(0, 10)}] ${n.title}${n.source ? `（${n.source}）` : ""}`).join("\n") : "（無法取得）",
      "【近期市場新聞（美股，中英文來源混合，依時間排序，可能橫跨最近幾天）】",
      usNews.length > 0 ? usNews.map((n) => `- [${n.pubDate.slice(0, 10)}] ${n.title}${n.source ? `（${n.source}）` : ""}`).join("\n") : "（無法取得）",
    ].join("\n");

    const system = [
      "你是一個股票研究網站的市場快報撰稿人，用繁體中文寫一份「今日市場快報」。",
      "字數約550-800字，語氣客觀、專業、口語化，像深度一點的新聞摘要，分成四個部分，每部分前面用一行**粗體小標題**（例如「**大盤與台美連動**」），標題後才是內容，內容用換行分段、不用條列（第四部分除外，見下方）：",
      "第一部分「大盤與台美連動」：大盤整體表現（台股加權指數 + 美股道瓊/S&P/那斯達克），並具體分析台股與美股之間『為什麼』會有這樣的連動——盡量綜合大盤數字、新聞裡提到的具體事件（例如利率/通膨數據、特定產業消息）、以及籌碼資料（例如某檔權值股被外資大舉調節，是否呼應美股同族群的漲跌）三者一起講出因果關係，不要只講『有沒有關聯』這種空泛結論；真的沒有明顯關聯時才如實說沒有，不要牽拖。",
      "第二部分「台股焦點」：具體點名至少5-6檔漲跌幅顯著的個股並說明數字，其中只要「三大法人籌碼動向」資料裡有對應的股票，要把法人是買超還是賣超一併講進去，作為解釋這檔為什麼漲跌的其中一個線索（不是唯一原因）。",
      "第三部分「美股焦點」：具體點名至少5-6檔漲跌幅顯著的個股並說明數字；如果「技術訊號共振股」資料中有股票，可以自然帶到一兩檔，說明其同時出現哪些客觀技術訊號（例如爆量、站上均線），但只能描述「目前呈現的數據狀態」，絕對不能說這代表未來會漲或該買。",
      "第四部分「近期重點回顧」：這部分不是重複今天的漲跌數字，而是根據「近期市場新聞」兩份資料裡橫跨最近幾天的新聞標題與日期，整理出3-5個這幾天持續出現、值得關注的脈絡或主題（例如某個總經事件的後續發展、某產業的連續性消息、某公司連續幾天被提及的事件），用條列呈現，每點一行、簡短講清楚是什麼事件以及大概哪幾天出現，不要逐條複製新聞標題，也不要跟前三段的內容重複。新聞資料不足以整理出脈絡時，如實說明近期消息面相對平淡即可，不要硬湊。",
      "全文只描述現象與客觀關聯，絕對不要給出「建議買進/賣出/加碼/減碼」等任何操作建議或目標價，也不要用「值得買」「該賣」「即將噴出」「準備上漲」這類預測性或推薦性字眼。",
      "若參考資料中某部分標示為無法取得，請如實反映（例如略過或簡短說明查無資料），不要編造數字。",
      "結尾不需要再加免責聲明，網站會自動附上。",
    ].join("\n");

    // Longer timeout/output cap than the chat default: this now generates a
    // four-section, 550-800 word write-up (vs. a typical short chat answer)
    // from a bigger prompt, and it's never on a path a user is actively
    // staring at a spinner for — it runs via the daily Vercel Cron, or lazily
    // once for whoever is the first visitor after a cache-cold day (streamed
    // in client-side by DailyBriefCard, not blocking the rest of the
    // homepage), so trading some extra patience for a completed answer
    // instead of a premature abort is the right tradeoff here.
    // maxOutputTokens is generous relative to the ~550-800 *character* target
    // in the prompt: CJK text costs noticeably more tokens per character than
    // that budget first assumed (a live run got cut off mid-sentence at
    // 1600), and a completed answer is worth far more than saving a few
    // hundred unused tokens on a call that isn't latency-sensitive anyway.
    const result = await callAiProviders(system, [{ role: "user", content: `參考資料：\n${grounding}` }], {
      timeoutMs: 25000,
      maxOutputTokens: 3000,
    });

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
      `（AI 快報暫時無法產生：${(result.failureReason ?? "未知原因").replace(/。$/, "")}，以上為原始資料整理）`,
    ]
      .filter(Boolean)
      .join(" ");

    return { text: fallback, usedAi: false, generatedAt: new Date().toISOString() };
  }, { forceRefresh });
}
