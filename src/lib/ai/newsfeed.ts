import { cached } from "@/lib/data/cache";
import { fetchNewsFeedPool, type NewsItem } from "@/lib/data/news";
import { callAiProviders } from "@/lib/ai/provider";

export interface NewsFeedItem extends NewsItem {
  /** Position in that generation's sorted pool — stable within one cached
   *  generation (used as the React list key and to reference pinned picks
   *  back to the AI's selection), not a durable cross-generation id. */
  id: string;
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

/**
 * Asks the AI to pick, from the freshest slice of the pool, which headlines
 * rise to "could move the whole market" — a judgment call no keyword/source
 * heuristic can make reliably (a company-specific headline can be market-
 * moving if it's TSMC, and macro-sounding words appear in plenty of routine
 * stories too). Returns pool indices, not reconstructed text, so there's no
 * risk of the model paraphrasing a title into something that no longer
 * matches the original item.
 */
async function selectPinnedIndices(candidates: NewsItem[]): Promise<number[]> {
  if (candidates.length === 0) return [];
  const listText = candidates
    .map((item, i) => `${i}. [${item.pubDate.slice(0, 16).replace("T", " ")}] ${item.title}${item.source ? `（${item.source}）` : ""}`)
    .join("\n");
  const system = [
    "你是財經新聞編輯，任務是從下面這份新聞標題清單中，挑出真正屬於「重大消息、可能影響整個台股或美股大盤走勢」等級的新聞——例如央行利率決策、地緣政治衝突、系統性金融風險、重大天災、對整體市場有系統性影響的政策或事件，或是大到足以牽動整個大盤的權值股（例如台積電、蘋果）的重大事件。",
    "一般個股利多利空、單一公司財報、產業內部消息，即使標題聳動，也不算這個等級。",
    "只能從清單的編號中選，不能自己編造清單以外的新聞。清單裡如果真的沒有夠格的大消息，就回傳空陣列，不要為了湊數勉強挑選一般新聞。",
    `最多選 ${MAX_PINNED} 則，依重要性排序，最重要的排第一。`,
    "只能回傳一個 JSON 陣列本身，例如 [3,10,22] 或 []，不要有任何其他文字、說明或 markdown code block 標記。",
  ].join("\n");

  const result = await callAiProviders(system, [{ role: "user", content: `新聞清單：\n${listText}` }], {
    maxOutputTokens: 300,
  });
  if (!result.usedAi) return [];

  const match = result.answer.match(/\[[\s\d,]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < candidates.length).slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

export async function getNewsFeed(forceRefresh = false): Promise<NewsFeed> {
  return cached(
    "news-feed:v1",
    FEED_TTL_MS,
    async () => {
      const pool = await fetchNewsFeedPool();
      const withIds: NewsFeedItem[] = pool.map((item, i) => ({ ...item, id: String(i) }));

      const pinnedIndices = await selectPinnedIndices(pool.slice(0, PIN_CANDIDATE_COUNT)).catch(() => []);
      const pinnedSet = new Set(pinnedIndices);
      const pinned = pinnedIndices.map((i) => withIds[i]).filter((item): item is NewsFeedItem => item !== undefined);
      const items = withIds.filter((_, i) => !pinnedSet.has(i));

      return { pinned, items, generatedAt: new Date().toISOString() };
    },
    { forceRefresh }
  );
}
