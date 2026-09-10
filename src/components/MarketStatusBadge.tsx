import { marketStatusLabel, type MarketStatus } from "@/lib/marketStatus";

export default function MarketStatusBadge({ status }: { status: MarketStatus }) {
  const open = status === "open";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        open ? "bg-(--accent-soft) text-(--accent)" : "bg-(--page-plane) text-(--text-muted)"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-(--accent) animate-pulse" : "bg-(--text-muted)"}`} aria-hidden />
      {marketStatusLabel(status)}
    </span>
  );
}
