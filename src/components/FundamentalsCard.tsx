import type { Fundamentals } from "@/lib/data";
import { formatMarketCap } from "@/lib/format";

export default function FundamentalsCard({ fundamentals, currency }: { fundamentals: Fundamentals | null; currency: string }) {
  const hasAny =
    fundamentals && (fundamentals.peRatio || fundamentals.dividendYield || fundamentals.marketCap || fundamentals.pbRatio);

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="mb-3 font-semibold">基本面</h2>
      {!hasAny ? (
        <p className="text-sm text-(--text-muted)">目前無法取得這檔股票的基本面資料</p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-(--text-muted)">本益比 (P/E)</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {fundamentals?.peRatio ? fundamentals.peRatio.toFixed(2) : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">股價淨值比 (P/B)</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {fundamentals?.pbRatio ? fundamentals.pbRatio.toFixed(2) : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">殖利率</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {fundamentals?.dividendYield ? `${fundamentals.dividendYield.toFixed(2)}%` : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">市值</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {fundamentals?.marketCap ? formatMarketCap(fundamentals.marketCap, currency) : "資料暫缺"}
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-3 text-[11px] text-(--text-muted)">
        台股資料來源：TWSE 公開資訊（每日更新）｜美股資料來源：Yahoo Finance。抓不到時顯示「資料暫缺」，不會用示範數字頂替。
      </p>
    </div>
  );
}
