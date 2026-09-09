import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StockTable from "@/components/StockTable";
import DataBadge from "@/components/DataBadge";
import { getIndices, searchStocks } from "@/lib/data";

export const revalidate = 0;

export default async function HomePage() {
  const [indices, twMovers, usMovers] = await Promise.all([
    getIndices(),
    searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
    searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
  ]);

  const anyMock = indices.some((i) => i.isMock) || twMovers.some((i) => i.isMock);

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-(--gridline) bg-(--surface-1) p-6 sm:p-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          用最快的方式看懂台股與美股
        </h1>
        <p className="mt-2 max-w-2xl text-(--text-secondary)">
          即時查詢個股報價、互動走勢圖表，搭配 AI 問答與篩選排行，公開免費，人人都能研究股票。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/stock/2330"
            className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            試試看：台積電 2330
          </Link>
          <Link
            href="/stock/AAPL?market=US"
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-4 py-2 text-sm font-medium hover:bg-(--page-plane)"
          >
            試試看：Apple AAPL
          </Link>
          <Link
            href="/search"
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-4 py-2 text-sm font-medium hover:bg-(--page-plane)"
          >
            前往搜尋 / 篩選
          </Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">大盤指數</h2>
          <DataBadge isMock={anyMock} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indices.map((idx) => (
            <IndexCard key={idx.symbol} index={idx} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">台股焦點</h2>
            <Link href="/search?market=TW" className="text-sm text-(--accent) hover:underline">
              查看完整排行 →
            </Link>
          </div>
          <StockTable items={twMovers.slice(0, 6)} />
        </div>
        <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">美股焦點</h2>
            <Link href="/search?market=US" className="text-sm text-(--accent) hover:underline">
              查看完整排行 →
            </Link>
          </div>
          <StockTable items={usMovers.slice(0, 6)} />
        </div>
      </section>

      <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-6 text-center">
        <h2 className="font-semibold">有問題想問？</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          點右下角的 AI 問答，直接用中文問「2330 最近走勢如何？」或「AAPL 現在多少錢？」
        </p>
      </section>
    </div>
  );
}
