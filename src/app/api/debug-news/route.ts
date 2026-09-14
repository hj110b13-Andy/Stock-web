import { NextResponse } from "next/server";

// TEMPORARY diagnostic route — mirrors the debug-tpex pattern used earlier
// this session to see the REAL error production hits (vs. local dev), since
// Vercel's outbound IPs have previously behaved differently than a local
// machine's for other upstreams. Delete once the news full-text pipeline is
// confirmed working live.
export async function GET() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const out: Record<string, unknown> = {};

  // Step 0: a known-good Google News RSS link fetched fresh so the article id is current
  try {
    const rssRes = await fetch("https://news.google.com/rss/search?q=%E5%8F%B0%E8%82%A1&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", {
      headers: { "User-Agent": UA },
    });
    out.rssStatus = rssRes.status;
    const xml = await rssRes.text();
    const linkMatch = xml.match(/<link>(https:\/\/news\.google\.com\/rss\/articles\/[^<]+)<\/link>/);
    out.sampleLink = linkMatch?.[1] ?? null;

    if (linkMatch) {
      const googleNewsLink = linkMatch[1];
      const idMatch = googleNewsLink.match(/\/articles\/([^?]+)/);
      out.articleId = idMatch?.[1]?.slice(0, 30) + "...";

      if (idMatch) {
        const articleId = idMatch[1];
        try {
          const interRes = await fetch(`https://news.google.com/rss/articles/${articleId}?oc=5&hl=en-US&gl=US&ceid=US:en`, {
            headers: { "User-Agent": UA },
          });
          out.interstitialStatus = interRes.status;
          const html = await interRes.text();
          out.interstitialLen = html.length;
          const ts = html.match(/data-n-a-ts="(\d+)"/)?.[1];
          const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
          out.ts = ts ?? null;
          out.sg = sg ? sg.slice(0, 10) + "..." : null;

          if (ts && sg) {
            const innerReq = JSON.stringify([
              "garturlreq",
              [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
              articleId,
              ts,
              sg,
            ]);
            const freq = JSON.stringify([[["Fbv4je", innerReq, null, "generic"]]]);
            try {
              const beRes = await fetch(
                "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&source-path=%2Frss%2Farticles%2F&hl=en-US&gl=US",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
                  body: new URLSearchParams({ "f.req": freq }).toString(),
                }
              );
              out.batchexecuteStatus = beRes.status;
              const text = await beRes.text();
              out.batchexecuteBodyPreview = text.slice(0, 400);
            } catch (e) {
              out.batchexecuteError = String(e);
            }
          }
        } catch (e) {
          out.interstitialError = String(e);
        }
      }
    }
  } catch (e) {
    out.rssError = String(e);
  }

  return NextResponse.json(out);
}
