import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/data";
import type { Market } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const marketParam = req.nextUrl.searchParams.get("market");
  // An unrecognized value must fall through to undefined (letting getQuote
  // auto-detect from the symbol), not get cast straight through as Market —
  // a stale bookmark's `?market=BOGUS` would otherwise silently query the
  // wrong market's data source instead of guessing correctly.
  const market: Market | undefined = marketParam === "TW" || marketParam === "US" ? marketParam : undefined;
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }
  try {
    const quote = await getQuote(symbol, market);
    if (!quote) {
      return NextResponse.json({ error: "目前無法取得即時報價" }, { status: 503 });
    }
    return NextResponse.json(quote);
  } catch (err) {
    console.error("[quote] getQuote failed:", err);
    return NextResponse.json({ error: "取得報價時發生錯誤" }, { status: 500 });
  }
}
