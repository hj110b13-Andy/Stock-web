import { NextRequest, NextResponse } from "next/server";
import { getChart } from "@/lib/data";
import type { ChartRange, Market } from "@/lib/data";

const VALID_RANGES: ChartRange[] = ["1m", "3m", "6m", "1y"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "3m";
  const market = req.nextUrl.searchParams.get("market") as Market | null;
  const range = VALID_RANGES.includes(rangeParam as ChartRange) ? (rangeParam as ChartRange) : "3m";

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }
  try {
    const chart = await getChart(symbol, range, market ?? undefined);
    return NextResponse.json(chart);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
