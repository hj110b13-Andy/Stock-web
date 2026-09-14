import { cached } from "@/lib/data/cache";
import { describeTaifexNightFutures, getIndices, getMultiSignalStocks, getTaifexNightFutures, getChips } from "@/lib/data";
import { getNewsFeed } from "@/lib/ai/newsfeed";
import { formatSharesWithLots } from "@/lib/format";
import { callAiProviders } from "@/lib/ai/provider";

export interface ActionBrief {
  text: string;
  usedAi: boolean;
  generatedAt: string;
}

// This is "right now" advice — a plain rolling TTL keeps it from going
// stale mid-session while still sharing one computed result across everyone
// visiting within the same window. Tightened from 20 minutes to the
// site-wide 5-min standard applied across every cache on the site (see
// FUNDAMENTALS_TTL_MS in lib/data/index.ts) — also now matches
// getNewsFeed's own 5-min cadence again, so most calls here still just read
// its existing cache rather than recomputing it.
const ACTION_BRIEF_TTL_MS = 5 * 60_000;

// Chip data is only pulled for a handful of the day's biggest TW momentum
// names, same reasoning/limit as brief.ts's buildTwChipsSummary — this is
// meant to add a "why" behind a couple of concrete picks, not to be a
// comprehensive chip-flow report.
const CHIP_TARGETS_LIMIT = 5;
const MOMENTUM_LIMIT = 8;

function listMomentum(items: Array<{ name: string; symbol: string; changePercent: number; signals: Array<{ label: string }> }>): string {
  return items
    .map((i) => `${i.name}(${i.symbol})：${i.changePercent >= 0 ? "+" : ""}${i.changePercent}%，訊號：${i.signals.map((s) => s.label).join("、")}`)
    .join("\n");
}

async function buildTwChipsSummary(
  twMomentum: Array<{ name: string; symbol: string }>
): Promise<string> {
  const targets = twMomentum.slice(0, CHIP_TARGETS_LIMIT);
  const lines = await Promise.all(
    targets.map(async (s) => {
      const chips = await getChips(s.symbol, "TW").catch(() => null);
      if (!chips?.institutionalNetShares) return null;
      return `${s.name}(${s.symbol})：三大法人${formatSharesWithLots(chips.institutionalNetShares)}`;
    })
  );
  const filtered = lines.filter((l): l is string => l !== null);
  return filtered.length > 0 ? filtered.join("\n") : "（今日主要動能個股無明顯法人籌碼資料）";
}

