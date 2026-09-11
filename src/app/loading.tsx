export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-(--gridline) bg-(--surface-1)" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-lg border border-(--gridline) bg-(--surface-1)" />
      <div className="h-64 animate-pulse rounded-lg border border-(--gridline) bg-(--surface-1)" />
    </div>
  );
}
