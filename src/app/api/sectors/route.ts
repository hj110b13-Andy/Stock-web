import { NextRequest, NextResponse } from "next/server";
import { sectorsFor, getTwUniverse } from "@/lib/data";
import type { Market } from "@/lib/data";

export async function GET(req: NextRequest) {
  const market = (req.nextUrl.searchParams.get("market") as Market | null) ?? "TW";
  if (market === "TW") await getTwUniverse(); // ensure sectorsFor sees the full official list, not just the seed
  return NextResponse.json({ sectors: sectorsFor(market) });
}
