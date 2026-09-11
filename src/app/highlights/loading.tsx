/**
 * Shown the instant a visitor navigates here, before the server has any
 * data back — without this, Next.js just leaves whatever page they were
 * on visible until /highlights is fully ready, which reads as "did my
 * click even register?" on anything but an instant load.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">每日焦點榜單</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          台股、美股分開排名，快速掃到市場現在在關注什麼。純粹依數據排序，不代表買賣建議。
        </p>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i} className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
          <div className="mb-3 h-5 w-24 animate-pulse rounded bg-(--page-plane)" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-9 animate-pulse rounded bg-(--page-plane)" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
