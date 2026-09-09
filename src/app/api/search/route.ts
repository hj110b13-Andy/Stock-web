import { NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/data";
import type { Market } from "@/lib/data";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market") as Market | null;
  const sectorsParam = sp.get("sectors");
  const sectors = sectorsParam ? sectorsParam.split(",").filter(Boolean) : undefined;
  const query = sp.get("q");
  const minChangePercent = sp.get("min") ? Number(sp.get("min")) : undefined;
  const maxChangePercent = sp.get("max") ? Number(sp.get("max")) : undefined;
  const minPrice = sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined;
  const maxPrice = sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined;
  const sortBy = (sp.get("sortBy") as "changePercent" | "volume" | "price" | null) ?? undefined;
  const sortDir = (sp.get("sortDir") as "asc" | "desc" | null) ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;

  try {
    const items = await searchStocks({
      market: market ?? undefined,
      sectors,
      query: query ?? undefined,
      minChangePercent,
      maxChangePercent,
      minPrice,
      maxPrice,
      sortBy,
      sortDir,
    });
    return NextResponse.json({ items: limit ? items.slice(0, limit) : items });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
