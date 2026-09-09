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

export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/** Taiwan/greater-China convention: red = up, green = down. */
export function priceDirectionClass(change: number): string {
  if (change > 0) return "text-(--price-up)";
  if (change < 0) return "text-(--price-down)";
  return "text-(--text-secondary)";
}
