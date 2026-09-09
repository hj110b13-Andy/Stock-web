export default function DataBadge({ isMock }: { isMock: boolean }) {
  if (!isMock) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-(--accent-soft) px-2 py-0.5 text-[11px] font-medium text-(--accent)">
        <span className="h-1.5 w-1.5 rounded-full bg-(--accent)" aria-hidden />
        即時資料
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-(--page-plane) px-2 py-0.5 text-[11px] font-medium text-(--text-muted)">
      示範資料
    </span>
  );
}
