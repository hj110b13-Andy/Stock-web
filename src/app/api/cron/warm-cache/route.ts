import { NextRequest, NextResponse } from "next/server";
import { getIndices, getMultiSignalStocks, searchStocks } from "@/lib/data";

// Triggered every few minutes by an external scheduler (see
// .github/workflows/warm-cache.yml — Vercel's own Cron is limited to once a
// day on the Hobby plan, which is nowhere near frequent enough to keep these
// caches warm) so a real visitor's request almost always reads an
// already-computed result instead of triggering the live computation.
// Recomputes exactly what /highlights, /search and the homepage's movers
// section need: the batched market-quote maps (MARKET_MAP_TTL_MS, 2 min)
// and the technical-signal screen (MOMENTUM_TTL_MS, 10 min) for both
// markets. Optionally protected by CRON_SECRET, same convention as
// api/cron/daily-brief.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    await Promise.all([
      searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
      getMultiSignalStocks("TW"),
      getMultiSignalStocks("US"),
      getIndices(),
    ]);
    return NextResponse.json({ ok: true, warmedAt: new Date().toISOString() });
  } catch (err) {
    // Same philosophy as the daily-brief cron: a failed warm-up isn't an
    // outage, real visitors still get correct (just possibly slower) data
    // computed on demand — report it so it's visible in the scheduler's
    // run log, don't let it look like an unhandled crash.
    console.error("[cron] warm-cache failed:", err);
    return NextResponse.json({ ok: false, error: "預熱失敗" }, { status: 503 });
  }
}
