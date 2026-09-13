import { cached } from "@/lib/data/cache";
import { fetchNewsFeedPool, type NewsItem } from "@/lib/data/news";
import { getMultiSignalStocks } from "@/lib/data";
import { callAiProviders } from "@/lib/ai/provider";

export interface NewsFeedItem extends NewsItem {
  /** Derived from the item's own identity (link, or source+title when there
   *  is no link) — stable across cache regenerations, not fetch order. */
  id: string;
  /** AI-written plain-language "what this means" — only ever set on pinned
   *  items (see MAX_PINNED); running this for the whole pool (hundreds of
   *  items per generation) isn't affordable on the free AI tier this site
   *  runs on, and the ordinary feed is skimmable by headline alone. */
  summary?: string;
  /** "data" items are this site's own computed figures (technical signals,
   *  institutional flow), not scraped news — `link` points at our own
   *  /stock page rather than an external publisher, and the UI renders
   *  them accordingly ("查看個股" not "查看原文"). */
  kind: "news" | "data";
}

export interface NewsFeed {
  /** Items the AI judged genuinely market-moving (rate decisions, geopolitical
   *  shocks, systemic risk, a mega-cap event big enough to move the whole
   *  index) — never padded to hit a target count; can be empty on a quiet
   *  day. Excluded from `items` so nothing appears twice. */
  pinned: NewsFeedItem[];
  /** Everything else, newest first. */
  items: NewsFeedItem[];
  generatedAt: string;
}

const FEED_TTL_MS = 20 * 60_000; // matches fetchNewsFeedPool's own per-query news.ts cache cadence
const PIN_CANDIDATE_COUNT = 60; // how many of the freshest pool items the AI even considers
const MAX_PINNED = 8;
// How many of each market's technical-signal stocks become "data cards" —
// small on purpose: this feed's job is breadth of real headlines, not a
// second copy of /highlights. See buildDataCards().
const DATA_CARD_COUNT_PER_MARKET = 5;

interface PinnedPick {
  index: number;
  summary: string;
}

/**
 * Asks the AI to pick, from the freshest slice of the pool, which headlines
 * rise to "could move the whole market" — a judgment call no keyword/source
 * heuristic can make reliably (a company-specific headline can be market-
 * moving if it's TSMC, and macro-sounding words appear in plenty of routine
 * stories too) — and to write a short plain-language "what this means"
 * summary for each pick. Returns pool indices rather than reconstructed
 * titles, so there's no risk of the model paraphrasing a headline into
 * something that no longer matches the original item; only `summary` is
 * genuinely AI-authored text.
 */
async function selectPinned(candidates: NewsItem[]): Promise<PinnedPick[]> {
  if (candidates.length === 0) return [];
  const listText = candidates
    .map((item, i) => `${i}. [${item.pubDate.slice(0, 16).replace("T", " ")}] ${item.title}${item.source ? `（${item.source}）` : ""}`)
    .join("\n");
  const system = [
    "你是財經新聞編輯，任務是從下面這份新聞標題清單中，挑出真正屬於「重大消息、可能影響整個台股或美股大盤走勢」等級的新聞——例如央行利率決策、地緣政治衝突、系統性金融風險、重大天災、對整體市場有系統性影響的政策或事件，或是大到足以牽動整個大盤的權值股（例如台積電、蘋果）的重大事件。",
    "一般個股利多利空、單一公司財報、產業內部消息，即使標題聳動，也不算這個等級。",
    "只能從清單的編號中選，不能自己編造清單以外的新聞。清單裡如果真的沒有夠格的大消息，就回傳空陣列，不要為了湊數勉強挑選一般新聞。",
    `最多選 ${MAX_PINNED} 則，依重要性排序，最重要的排第一。`,
    "針對每一則入選的新聞，用繁體中文寫一句話（60字以內）白話說明「這則消息大概在講什麼、可能造成什麼影響」，不要只是重複標題，也不要下單一方向的操作建議，只描述可能的影響方向（例如：可能推升台幣資金外流壓力、可能提振半導體類股信心）。",
    '只能回傳一個 JSON 陣列本身，每個元素是 {"index": 編號, "summary": "重點摘要"}，例如 [{"index":3,"summary":"..."}] 或空陣列 []，不要有任何其他文字、說明或 markdown code block 標記。',
  ].join("\n");

  const result = await callAiProviders(system, [{ role: "user", content: `新聞清單：\n${listText}` }], {
    maxOutputTokens: 1000,
  });
  if (!result.usedAi) return [];

  const match = result.answer.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is PinnedPick =>
          p &&
          typeof p === "object" &&
          Number.isInteger(p.index) &&
          p.index >= 0 &&
          p.index < candidates.length &&
          typeof p.summary === "string" &&
          p.summary.trim().length > 0
      )
      .map((p) => ({ index: p.index, summary: p.summary.trim().slice(0, 150) }))
      .slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

