export default function Loading() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-6">
        <div className="h-7 w-40 animate-pulse rounded bg-(--page-plane)" />
        <div className="mt-4 h-10 w-56 animate-pulse rounded bg-(--page-plane)" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-(--page-plane)" />
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
        <div className="h-5 w-20 animate-pulse rounded bg-(--page-plane)" />
        <div className="mt-3 h-16 animate-pulse rounded bg-(--page-plane)" />
      </section>
      <div className="h-96 animate-pulse rounded-lg border border-(--gridline) bg-(--surface-1)" />
    </div>
  );
}
