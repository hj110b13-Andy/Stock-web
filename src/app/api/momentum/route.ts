import { NextRequest, NextResponse } from "next/server";
import { getMultiSignalStocks } from "@/lib/data";
import type { Market } from "@/lib/data";

export async function GET(req: NextRequest) {
  const marketParam = req.nextUrl.searchParams.get("market");
  const market: Market = marketParam === "US" ? "US" : "TW";
  try {
    const items = await getMultiSignalStocks(market);
    return NextResponse.json({ items: items.slice(0, 10) });
  } catch (err) {
    console.error("[api/momentum] failed:", err);
    return NextResponse.json({ error: "目前無法取得技術訊號資料" }, { status: 503 });
  }
}
