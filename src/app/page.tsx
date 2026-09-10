import Link from "next/link";
import StockTable from "@/components/StockTable";
import MarketTabs from "@/components/MarketTabs";
import WatchlistSection from "@/components/WatchlistSection";
import DailyBriefCard from "@/components/DailyBriefCard";
import LiveIndices from "@/components/LiveIndices";
import { getIndices, searchStocks } from "@/lib/data";
import { getDailyBrief } from "@/lib/ai/brief";

export const revalidate = 0;

export default async function HomePage() {
  const [indices, twMovers, usMovers, brief] = await Promise.all([
    getIndices(),
    searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
    searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
    getDailyBrief(),
  ]);

  const twIndices = indices.filter((i) => i.market === "TW");
  const usIndices = indices.filter((i) => i.market === "US");

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
          <Link
            href="/highlights"
            className="rounded-md border border-(--gridline) bg-(--surface-2) px-4 py-2 text-sm font-medium hover:bg-(--page-plane)"
          >
            每日焦點榜單
          </Link>
        </div>
      </section>

      <DailyBriefCard brief={brief} />

      <WatchlistSection />

      <section>
        <h2 className="mb-3 text-lg font-semibold">大盤指數</h2>
        <MarketTabs
          tw={<LiveIndices market="TW" initialIndices={twIndices} />}
          us={<LiveIndices market="US" initialIndices={usIndices} />}
        />
      </section>

      <section>
        <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">焦點排行</h2>
            <Link href="/search" className="text-sm text-(--accent) hover:underline">
              查看完整排行 →
            </Link>
          </div>
          <MarketTabs
            tw={<StockTable items={twMovers.slice(0, 8)} />}
            us={<StockTable items={usMovers.slice(0, 8)} />}
          />
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
