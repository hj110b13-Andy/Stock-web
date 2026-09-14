import { NextRequest, NextResponse } from "next/server";
import { getIndices, getMultiSignalStocks, searchStocks } from "@/lib/data";
import { getDailyBrief } from "@/lib/ai/brief";

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
//
// Also calls getDailyBrief() now that brief.ts moved from a once-a-day
// (~25h) cache to a rolling 3h TTL — without a periodic warm-up, the first
// visitor after each 3h window lapses would be the one stuck waiting on a
// live ~25s AI call instead of getting an already-computed result.
export const maxDuration = 60; // getDailyBrief's AI call can take up to ~25s, well past the Node default

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
      getDailyBrief().catch((err) => {
        // Same philosophy as api/cron/daily-brief's own try/catch: a failed
        // brief warm-up isn't this whole cron run's problem to fail on —
        // real visitors still get it lazily, just possibly slower.
        console.error("[cron] warm-cache: daily brief warm-up failed:", err);
      }),
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
