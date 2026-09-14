import { cached, peekCached, writeCached } from "@/lib/data/cache";
import { fetchNewsFeedPool, type NewsItem } from "@/lib/data/news";
import { getMultiSignalStocks } from "@/lib/data";
import { callAiProviders } from "@/lib/ai/provider";

export interface NewsFeedItem extends NewsItem {
  /** Derived from the item's own identity (link, or source+title when there
   *  is no link) — stable across cache regenerations, not fetch order. */
  id: string;
  /** AI-written plain-language "what this means" — pinned items get theirs
   *  from selectPinned() when the feed is generated; regular items get
   *  theirs lazily, one page at a time, from summarizeItems() below (see
   *  that function for why this can't just run over the whole pool up
   *  front). Absent only while a page's summaries haven't been requested
   *  yet or the AI call for them failed. */
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

const FEED_TTL_MS = 5 * 60_000; // matches fetchNewsFeedPool's own per-query news.ts cache cadence and the site-wide 5-min standard (see FUNDAMENTALS_TTL_MS in lib/data/index.ts)
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

// Deliberately NOT lowered to the site-wide 5-min refresh standard (see
// FUNDAMENTALS_TTL_MS in lib/data/index.ts): this caches an AI gloss of one
// specific, already-published headline's TEXT, which doesn't change once
// written — re-running the same summarization prompt on the same unchanged
// input 5 minutes later would just burn an AI call to get the same answer
// back. FEED_TTL_MS above (now 5 min) is what actually controls how soon a
// genuinely NEW headline shows up at all; this only governs how long an
// individual item's summary, once computed, is reused across that.
const ITEM_SUMMARY_TTL_MS = 12 * 60 * 60_000;
const SUMMARY_MAX_LEN = 100;

/**
 * Fills in `summary` for regular (non-pinned) feed items — a user asked for
 * every item to have one, not just the AI-curated pinned picks, but
 * summarizing the whole pool (several hundred items, regenerated every 20
 * minutes) up front would multiply the site's AI usage far beyond what the
 * free tier can sustain. Instead this runs lazily over whatever page the
 * API route actually serves: each item's summary is cached individually by
 * its own stable id (peekCached/writeCached, not the read-or-compute
 * `cached()` — see cache.ts for why), so a page is only ever summarized
 * once across its whole lifetime (repeat views, other visitors, even later
 * pool regenerations that happen to reintroduce the same still-recent
 * article all hit the cache), and only the items actually missing a cached
 * summary trigger a single batched AI call together.
 */
export async function summarizeItems(items: NewsFeedItem[]): Promise<NewsFeedItem[]> {
  const candidates = items.filter((item) => !item.summary && item.kind === "news");
  if (candidates.length === 0) return items;

  const cacheKey = (id: string) => `news-item-summary:${id}`;
  const peeked = await Promise.all(candidates.map((item) => peekCached<string>(cacheKey(item.id))));

  const missing: NewsFeedItem[] = [];
  const fromCache = new Map<string, string>();
  candidates.forEach((item, i) => {
    const hit = peeked[i];
    if (hit) fromCache.set(item.id, hit);
    else missing.push(item);
  });

  const fromAi = missing.length > 0 ? await summarizeBatch(missing) : new Map<string, string>();
  await Promise.all(
    Array.from(fromAi.entries()).map(([id, summary]) => writeCached(cacheKey(id), summary, ITEM_SUMMARY_TTL_MS))
  );

  return items.map((item) => {
    const summary = item.summary ?? fromCache.get(item.id) ?? fromAi.get(item.id);
    return summary ? { ...item, summary } : item;
  });
}

async function summarizeBatch(items: NewsFeedItem[]): Promise<Map<string, string>> {
  const listText = items.map((item, i) => `${i}. ${item.title}${item.source ? `（${item.source}）` : ""}`).join("\n");
  const system = [
    "你是財經新聞編輯，針對下面清單裡的每一則新聞標題，用繁體中文寫一句話（40字以內）白話說明這則新聞大概在講什麼，讓完全沒有股票背景的人也能一眼看懂重點，不要只是換句話重複標題本身，也不要加上投資建議。",
    '只能回傳一個 JSON 陣列本身，每個元素是 {"index": 編號, "summary": "重點摘要"}，順序或數量不用跟輸入一致，每一則清單裡的新聞都要有對應的一筆，不要有其他文字、說明或 markdown code block 標記。',
  ].join("\n");

  try {
    const result = await callAiProviders(system, [{ role: "user", content: `新聞清單：\n${listText}` }], {
      maxOutputTokens: Math.max(600, items.length * 60),
    });
    if (!result.usedAi) return new Map();
    const match = result.answer.match(/\[[\s\S]*\]/);
    if (!match) return new Map();
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return new Map();
    const map = new Map<string, string>();
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === "object" &&
        Number.isInteger(entry.index) &&
        entry.index >= 0 &&
        entry.index < items.length &&
        typeof entry.summary === "string" &&
        entry.summary.trim().length > 0
      ) {
        map.set(items[entry.index].id, entry.summary.trim().slice(0, SUMMARY_MAX_LEN));
      }
    }
    return map;
  } catch {
    return new Map();
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
