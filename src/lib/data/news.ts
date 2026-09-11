import { cached, fetchWithTimeout } from "./cache";

export interface NewsItem {
  title: string;
  source?: string;
  pubDate: string;
}

const NEWS_TTL_MS = 20 * 60_000; // headlines don't need second-by-second freshness

/**
 * Google News' RSS search — free, no API key, and (unlike scraping any one
 * publisher's site) a stable, documented URL shape that aggregates many
 * Chinese-language sources at once. This is what fills the "資訊面" gap the
 * AI used to have no source for at all (it only ever saw price/technical
 * data): callers pass a market or company query and get back recent
 * real headlines with real publish dates, never a fabricated summary of
 * "what's in the news."
 */
async function fetchNewsRaw(query: string, limit: number): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
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

/** Cached wrapper — same query within the TTL window shares one fetch. */
export async function fetchNews(query: string, limit = 6): Promise<NewsItem[]> {
  try {
    return await cached(`news:${query}`, NEWS_TTL_MS, () => fetchNewsRaw(query, limit));
  } catch {
    return [];
  }
}
