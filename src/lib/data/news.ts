import { cached, fetchWithTimeout } from "./cache";

export interface NewsItem {
  title: string;
  source?: string;
  pubDate: string;
}

const NEWS_TTL_MS = 20 * 60_000; // headlines don't need second-by-second freshness

/** Which Google News regional edition to search — each surfaces a different
 *  set of outlets (zh-TW pulls in Chinese-language financial media, en-US
 *  pulls in English-language wires like Reuters/Bloomberg/MarketWatch that
 *  the zh-TW edition mostly doesn't carry), not just a translation of the
 *  same underlying stories. */
type NewsLocale = "zh-TW" | "en-US";

const LOCALE_QUERY_PARAMS: Record<NewsLocale, string> = {
  "zh-TW": "hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
  "en-US": "hl=en-US&gl=US&ceid=US:en",
};

/**
 * Google News' RSS search — free, no API key, and (unlike scraping any one
 * publisher's site) a stable, documented URL shape that aggregates many
 * sources at once. This is what fills the "資訊面" gap the AI used to have
 * no source for at all (it only ever saw price/technical data): callers
 * pass a market or company query and get back recent real headlines with
 * real publish dates, never a fabricated summary of "what's in the news."
 */
async function fetchNewsRaw(query: string, limit: number, locale: NewsLocale): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${LOCALE_QUERY_PARAMS[locale]}`;
  const res = await fetchWithTimeout(url, 6000, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const xml = await res.text();
  return parseRssItems(xml, limit);
}

/**
 * Deliberately not a general XML parser — Google News' RSS is a flat,
 * predictable <item><title>/<pubDate></item> structure with no nesting, so
 * a couple of regexes cover it without pulling in an XML/RSS library for
 * one feed shape.
 */
function parseRssItems(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while (items.length < limit && (match = itemRegex.exec(xml))) {
    const block = match[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    if (!rawTitle) continue;
    const title = decodeXmlEntities(rawTitle);
    // Google News titles end with " - <source>" (e.g. "... - finance.ettoday.net").
    const sourceMatch = title.match(/^(.*) - ([^-]+)$/);
    items.push({
      title: sourceMatch ? sourceMatch[1].trim() : title,
      source: sourceMatch ? sourceMatch[2].trim() : undefined,
      pubDate: pubDate ? new Date(pubDate).toISOString() : "",
    });
  }
  return items;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Cached wrapper — same query+locale within the TTL window shares one fetch. */
export async function fetchNews(query: string, limit = 6, locale: NewsLocale = "zh-TW"): Promise<NewsItem[]> {
  try {
    return await cached(`news:${locale}:${query}`, NEWS_TTL_MS, () => fetchNewsRaw(query, limit, locale));
  } catch {
    return [];
  }
}

/**
 * Fetches the same query across several Google News regional editions in
 * parallel and merges them, de-duplicated by title — used for US stocks/
 * market news so the grounding gets genuine English-language wire coverage
 * (Reuters/Bloomberg/MarketWatch etc.) alongside zh-TW coverage, not just
 * one edition's view of "what's in the news."
 */
export async function fetchNewsMulti(query: string, perLocaleLimit: number, locales: NewsLocale[]): Promise<NewsItem[]> {
  const lists = await Promise.all(locales.map((locale) => fetchNews(query, perLocaleLimit, locale)));
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of lists.flat()) {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
