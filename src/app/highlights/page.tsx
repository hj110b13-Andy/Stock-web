import StockTable from "@/components/StockTable";
import MarketTabs from "@/components/MarketTabs";
import { searchStocks } from "@/lib/data";

export const revalidate = 0;

export default async function HighlightsPage() {
  const [twGainers, usGainers, twLosers, usLosers, twVolume, usVolume] = await Promise.all([
    searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
    searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
    searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "asc" }),
    searchStocks({ market: "US", sortBy: "changePercent", sortDir: "asc" }),
    searchStocks({ market: "TW", sortBy: "volume", sortDir: "desc" }),
    searchStocks({ market: "US", sortBy: "volume", sortDir: "desc" }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">每日焦點榜單</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          台股、美股分開排名，快速掃到市場現在在關注什麼。純粹依數據排序，不代表買賣建議。
        </p>
      </div>

      <Board
        title="漲幅榜"
        description="今日漲幅最大的股票"
        twItems={twGainers.slice(0, 10)}
        usItems={usGainers.slice(0, 10)}
      />
      <Board
        title="跌幅榜"
        description="今日跌幅最大的股票"
        twItems={twLosers.slice(0, 10)}
        usItems={usLosers.slice(0, 10)}
      />
      <Board
        title="成交量榜"
        description="今日成交量最高的股票，通常代表市場關注度高"
        twItems={twVolume.slice(0, 10)}
        usItems={usVolume.slice(0, 10)}
      />
    </div>
  );
}

function Board({
  title,
  description,
  twItems,
  usItems,
}: {
  title: string;
  description: string;
  twItems: Awaited<ReturnType<typeof searchStocks>>;
  usItems: Awaited<ReturnType<typeof searchStocks>>;
}) {
  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-(--text-muted)">{description}</p>
      <MarketTabs tw={<StockTable items={twItems} />} us={<StockTable items={usItems} />} />
    </section>
  );
}
