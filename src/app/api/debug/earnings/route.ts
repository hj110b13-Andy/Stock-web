import { NextRequest, NextResponse } from "next/server";
import { getEarnings } from "@/lib/data";
import { fetchNews } from "@/lib/data/news";

// Temporary diagnostic route — not linked from any UI — to check from
// inside Vercel's own runtime (not my local machine) whether the TWSE
// earnings endpoints and Google News RSS are actually reachable in
// production. Remove once the news/earnings grounding issue is resolved.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "2330";
  const market = req.nextUrl.searchParams.get("market") === "US" ? "US" : "TW";
  const results: Record<string, unknown> = {};

  try {
    results.earnings = await getEarnings(symbol, market);
  } catch (err) {
    results.earningsError = String(err);
  }

  try {
    results.news = await fetchNews(`${symbol} 台積電`, 3);
  } catch (err) {
    results.newsError = String(err);
  }

  try {
    results.marketNewsTW = await fetchNews("台股", 3);
  } catch (err) {
    results.marketNewsError = String(err);
  }

  return NextResponse.json(results);
}
