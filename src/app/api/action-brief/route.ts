import { NextRequest, NextResponse } from "next/server";
import { getActionBrief } from "@/lib/ai/actionBrief";

// Mirrors api/daily-brief: generation fans out several already-cached data
// fetches plus one AI call comfortably past Vercel's ~10s default budget.
export const maxDuration = 60;

// Backs the client-side fetch in ActionBriefCard — kept off the page's
// server-rendered blocking path for the same reason as DailyBriefCard.
// `?refresh=1` forces regeneration, overwriting whatever is currently
// cached, without waiting out the 20-minute TTL.
export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const actionBrief = await getActionBrief(forceRefresh);
    return NextResponse.json({ actionBrief });
  } catch (err) {
    console.error("[api/action-brief] failed:", err);
    return NextResponse.json({ error: "今日建議暫時無法取得" }, { status: 503 });
  }
}
