import StockTable from "@/components/StockTable";
import { searchStocks } from "@/lib/data";

export const revalidate = 0;

export default async function HighlightsPage() {
  const [gainers, losers, byVolume] = await Promise.all([
    searchStocks({ sortBy: "changePercent", sortDir: "desc" }),
    searchStocks({ sortBy: "changePercent", sortDir: "asc" }),
    searchStocks({ sortBy: "volume", sortDir: "desc" }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">每日焦點榜單</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          台股、美股合併排名，快速掃到市場現在在關注什麼。純粹依數據排序，不代表買賣建議。
        </p>
      </div>

      <Board title="漲幅榜" description="今日漲幅最大的股票，橫跨台股與美股" items={gainers.slice(0, 10)} />
      <Board title="跌幅榜" description="今日跌幅最大的股票，橫跨台股與美股" items={losers.slice(0, 10)} />
      <Board title="成交量榜" description="今日成交量最高的股票，通常代表市場關注度高" items={byVolume.slice(0, 10)} />
    </div>
  );
}

function Board({ title, description, items }: { title: string; description: string; items: Awaited<ReturnType<typeof searchStocks>> }) {
  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-(--text-muted)">{description}</p>
      <StockTable items={items} />
    </section>
  );
}
