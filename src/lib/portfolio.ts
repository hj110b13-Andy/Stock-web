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
  const fee = market === "TW" ? 1 + TW_BUY_COMMISSION_RATE : 1;
  return costBasis * shares * fee;
}

/** The sale price at which total proceeds exactly cover the original
 *  purchase cost plus both sides' transaction costs — i.e. genuinely
 *  breaking even after fees, not just "back to the purchase price" (which
 *  ignores that both buying and selling cost money). A $0 cost basis is a
 *  real (if unusual — gifted/free shares) case and correctly breaks even at
 *  $0 too; only a negative cost basis (never actually reachable through the
 *  UI, which floors input at 0, but not guaranteed for every caller) has no
 *  meaningful answer. */
export function breakEvenPrice(costBasis: number, market: Market): number | null {
  if (costBasis < 0) return null;
  if (market !== "TW") return costBasis;
  return (costBasis * (1 + TW_BUY_COMMISSION_RATE)) / (1 - TW_SELL_COMMISSION_RATE - TW_SELL_TAX_RATE);
}

/**
 * Net unrealized P&L if the position were sold right now at `price` —
 * proceeds after the sell-side commission/tax (TW only) minus the actual
 * money spent to buy it (investedAmount(), which already includes the
 * buy-side commission). Consistent by construction with breakEvenPrice():
 * plugging price = breakEvenPrice(costBasis, market) back in always yields
 * pnl = 0, so the two numbers never contradict each other on screen.
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
  const sellFee = market === "TW" ? 1 - TW_SELL_COMMISSION_RATE - TW_SELL_TAX_RATE : 1;
  const netProceeds = price * shares * sellFee;
  const pnl = netProceeds - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : null;
  return { pnl, pnlPercent };
}
