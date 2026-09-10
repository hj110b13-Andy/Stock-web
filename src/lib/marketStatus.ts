import type { Market } from "@/lib/data/types";

export type MarketStatus = "open" | "closed";

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
  if (minutes < session.openMinutes || minutes >= session.closeMinutes) return "closed";
  return "open";
}

export function marketStatusLabel(status: MarketStatus): string {
  return status === "open" ? "盤中" : "已收盤";
}
