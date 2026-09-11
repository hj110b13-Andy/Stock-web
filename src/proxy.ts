import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This site went from "public research tool" to "just for me and family" —
// see PROGRESS.md's 2026-09-11 entry. A public URL with no gate meant the AI
// chat handing out direct buy/sell language would be public investment
// advice (a regulated activity in Taiwan) regardless of who the operator
// intended the audience to be; a real access gate is what actually changes
// that. Deliberately simple (one shared password, no accounts) since the
// audience is a handful of known people, not a security boundary against a
// determined attacker.
export const UNLOCK_COOKIE = "site_unlocked";

export function proxy(request: NextRequest) {
  if (request.cookies.get(UNLOCK_COOKIE)?.value === "granted") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!unlock|api/unlock|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
