import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServerWatchlist, setServerWatchlist, watchlistSyncAvailable } from "@/lib/watchlistStore";
import type { WatchlistItem } from "@/lib/watchlist";

function isWatchlistItem(v: unknown): v is WatchlistItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.symbol === "string" && (o.market === "TW" || o.market === "US") && typeof o.name === "string";
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!watchlistSyncAvailable) {
    return NextResponse.json({ items: [], syncAvailable: false });
  }
  const items = await getServerWatchlist(email);
  return NextResponse.json({ items, syncAvailable: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!watchlistSyncAvailable) {
    return NextResponse.json({ error: "尚未設定共用儲存，無法跨裝置同步" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items.filter(isWatchlistItem) : null;
  if (!items) return NextResponse.json({ error: "格式錯誤" }, { status: 400 });

  const ok = await setServerWatchlist(email, items);
  if (!ok) return NextResponse.json({ error: "儲存失敗，請稍後再試" }, { status: 503 });
  return NextResponse.json({ items });
}
