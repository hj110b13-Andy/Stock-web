export function formatPrice(value: number, currency: string): string {
  const decimals = currency === "TWD" && value >= 100 ? 1 : 2;
  return value.toLocaleString("zh-TW", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatChange(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPrice(value, currency)}`;
}

/**
 * `value` is always raw shares internally (see lib/data/twse.ts — MIS's 張
 * count is converted to shares so it matches the historical-chart volume
 * unit). Taiwan investors read 成交量 as a plain 張 count though (every
 * local site — TWSE itself, Yahoo奇摩股市, MoneyDJ — shows e.g. "15,553張",
 * never a US-style abbreviated share count), so convert back to 張 for
 * display on TW rows. US stays as abbreviated shares (M/K), which is how
 * US sites display volume.
 */
export function formatVolume(value: number, market: "TW" | "US" = "US"): string {
  if (market === "TW") {
    return `${Math.round(value / 1000).toLocaleString("zh-TW")}張`;
  }
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function formatMarketCap(value: number, currency: string): string {
  const symbol = currency === "TWD" ? "NT$" : "$";
  if (value >= 1_000_000_000_000) return `${symbol}${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  return `${symbol}${value.toLocaleString()}`;
}

/**
 * Formats an ISO timestamp as Taipei wall-clock time (`YYYY/MM/DD HH:mm:ss`),
 * computed via fixed UTC+8 offset arithmetic rather than
 * `toLocaleString(..., { timeZone: "Asia/Taipei" })`. That Intl call reads
 * differently between Vercel's Node runtime and a browser when the locale
 * data available for "zh-TW" isn't identical on both sides, which produces
 * two different strings for the same instant — a text mismatch that fails
 * React hydration on every stock page. Plain arithmetic is deterministic
 * across any JS engine, with or without full ICU data.
 */
export function formatTaipeiDateTime(isoString: string): string {
  const date = new Date(isoString);
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${taipei.getUTCFullYear()}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())} ${pad(
    taipei.getUTCHours(),
  )}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
}

/** Taiwan/greater-China convention: red = up, green = down. */
export function priceDirectionClass(change: number): string {
  if (change > 0) return "text-(--price-up)";
  if (change < 0) return "text-(--price-down)";
  return "text-(--text-secondary)";
}
