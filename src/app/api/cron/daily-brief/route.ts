import { NextRequest, NextResponse } from "next/server";
import { getDailyBrief } from "@/lib/ai/brief";

// Triggered once a day by Vercel Cron (see vercel.json) to pre-generate the
// daily brief before the first visitor of the day, so nobody waits on an
// AI call. Optionally protected by CRON_SECRET, which Vercel sends as
// `Authorization: Bearer <secret>` when set — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
//
// Caveat: caching is an in-memory Map per lib/data/cache.ts, which is
// per-serverless-instance, not a shared store — this warms whichever
// instance handles the cron request, which helps but doesn't guarantee
// every subsequent visitor's instance already has it cached. A real
// production deployment should back this with Redis/KV instead.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const brief = await getDailyBrief();
    return NextResponse.json({ ok: true, usedAi: brief.usedAi, generatedAt: brief.generatedAt });
  } catch (err) {
    // A failed warm-up is not an outage: the brief is regenerated lazily on
    // the first page view anyway. Report it as a failed run so it shows up
    // in Vercel's cron log instead of as an unhandled 500 with a stack.
    console.error("[cron] daily brief warm-up failed:", err);
    return NextResponse.json({ ok: false, error: "快報預先產生失敗" }, { status: 503 });
  }
}
