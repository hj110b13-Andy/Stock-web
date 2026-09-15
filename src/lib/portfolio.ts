import type { Market } from "@/lib/data";

/**
 * Shared fee-aware holding math — used by both WatchlistTable.tsx (the
 * table itself) and ai/ask.ts's buildHoldingsGrounding() (so the chat
 * reports the exact same 損益/損益平衡價 numbers a user sees on the
 * watchlist, not a second, differently-computed figure for the same
 * holding). Kept in one place specifically because this site has a
 * documented history of two copies of the same formula drifting apart when
 * only one gets updated (see globals.css's dark-mode-block comment).
 *
 * Standard published TW retail rates (0.1425% commission each way, 0.3%
 * 證券交易稅 on the sell side only) — deliberately the un-discounted
 * textbook figures, not any individual broker's actual (often discounted)
 * rate, since there's no way to know a user's real rate. US holdings skip
 * this entirely: unlike Taiwan, there's no one standard commission/tax
 * structure across US brokers (many are already zero-commission), so
 * guessing a number would be more misleading than showing none.
 */
const TW_BUY_COMMISSION_RATE = 0.001425;
const TW_SELL_COMMISSION_RATE = 0.001425;
const TW_SELL_TAX_RATE = 0.003;

/**
 * Real TW brokerages don't charge the raw fractional-NTD fee a straight
 * rate×amount multiplication produces — each fee component is truncated
 * (無條件捨去) to a whole NT dollar before being added to/subtracted from the
 * trade amount. Confirmed against a user's actual 玉山證券 app figures for
 * three live holdings (光罩/順德/陽明): plugging their real purchase price,
 * share count and a later confirmed-matching current price into this
 * truncated-integer model reproduced 玉山's displayed 投資成本 and 損益 to the
 * exact dollar for all three, whereas the previous continuous-decimal
 * formula was consistently off by NT$1-3 per holding. Only affects the
 * dollar-amount functions below (investedAmount/computeHoldingPnl) —
 * breakEvenPrice stays a continuous per-share theoretical figure (see its
 * own comment).
 */
function twBuyCommission(costBasis: number, shares: number): number {
  return Math.floor(costBasis * shares * TW_BUY_COMMISSION_RATE);
}
function twSellCommission(price: number, shares: number): number {
  return Math.floor(price * shares * TW_SELL_COMMISSION_RATE);
}
function twSellTax(price: number, shares: number): number {
  return Math.floor(price * shares * TW_SELL_TAX_RATE);
}

/**
 * Money actually spent to acquire the position — 購買價格 × 股數 for the buy
 * side commission actually already paid (TW only; US has no assumed fee).
 * This is deliberately NOT 損益平衡價 × 股數: break-even price also bakes in
 * the SELL-side commission/tax, which hasn't been paid yet and is only
 * relevant if/when the position is actually sold — including it here would
 * overstate money that was never spent. A user asked specifically whether
 * 投資金額 should be based on 損益平衡價 "because that's the real cost"; it
 * isn't quite — 損益平衡價 is a per-share reference price, not an amount of
 * money paid — but the underlying instinct (fees are real and should count)
 * is right, which is why the buy-side commission IS folded in here.
 */
export function investedAmount(costBasis: number, shares: number, market: Market): number {
  const principal = costBasis * shares;
  if (market !== "TW") return principal;
  return Math.round(principal) + twBuyCommission(costBasis, shares);
}

/** The sale price at which total proceeds exactly cover the original
 *  purchase cost plus both sides' transaction costs — i.e. genuinely
 *  breaking even after fees, not just "back to the purchase price" (which
 *  ignores that both buying and selling cost money). A $0 cost basis is a
 *  real (if unusual — gifted/free shares) case and correctly breaks even at
 *  $0 too; only a negative cost basis (never actually reachable through the
 *  UI, which floors input at 0, but not guaranteed for every caller) has no
 *  meaningful answer.
 *
 *  This stays a continuous (non-integer-truncated) per-share figure even
 *  though investedAmount()/computeHoldingPnl() now truncate each fee
 *  component to a whole NT dollar to match real brokerage statements: a
 *  break-even PRICE is a theoretical reference point, not an actual booked
 *  transaction with its own fee line, so there's no real "truncate this
 *  fee" step to apply to it. Because of that, the actual (integer-truncated)
 *  P&L at exactly this price may land a dollar or two away from zero rather
 *  than exactly zero — that's expected, not a bug, and matches how brokerage
 *  apps also show a clean theoretical break-even price alongside
 *  whole-dollar-rounded booked P&L. */
export function breakEvenPrice(costBasis: number, market: Market): number | null {
  if (costBasis < 0) return null;
  if (market !== "TW") return costBasis;
  return (costBasis * (1 + TW_BUY_COMMISSION_RATE)) / (1 - TW_SELL_COMMISSION_RATE - TW_SELL_TAX_RATE);
}

/**
 * Net unrealized P&L if the position were sold right now at `price` —
 * proceeds after the sell-side commission/tax (TW only, each truncated to a
 * whole NT dollar — see the comment above twBuyCommission()) minus the
 * actual money spent to buy it (investedAmount(), which already includes
 * the buy-side commission). Because both this function and breakEvenPrice()
 * account for the same two-sided fees, plugging price =
 * breakEvenPrice(costBasis, market) back in lands very close to pnl = 0 —
 * typically within a dollar or two, not exactly 0, since breakEvenPrice()
 * is a continuous theoretical figure while this function truncates each fee
 * to a whole dollar the way a real brokerage statement does (see
 * breakEvenPrice()'s comment for why that's expected, not a bug).
 * `pnlPercent` is null whenever there's nothing to divide by (a $0 cost
 * basis, or an invalid negative one) — the dollar `pnl` itself stays a real
 * number in the $0 case (netProceeds is still well-defined), it's only the
 * *percentage* that's undefined. Both are null for a negative cost basis,
 * which has no meaningful answer for either.
 */
export function computeHoldingPnl(
  price: number,
  costBasis: number,
  shares: number,
  market: Market
): { pnl: number | null; pnlPercent: number | null } {
  if (costBasis < 0) return { pnl: null, pnlPercent: null };
  const invested = investedAmount(costBasis, shares, market);
  let netProceeds: number;
  if (market === "TW") {
    const proceedsPrincipal = Math.round(price * shares);
    netProceeds = proceedsPrincipal - twSellCommission(price, shares) - twSellTax(price, shares);
  } else {
    netProceeds = price * shares;
  }
  const pnl = netProceeds - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : null;
  return { pnl, pnlPercent };
}
