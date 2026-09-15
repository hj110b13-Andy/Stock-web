import type { Market } from "@/lib/data/types";

// "pre-market" — TW only: TWSE/TPEx collect orders and publish a simulated
// 試撮（試算撮合）trial-match price from 08:30 until the real 09:00 open,
// but no actual trade executes yet. A user asked for this window to be
// explicitly labeled rather than folded into a plain "已收盤" — seeing
// "已收盤" at 08:45 read as though nothing was happening yet, when TWSE's
// own systems are already actively publishing (non-final) matching data.
// US has no equivalent modeled here (its real pre-market session is
// actual trading on limited venues, a different mechanism this site
// doesn't otherwise track — see US_SESSIONS below, unchanged).
export type MarketStatus = "open" | "pre-market" | "closed";

interface Session {
  timeZone: string;
  openMinutes: number; // minutes since local midnight
  closeMinutes: number;
}

// Regular trading session hours (local exchange time).
const SESSIONS: Record<Market, Session> = {
  TW: { timeZone: "Asia/Taipei", openMinutes: 9 * 60, closeMinutes: 13 * 60 + 30 },
  US: { timeZone: "America/New_York", openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60 },
};

// 08:30 local Taipei time — see the MarketStatus comment above for what
// this window means. Only defined for TW; getMarketStatus() below never
// reads this for "US".
const TW_PRE_MARKET_START_MINUTES = 8 * 60 + 30;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localParts(date: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday: WEEKDAYS.indexOf(weekdayStr), minutes: hour * 60 + minute };
}

/**
 * Approximate regular-session open/closed check — weekday + local wall-clock
 * time only. Doesn't know about exchange holidays (TWSE/NYSE holiday
 * calendars aren't available from a free public API), so a holiday reads as
 * "open" and the page just polls for updates that never change — harmless,
 * since it never fabricates a price either way, unlike getting this wrong
 * would if it suppressed real updates.
 */
export function getMarketStatus(market: Market, now: Date = new Date()): MarketStatus {
  const session = SESSIONS[market];
  const { weekday, minutes } = localParts(now, session.timeZone);
  if (weekday === 0 || weekday === 6) return "closed";
  if (market === "TW" && minutes >= TW_PRE_MARKET_START_MINUTES && minutes < session.openMinutes) return "pre-market";
  if (minutes < session.openMinutes || minutes >= session.closeMinutes) return "closed";
  return "open";
}

export function marketStatusLabel(status: MarketStatus): string {
  if (status === "open") return "盤中";
  if (status === "pre-market") return "試搓中（08:30-09:00，尚未正式開盤）";
  return "已收盤";
}
