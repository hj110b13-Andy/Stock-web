import type { MarketDepth } from "@/lib/data";

/**
 * TW only — 內外盤（見 lib/data/yahooTwMarketDepth.ts 的完整說明）：真正的
 * 逐筆成交依委買/委賣方向分類的量，不是本站其他地方用的「價量關係」
 * （今日量 vs 均量的經驗法則）替代指標，兩者不要混為一談。資料來源本身
 * 只支援單一股票查詢，所以只出現在個股頁面，搜尋/排行列表無法依此排序。
 */
export default function MarketDepthCard({ depth }: { depth: MarketDepth | null }) {
  if (!depth) {
    return (
      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
        <h2 className="mb-3 font-semibold">內外盤</h2>
        <p className="text-sm text-(--text-muted)">目前無法取得這檔股票的內外盤資料</p>
      </div>
    );
  }

  const { inMarketLots, outMarketLots } = depth;
  const total = inMarketLots + outMarketLots;
  const inPercent = total > 0 ? (inMarketLots / total) * 100 : 50;

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="mb-3 font-semibold">內外盤</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-(--text-muted)">內盤（張）</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-(--price-up)">{inMarketLots.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-(--text-muted)">外盤（張）</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-(--price-down)">{outMarketLots.toLocaleString()}</dd>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-(--page-plane)">
            <div className="bg-(--price-up)" style={{ width: `${inPercent}%` }} />
            <div className="bg-(--price-down)" style={{ width: `${100 - inPercent}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-(--text-muted)">內盤佔比 {inPercent.toFixed(1)}%</p>
        </div>
      )}
      <p className="mt-3 text-[13px] text-(--text-muted)">
        內盤＝以賣方掛單價成交（買方主動承接）；外盤＝以買方掛單價成交（賣方主動出脫）——傳統上分別視為偏多、偏空力道的參考，不是買賣建議。資料來源：Yahoo奇摩股市，僅供參考；抓不到時顯示「資料暫缺」，不會用示範數字頂替。
      </p>
    </div>
  );
}
