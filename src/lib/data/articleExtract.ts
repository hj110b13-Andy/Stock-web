const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Deliberately NOT cache.ts's `fetchWithTimeout`: that helper clears its
 * abort timer in a `finally` right after the `fetch()` call resolves — which
 * the Fetch API does once response headers arrive, before the body is fully
 * downloaded — so its timeout only bounds connecting, not reading the body.
 * That's fine for the small JSON responses its other callers deal with, but
 * this file's own pages are not small (Google's interstitial page alone ran
 * ~570-590KB in real testing, and arbitrary publisher article pages can be
 * larger still), so a slow body download here needs to be covered by the
 * same deadline as the request itself — hence a local variant that keeps the
 * abort armed across both the fetch and the `.text()` read.
 */
async function fetchTextWithDeadline(url: string, timeoutMs: number, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Real article body text needs a real browser-like text/html Accept header —
// some publishers (observed: a few Yahoo/Taiwanese finance sites) serve a
// stripped-down or different response to requests that look like a bot/API
// client, same reasoning as the User-Agent above.
const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** Below this length, treat extraction as failed — a near-empty scrape (nav
 *  leftovers, a single caption) is worse than the honest headline-only
 *  fallback because it would produce a confidently-worded summary of almost
 *  nothing. Chosen empirically: real article bodies in the test sample ran
 *  400-9000 chars; genuine failures (blocked/listing pages) landed at 0. */
const MIN_TEXT_LEN = 200;

/** Caps how much of one article's text goes into the summarization prompt —
 *  this runs per item in a batch (see newsfeed.ts summarizeBatch), so an
 *  unbounded per-item length would multiply badly with batch size. A lede +
 *  first several paragraphs is plenty for a one-sentence summary; trimmed at
 *  a paragraph boundary where possible so it doesn't cut mid-sentence. */
const MAX_TEXT_LEN = 1500;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x22;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Google News' RSS <link> (e.g. https://news.google.com/rss/articles/CBMi...)
 * is not the publisher URL — it's an opaque id that Google's own front-end
 * resolves client-side via JS. Verified empirically (2026-09): the article
 * id no longer directly base64-decodes to a URL (Google changed this at some
 * point — the old "just base64-decode the id" trick now yields another
 * opaque token, not a link). What still works today: the interstitial page
 * at that same URL embeds a per-request timestamp (`data-n-a-ts`) and
 * signature (`data-n-a-sg`); POSTing those plus the article id to Google's
 * internal batchexecute RPC endpoint (`Fbv4je`, undocumented but stable
 * enough to be relied on by several open-source Google News decoders) returns
 * the real publisher URL. This is Google's own mechanism, reverse-engineered
 * from what the interstitial page's JS itself does — not a bypass of any
 * access control (the interstitial is public, unauthenticated HTML).
 */
async function resolveArticleUrl(googleNewsLink: string): Promise<string | null> {
  const idMatch = googleNewsLink.match(/\/articles\/([^?]+)/);
  if (!idMatch) return null;
  const articleId = idMatch[1];

  let html: string;
  try {
    html = await fetchTextWithDeadline(`https://news.google.com/rss/articles/${articleId}?oc=5&hl=en-US&gl=US&ceid=US:en`, 2500, {
      headers: { "User-Agent": UA },
    });
  } catch {
    return null;
  }

  const ts = html.match(/data-n-a-ts="(\d+)"/)?.[1];
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  if (!ts || !sg) return null;

  const innerReq = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    articleId,
    ts,
    sg,
  ]);
  const freq = JSON.stringify([[["Fbv4je", innerReq, null, "generic"]]]);

  try {
    const text = await fetchTextWithDeadline(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&source-path=%2Frss%2Farticles%2F&hl=en-US&gl=US",
      2000,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": UA,
        },
        body: new URLSearchParams({ "f.req": freq }).toString(),
      }
    );
    // Response is Google's "anti-JSON-hijacking" batchexecute format: a
    // `)]}'` prefix line, then one JSON array per RPC response. We only sent
    // one RPC, so find the line that actually carries its payload.
    const jsonLine = text.split("\n").find((l) => l.includes("garturlres"));
    if (!jsonLine) return null;
    const outer = JSON.parse(jsonLine);
    const payload = JSON.parse(outer[0][2]);
    const realUrl = payload[1];
    return typeof realUrl === "string" && /^https?:\/\//.test(realUrl) ? realUrl : null;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

