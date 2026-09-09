import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/data";
import type { Market } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const market = req.nextUrl.searchParams.get("market") as Market | null;
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }
  try {
    const quote = await getQuote(symbol, market ?? undefined);
    if (!quote) {
      return NextResponse.json({ error: "目前無法取得即時報價" }, { status: 503 });
    }
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
