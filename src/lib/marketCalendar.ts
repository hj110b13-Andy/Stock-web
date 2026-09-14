// Pure calendar facts about Taiwan's derivatives market — no external data
// source needed, these dates are fixed by rule (unlike a market holiday
// calendar, which would need an official source and isn't attempted here).
// Added because a user asked for "台指期結算" and similar special dates to
// factor into the AI's reasoning about unusual TW market volatility — the
// third-Wednesday settlement of 台指期 (TAIEX futures/options, by far
// Taiwan's most-watched derivatives contract) is well known to concentrate
// unwind-driven volume/volatility in the underlying cash market on and just
// before that date, independent of any company-specific news.

/** Taiwan Futures Exchange's TAIEX futures/options (台指期/台指選)
 *  settlement date: the third Wednesday of the contract month, by rule
 *  (TAIFEX's own published contract spec — not something that varies year
 *  to year the way a holiday calendar would, so no external source is
 *  needed to compute it). */
export function taiexFuturesSettlementDate(year: number, month: number): Date {
  // Find the first Wednesday, then jump two more weeks.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay(); // 0=Sun..6=Sat
  const daysToFirstWednesday = (3 - firstWeekday + 7) % 7; // 3 = Wednesday
  const firstWednesday = 1 + daysToFirstWednesday;
  const thirdWednesday = firstWednesday + 14;
  return new Date(Date.UTC(year, month - 1, thirdWednesday));
}

function toDateOnly(d: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

/**
 * Whether `today` (a plain Y/M/D, already resolved to Taipei's calendar day
 * by the caller — see taipeiToday() in lib/data/twse.ts for the same
 * pattern) is on, or within `withinDays` calendar days before, this month's
 * settlement date. Only checks the CURRENT month's settlement — if today is
 * already past it, this correctly reports false rather than matching next
 * month's date early.
 */
export function isNearTaiexFuturesSettlement(
  today: { year: number; month: number; day: number },
  withinDays = 2
): { isNear: boolean; isSettlementDay: boolean; settlementDateIso: string } {
  const settlement = taiexFuturesSettlementDate(today.year, today.month);
  const todayDate = toDateOnly(today);
  const diffDays = Math.round((settlement.getTime() - todayDate.getTime()) / 86_400_000);
  return {
    isNear: diffDays >= 0 && diffDays <= withinDays,
    isSettlementDay: diffDays === 0,
    settlementDateIso: settlement.toISOString().slice(0, 10),
  };
}
