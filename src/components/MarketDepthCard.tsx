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
  // 外盤在左、內盤在右——跟下面橫條的紅（外盤/買氣）在左、綠（內盤/賣壓）在右
  // 保持視覺順序一致，紅在前也符合「由多到空」的直覺閱讀順序。
  const outPercent = total > 0 ? (outMarketLots / total) * 100 : 50;

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="mb-3 font-semibold">內外盤</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          {/* 外盤＝用賣方開的（比較高的）價格成交，代表買方比較急、願意追價
              買進，所以外盤越多代表買氣越強——跟股價「上漲」是同一種紅色，
              直覺上比較好對應。之前的版本把內外盤跟紅綠顏色的對應寫反了。 */}
          <dt className="text-(--text-muted)">外盤（張）— 買氣</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-(--price-up)">{outMarketLots.toLocaleString()}</dd>
        </div>
        <div>
          {/* 內盤＝用買方開的（比較低的）價格成交，代表賣方比較急、願意殺價
              賣出，所以內盤越多代表賣壓越重——用「下跌」的綠色比較直覺。 */}
          <dt className="text-(--text-muted)">內盤（張）— 賣壓</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-(--price-down)">{inMarketLots.toLocaleString()}</dd>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-(--page-plane)">
            <div className="bg-(--price-up)" style={{ width: `${outPercent}%` }} />
            <div className="bg-(--price-down)" style={{ width: `${100 - outPercent}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-(--text-muted)">外盤（買氣）佔比 {outPercent.toFixed(1)}%</p>
        </div>
      )}
      <p className="mt-3 text-[13px] text-(--text-muted)">
        外盤：用比較高的價格（賣方開的價）成交，代表買方比較心急、願意追價買進，通常解讀為買氣較強。內盤：用比較低的價格（買方開的價）成交，代表賣方比較心急、願意降價賣出，通常解讀為賣壓較重。這只是傳統上的參考解讀，不是買賣建議。資料來源：Yahoo奇摩股市，僅供參考；抓不到時顯示「資料暫缺」，不會用示範數字頂替。
      </p>
    </div>
  );
}
