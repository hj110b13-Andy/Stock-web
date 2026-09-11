import { NextResponse } from "next/server";
import { getDailyBrief } from "@/lib/ai/brief";

// Brief generation now allows up to a 25s Gemini call (see brief.ts) — this
// route's own execution budget needs enough room for that plus the data
// fetches ahead of it, well past Vercel's ~10s default for a Node function.
export const maxDuration = 60;

// Backs the client-side fetch in DailyBriefCard — see that component for why
// this moved off the homepage's server-rendered blocking path (the brief
// generation call is the slowest thing on the page on a cache-cold day, same
// class of problem MomentumSection solved for /highlights).
export async function GET() {
  try {
    const brief = await getDailyBrief();
    return NextResponse.json({ brief });
  } catch (err) {
    console.error("[api/daily-brief] failed:", err);
    return NextResponse.json({ error: "快報暫時無法取得" }, { status: 503 });
  }
}