// Lines that are real boilerplate rather than article content, observed
// across the real publishers this site's feed actually surfaces (工商時報's
// "copied to clipboard" prompt, generic share/subscribe/related-reading
// teasers). Deliberately just a denylist of clearly-generic openers, not an
// attempt at exhaustive site-specific scraping rules — see MIN_TEXT_LEN for
// why an imperfect filter here is fine (a few boilerplate lines slipping
// through still leaves a usable summary; this only needs to catch the
// common cases well enough that they don't dominate a short article).
const BOILERPLATE_PATTERNS = [
  /^已將目前網頁的網址複製到您的剪貼簿/,
  /^(延伸閱讀|更多新聞|相關新聞|看更多|閱讀更多|分享至|訂閱|訂閱電子報|加入好友)/,
  /^(Read more|Related|Share this|Subscribe|Sign up|Copyright|All rights reserved)/i,
  /^©/,
];

/**
 * Heuristic main-content extraction: strip non-content structural tags, take
 * every <p> block, drop obvious boilerplate/too-short fragments, join what's
 * left. Deliberately not a full readability-style algorithm (no DOM, no
 * content-density scoring) — validated empirically against a real, diverse
 * 22-article sample spanning Taiwanese and US financial publishers (UDN,
 * Yahoo, 工商時報, 自由財經, 中央社, 經濟日報, ETtoday, 今周刊, CNBC, and
 * others) and got usable text on 18/22 (82%), with the 4 misses being
 * genuine bot-blocks (HTTP 403) or listing/category pages with no <p> body —
 * exactly the cases the headline-only fallback exists for, not something a
 * fancier parser would recover for free. Given that result, the added
 * complexity and per-request DOM-parsing cost of @mozilla/readability+jsdom
 * wasn't justified — see newsfeed.ts's summarizeItems for the fallback path.
 */
function extractMainText(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");

  const paragraphs: string[] = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(cleaned))) {
    const t = stripTags(m[1]);
    if (t.length < 15) continue;
    if (BOILERPLATE_PATTERNS.some((re) => re.test(t))) continue;
    paragraphs.push(t);
  }

  let text = paragraphs.join("\n");
  if (text.length > MAX_TEXT_LEN) {
    // Trim at the last paragraph break before the cap so the excerpt ends on
    // a whole sentence/paragraph rather than mid-word.
    const cut = text.lastIndexOf("\n", MAX_TEXT_LEN);
    text = text.slice(0, cut > MAX_TEXT_LEN * 0.5 ? cut : MAX_TEXT_LEN);
  }
  return text;
}

/**
 * Full pipeline for one news item: resolve the Google News redirect to the
 * real publisher URL, fetch that page, extract its main text. Returns null
 * on ANY failure at any step (no redirect resolvable, fetch error/timeout,
 * non-2xx response, or extracted text too short to be meaningful) — never
 * throws, and never returns a partial/fabricated result. Callers (see
 * summarizeItems in lib/ai/newsfeed.ts) are expected to fall back to the
 * existing headline-only summary whenever this returns null, which real-
 * world testing shows happens often (paywalls, bot-blocking, slow servers —
 * see the file-level comment above on the measured success rate). Each of
 * the three network calls has its own short timeout so one slow/unresponsive
 * publisher can't stall the whole batch this runs inside of.
 */
export async function fetchArticleFullText(googleNewsLink: string): Promise<string | null> {
  try {
    const realUrl = await resolveArticleUrl(googleNewsLink);
    if (!realUrl) return null;

    // A non-2xx response (403/404/5xx), a network error, or a timeout (of
    // either connecting or downloading the body — see fetchTextWithDeadline)
    // all collapse to the same "extraction failed, fall back" outcome via
    // the outer catch below.
    const html = await fetchTextWithDeadline(realUrl, 3500, {
      headers: { "User-Agent": UA, Accept: HTML_ACCEPT },
    });
    const text = extractMainText(html);
    return text.length >= MIN_TEXT_LEN ? text : null;
  } catch {
    return null;
  }
}
