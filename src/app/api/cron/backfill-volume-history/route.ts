import { NextRequest, NextResponse } from "next/server";
import { backfillVolumeHistory } from "@/lib/data";
import type { Market } from "@/lib/data";

// One-time (or occasional, e.g. after a Redis reset) manual trigger — NOT a
// scheduled cron like warm-cache. Seeds volumeHistory.ts's trailing-average
// cache from each stock's own historical chart data instead of waiting
// MIN_HISTORY_DAYS_FOR_AVERAGE real trading days for the piggyback snapshot
// mechanism to accumulate enough live daily quotes from scratch — a user
// reported that wait as pointless since the same historical data is already
// visible on every stock's own chart today.
//
// `?market=TW|US&offset=0&limit=200` pages through the market's universe
// (~950 TW / ~150 US symbols) a few hundred at a time so one call stays
// comfortably inside this function's execution budget; the response's
// `nextOffset` tells the caller whether (and where) to continue.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const sp = req.nextUrl.searchParams;
  const marketParam = sp.get("market");
  const market: Market | undefined = marketParam === "TW" || marketParam === "US" ? marketParam : undefined;
  if (!market) {
    return NextResponse.json({ error: "market 參數必須是 TW 或 US" }, { status: 400 });
  }
  const offset = Number(sp.get("offset") ?? "0") || 0;
  const limit = Number(sp.get("limit") ?? "200") || 200;

  try {
    const result = await backfillVolumeHistory(market, { offset, limit });
    return NextResponse.json({ ok: true, market, ...result });
  } catch (err) {
    console.error("[cron] backfill-volume-history failed:", err);
    return NextResponse.json({ ok: false, error: "回填失敗" }, { status: 503 });
  }
}