export async function getActionBrief(forceRefresh = false): Promise<ActionBrief> {
  return cached(
    "action-brief:v1",
    ACTION_BRIEF_TTL_MS,
    async () => {
      const [indices, taifexFutures, twMomentum, usMomentum, newsFeed] = await Promise.all([
        getIndices(),
        getTaifexNightFutures().catch(() => null),
        getMultiSignalStocks("TW"),
        getMultiSignalStocks("US"),
        getNewsFeed().catch(() => ({ pinned: [], items: [], generatedAt: new Date().toISOString() })),
      ]);
      const chipsSummary = await buildTwChipsSummary(twMomentum);

      const grounding = [
        "【大盤概況（台股＋美股）】",
        indices.length > 0
          ? indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n")
          : "（大盤指數目前無法取得）",
        describeTaifexNightFutures(taifexFutures),
        "",
        "【台股技術訊號共振股（同時符合2個以上客觀技術訊號，如爆量、站上均線、連漲）】",
        twMomentum.length > 0 ? listMomentum(twMomentum.slice(0, MOMENTUM_LIMIT)) : "（今日無）",
        "【美股技術訊號共振股】",
        usMomentum.length > 0 ? listMomentum(usMomentum.slice(0, MOMENTUM_LIMIT)) : "（今日無）",
        "",
        "【台股主要動能個股的三大法人籌碼動向（股數已換算好對應張數，直接引用不要自己重算）】",
        chipsSummary,
        "",
        "【近期重大消息（AI 已判斷為可能影響整體大盤等級）】",
        newsFeed.pinned.length > 0
          ? newsFeed.pinned.map((n) => `- ${n.title}${n.summary ? `：${n.summary}` : ""}`).join("\n")
          : "（目前沒有夠格的重大消息）",
      ].join("\n");

      const system = [
        "你是一個股票研究網站的「今日建議」撰稿人，目標讀者是完全沒有股票/金融背景的一般人，看完要能馬上知道今天大概該怎麼看待市場、該注意什麼——這不是給專業投資人看的深度分析，用詞務必白話。",
        "任何專有名詞或技術指標（例如 RSI、三大法人、本益比、MACD、KD、布林通道、融資、均線、爆量）只要用到，一定要在句子裡順便用幾個字白話解釋是什麼意思，不能假設讀者已經懂，也不要另外開一段解釋，直接融入句子裡講清楚。",
        "籌碼面的詞彙實測特別容易漏解釋：『三大法人』第一次出現時一定要附帶解釋『（外資、投信、自營商這些大戶）』，『外資』第一次出現要附帶解釋『（外國機構投資人）』，『投信』要附帶『（國內基金公司）』，『融資』要附帶『（跟券商借錢買股票）』，如果提到『0軸』要附帶『（判斷多空力道強弱的分界線）』——這條規則優先於字數上限，就算為了塞這句解釋超過字數上限也要保留，同一篇裡第一次出現才需要附帶解釋，同一個詞後面重複出現不用每次都解釋一遍。",
        "分析漲跌原因時不要每次都只講『升息/降息』，視資料情況也可以考慮其他常見的間接影響（例如美債殖利率、匯率、油價、半導體庫存週期），但只在資料能支撐、真的合理連結時才用，不要硬套或無中生有；真的要談升息，一句話帶到階段或產業差異就好（例如『現在還在升息初期，震盪是正常的』『科技股通常比金融股更受影響』），不要展開完整框架佔掉篇幅。",
        "字數控制在200-350字，這是硬性上限不是參考值，寫超過表示廢話太多，要精簡掉。所有數字一律用阿拉伯數字加符號（例如 1.6%、3,800張、87%），不要寫成中文數字或大寫（不要寫「百分之一點六」「三千八百張」「八十七趴」這種讀起來反而更慢的寫法）。語氣直接、明確，不要用「不確定」「可能吧」「僅供參考」這類模糊、迴避表態的說法——這個網站只有你（開發者）跟家人知道密碼才能進來，不是對外公開的服務，可以直接給明確的個人看法或建議（例如「我覺得現在比較適合觀望」「這幾檔我會留意」），不用每次都加但書。",
        "內容分三個部分，用短段落/條列呈現，不要寫成一大段長文：",
        "1. 第一句話：用一句白話講今天大盤整體氣氛（例如「今天大盤震盪，投資人觀望氣氛重」），不要一開頭就丟指數數字。",
        "2. 3-5 條具體重點，每條都要點名「今日焦點數據」裡真實存在的個股名稱加一句話理由（例如某檔為什麼值得留意：出現什麼技術訊號、法人在買超還是賣超），或引用一則真實的重大消息講它的影響——絕對不要用「留意半導體類股」「關注科技股動向」這種沒有點名具體股票、任何人不用看盤都講得出來的空泛說法，資料夠支撐才點名，資料裡沒有的股票不要編。",
        "3. 最後一句話：白話講一個風險或提醒（例如「這幾天要注意 OO 公布利率決策，市場可能波動變大」），資料裡沒有明顯風險事件時就給一個根據現況的合理提醒，不要硬掰具體事件。",
        "只能使用參考資料中的真實數字與名稱，絕對不要編造股票、數字或事件；如果某部分資料明顯不足，就直接說資料有限、簡短帶過即可，不要硬湊字數。",
        "結尾不需要再加免責聲明，網站會自動附上。",
      ].join("\n");

      // Not on a blocking user-wait path (client-fetched, not SSR-blocking),
      // so generous room is worth trading for a completed, non-truncated
      // answer — same reasoning as brief.ts's maxOutputTokens. CJK text costs
      // noticeably more tokens per character than a naive character-count
      // estimate assumes (see PROGRESS.md's truncation-bug lesson), so this
      // stays well above what a 200-350 character target would suggest.
      const result = await callAiProviders(system, [{ role: "user", content: `參考資料：\n${grounding}` }], {
        timeoutMs: 20000,
        maxOutputTokens: 1200,
      });

      if (result.usedAi) {
        return { text: result.answer, usedAi: true, generatedAt: new Date().toISOString() };
      }

      const topTwMomentum = twMomentum[0];
      const topUsMomentum = usMomentum[0];
      const fallback = [
        indices.length > 0
          ? `大盤：${indices.map((i) => `${i.name} ${i.change >= 0 ? "+" : ""}${i.changePercent}%`).join("、")}。`
          : "大盤指數目前無法取得。",
        topTwMomentum
          ? `台股目前技術面較突出：${topTwMomentum.name}(${topTwMomentum.symbol})，訊號：${topTwMomentum.signals.map((s) => s.label).join("、")}。`
          : "",
        topUsMomentum
          ? `美股目前技術面較突出：${topUsMomentum.name}(${topUsMomentum.symbol})，訊號：${topUsMomentum.signals.map((s) => s.label).join("、")}。`
          : "",
        `（AI 建議暫時無法產生：${(result.failureReason ?? "未知原因").replace(/。$/, "")}，以上為原始資料整理）`,
      ]
        .filter(Boolean)
        .join(" ");

      return { text: fallback, usedAi: false, generatedAt: new Date().toISOString() };
    },
    { forceRefresh }
  );
}
