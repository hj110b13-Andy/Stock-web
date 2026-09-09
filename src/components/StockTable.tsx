import Link from "next/link";
import type { SearchItem } from "@/lib/data";
import { formatPercent, formatPrice, formatVolume, priceDirectionClass } from "@/lib/format";
import WatchlistButton from "./WatchlistButton";

export default function StockTable({ items, emptyLabel }: { items: SearchItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-(--text-muted)">{emptyLabel ?? "沒有符合條件的股票"}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--gridline) text-left text-(--text-muted)">
            <th className="w-8" />
            <th className="py-2 pr-4 font-medium">代碼 / 名稱</th>
            <th className="py-2 pr-4 font-medium">產業</th>
            <th className="py-2 pr-4 font-medium text-right">股價</th>
            <th className="py-2 pr-4 font-medium text-right">漲跌幅</th>
            <th className="py-2 pr-4 font-medium text-right">成交量</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.market}:${item.symbol}`} className="border-b border-(--gridline) last:border-0 hover:bg-(--page-plane)">
              <td className="py-2.5 pl-1">
                <WatchlistButton symbol={item.symbol} market={item.market} name={item.name} />
              </td>
              <td className="py-2.5 pr-4">
                <Link href={`/stock/${item.symbol}?market=${item.market}`} className="font-medium hover:text-(--accent)">
                  {item.name}
                  <span className="ml-1.5 text-(--text-muted) tabular-nums">{item.symbol}</span>
                </Link>
                <span className="ml-2 rounded bg-(--page-plane) px-1.5 py-0.5 text-[10px] text-(--text-muted)">
                  {item.market === "TW" ? "台股" : "美股"}
                </span>
                <span
                  className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                    item.isMock ? "bg-(--text-muted)" : "bg-(--accent)"
                  }`}
                  title={item.isMock ? "示範資料（無法取得即時報價，暫以離線資料顯示）" : "即時資料"}
                />
              </td>
              <td className="py-2.5 pr-4 text-(--text-secondary)">{item.sector}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {formatPrice(item.price, item.market === "TW" ? "TWD" : "USD")}
              </td>
              <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${priceDirectionClass(item.changePercent)}`}>
                {formatPercent(item.changePercent)}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-(--text-secondary)">{formatVolume(item.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
