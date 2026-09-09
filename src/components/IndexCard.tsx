import type { IndexQuote } from "@/lib/data";
import { formatPercent, formatPrice, priceDirectionClass } from "@/lib/format";

export default function IndexCard({ index }: { index: IndexQuote }) {
  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <p className="text-sm text-(--text-secondary)">{index.name}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPrice(index.price, "USD")}</p>
      <p className={`mt-1 text-sm font-medium tabular-nums ${priceDirectionClass(index.change)}`}>
        {index.change > 0 ? "▲" : index.change < 0 ? "▼" : "–"} {formatPrice(Math.abs(index.change), "USD")} (
        {formatPercent(index.changePercent)})
      </p>
    </div>
  );
}
