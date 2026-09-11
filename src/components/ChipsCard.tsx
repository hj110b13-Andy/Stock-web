import type { Chips, MaterialAnnouncement } from "@/lib/data";
import { priceDirectionClass } from "@/lib/format";

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("zh-TW")}`;
}

/**
 * TW only — 三大法人買賣超／融資融券餘額（籌碼面）與近期重大訊息公告。
 * 個股頁只在 market === "TW" 時渲染這個卡片，美股沒有對應的公開資料源。
 */
export default function ChipsCard({
  chips,
  announcements,
}: {
  chips: Chips | null;
  announcements: MaterialAnnouncement[];
}) {
  const hasChips =
    chips && (chips.institutionalNetShares != null || chips.marginBalance != null || chips.shortBalance != null);

  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-4">
      <h2 className="mb-3 font-semibold">籌碼面{chips?.date ? `（${chips.date}）` : ""}</h2>
      {!hasChips ? (
        <p className="text-sm text-(--text-muted)">目前無法取得這檔股票的籌碼資料</p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-(--text-muted)">三大法人合計買賣超</dt>
            <dd
              className={`mt-0.5 font-medium tabular-nums ${
                chips.institutionalNetShares != null ? priceDirectionClass(chips.institutionalNetShares) : ""
              }`}
            >
              {chips.institutionalNetShares != null ? `${signed(chips.institutionalNetShares)} 股` : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">外資買賣超</dt>
            <dd
              className={`mt-0.5 font-medium tabular-nums ${
                chips.foreignNetShares != null ? priceDirectionClass(chips.foreignNetShares) : ""
              }`}
            >
              {chips.foreignNetShares != null ? `${signed(chips.foreignNetShares)} 股` : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">投信買賣超</dt>
            <dd
              className={`mt-0.5 font-medium tabular-nums ${
                chips.trustNetShares != null ? priceDirectionClass(chips.trustNetShares) : ""
              }`}
            >
              {chips.trustNetShares != null ? `${signed(chips.trustNetShares)} 股` : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">自營商買賣超</dt>
            <dd
              className={`mt-0.5 font-medium tabular-nums ${
                chips.dealerNetShares != null ? priceDirectionClass(chips.dealerNetShares) : ""
              }`}
            >
              {chips.dealerNetShares != null ? `${signed(chips.dealerNetShares)} 股` : "資料暫缺"}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">融資餘額</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {chips.marginBalance != null ? `${chips.marginBalance.toLocaleString("zh-TW")} 張` : "資料暫缺"}
              {chips.marginBalanceChange != null && (
                <span className={`ml-1 text-xs ${priceDirectionClass(chips.marginBalanceChange)}`}>
                  ({signed(chips.marginBalanceChange)})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">融券餘額</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {chips.shortBalance != null ? `${chips.shortBalance.toLocaleString("zh-TW")} 張` : "資料暫缺"}
              {chips.shortBalanceChange != null && (
                <span className={`ml-1 text-xs ${priceDirectionClass(chips.shortBalanceChange)}`}>
                  ({signed(chips.shortBalanceChange)})
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 border-t border-(--gridline) pt-3">
        <h3 className="mb-2 text-sm font-medium">近期重大訊息</h3>
        {announcements.length === 0 ? (
          <p className="text-sm text-(--text-muted)">最近一個交易日沒有重大訊息公告</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-(--text-secondary)">
            {announcements.map((a, i) => (
              <li key={i}>
                <span className="text-(--text-muted)">{a.date}</span> {a.subject}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[11px] text-(--text-muted)">
        資料來源：TWSE 公開資訊（三大法人買賣超單位為股、融資融券單位為張，收盤後更新）。僅台股提供，抓不到時顯示「資料暫缺」，不會用示範數字頂替。
      </p>
    </div>
  );
}