/**
 * "不能只依賴新聞" — real, already-trusted structured data (technical
 * signals computed from actual price/volume history, same engine as
 * /highlights) mixed into the feed as its own item type, not another
 * headline paraphrase. Deliberately small and deliberately reusing existing,
 * already-verified data functions rather than standing up a new source —
 * broader dimensions (法說會/供應鏈/總體經濟/期權 from the 8-面向 reference)
 * would each need a genuinely new pipeline and are tracked separately, not
 * attempted here.
 */
async function buildDataCards(): Promise<NewsItem[]> {
  try {
    const [twMomentum, usMomentum] = await Promise.all([
      getMultiSignalStocks("TW").catch(() => []),
      getMultiSignalStocks("US").catch(() => []),
    ]);
    const now = new Date().toISOString();
    const cards: NewsItem[] = [];
    for (const s of twMomentum.slice(0, DATA_CARD_COUNT_PER_MARKET)) {
      cards.push({
        title: `${s.name}(${s.symbol}) 現價 ${s.price}（${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%）：${s.signals.map((sig) => sig.label).join("、")}`,
        source: "StockRadar 技術訊號（真實數據，非新聞）",
        pubDate: now,
        link: `/stock/${s.symbol}?market=TW`,
      });
    }
    for (const s of usMomentum.slice(0, DATA_CARD_COUNT_PER_MARKET)) {
      cards.push({
        title: `${s.name}(${s.symbol}) ${s.price}（${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%）: ${s.signals.map((sig) => sig.label).join(", ")}`,
        source: "StockRadar 技術訊號（真實數據，非新聞）",
        pubDate: now,
        link: `/stock/${s.symbol}?market=US`,
      });
    }
    return cards;
  } catch {
    return [];
  }
}

export async function getNewsFeed(forceRefresh = false): Promise<NewsFeed> {
  return cached(
    // Bumped from v1: the cached shape changed (summary/kind fields), so a
    // stale v1 entry read back after deploy would be missing them rather
    // than erroring — a fresh key just makes that a clean cache miss.
    "news-feed:v2",
    FEED_TTL_MS,
    async () => {
      const [newsPool, dataCards] = await Promise.all([fetchNewsFeedPool(), buildDataCards()]);
      const merged = [...dataCards, ...newsPool].sort((a, b) => b.pubDate.localeCompare(a.pubDate));

      const withIds: NewsFeedItem[] = merged.map((item) => ({
        ...item,
        id: item.link ?? `${item.source ?? ""}|${item.title}`,
        kind: item.link?.startsWith("/stock/") ? "data" : "news",
      }));

      const picks = await selectPinned(merged.slice(0, PIN_CANDIDATE_COUNT)).catch(() => []);
      const pinnedIndexSet = new Set(picks.map((p) => p.index));

      const pinned = picks
        .map((p): NewsFeedItem | undefined => (withIds[p.index] ? { ...withIds[p.index], summary: p.summary } : undefined))
        .filter((item): item is NewsFeedItem => item !== undefined);
      const items = withIds.filter((_, i) => !pinnedIndexSet.has(i));

      return { pinned, items, generatedAt: new Date().toISOString() };
    },
    { forceRefresh }
  );
}
