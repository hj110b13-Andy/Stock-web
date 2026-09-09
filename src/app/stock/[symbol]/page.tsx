import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StockChart from "@/components/StockChart";
import AskAboutButton from "@/components/AskAboutButton";
import WatchlistButton from "@/components/WatchlistButton";
import FundamentalsCard from "@/components/FundamentalsCard";
import { getQuote, getFundamentals, detectMarket, normalizeSymbol } from "@/lib/data";
import type { Market } from "@/lib/data";
import { formatChange, formatPercent, formatPrice, formatVolume, priceDirectionClass } from "@/lib/format";

export const revalidate = 0;

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ market?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const { market } = await searchParams;
  const marketHint = market === "TW" || market === "US" ? (market as Market) : undefined;
  const resolvedSymbol = normalizeSymbol(symbol);
  const resolvedMarket = marketHint ?? detectMarket(resolvedSymbol);
  const marketLabel = resolvedMarket === "TW" ? "台股" : "美股";

  const quote = await getQuote(symbol, marketHint);
  if (!quote) {
    return {
      title: `${resolvedSymbol}（${marketLabel}）`,
      description: `查詢 ${resolvedSymbol}（${marketLabel}）即時報價、K 線圖與技術訊號。`,
      alternates: { canonical: `/stock/${resolvedSymbol}?market=${resolvedMarket}` },
    };
  }

  const title = `${quote.name}（${quote.symbol}）${marketLabel}即時報價`;
  const description = `${quote.name}（${quote.symbol}）${marketLabel}目前 ${formatPrice(quote.price, quote.currency)} ${quote.currency}，${
    quote.change >= 0 ? "上漲" : "下跌"
  } ${formatPercent(quote.changePercent)}。查看即時報價、K 線圖、成交量與客觀技術訊號。`;

  return {
    title,
    description,
    alternates: { canonical: `/stock/${quote.symbol}?market=${quote.market}` },
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function StockDetailPage({ params, searchParams }: PageProps) {
  const { symbol } = await params;
  const { market } = await searchParams;
  if (!symbol) notFound();

  const marketHint = market === "TW" || market === "US" ? (market as Market) : undefined;
  const [quote, fundamentals] = await Promise.all([
    getQuote(symbol, marketHint),
    getFundamentals(symbol, marketHint),
  ]);

  if (!quote) {
    const resolvedSymbol = normalizeSymbol(symbol);
    const resolvedMarket = marketHint ?? detectMarket(resolvedSymbol);
    return (
      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-6 text-center">
        <h1 className="text-lg font-semibold">
          {resolvedSymbol}（{resolvedMarket === "TW" ? "台股" : "美股"}）目前無法取得即時資料
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          可能是資料來源暫時無法連線或代碼不存在，請稍後再試一次。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <WatchlistButton symbol={quote.symbol} market={quote.market} name={quote.name} size="md" />
              <h1 className="text-2xl font-bold">{quote.name}</h1>
              <span className="rounded bg-(--page-plane) px-2 py-0.5 text-xs text-(--text-muted)">
                {quote.symbol} · {quote.market === "TW" ? "台股" : "美股"}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">{formatPrice(quote.price, quote.currency)}</span>
              <span className={`text-lg font-semibold tabular-nums ${priceDirectionClass(quote.change)}`}>
                {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "–"} {formatChange(quote.change, quote.currency)} (
                {formatPercent(quote.changePercent)})
              </span>
            </div>
            <p className="mt-1 text-xs text-(--text-muted)">
              更新時間：{new Date(quote.updatedAt).toLocaleString("zh-TW")} · 幣別 {quote.currency}
            </p>
          </div>
          <AskAboutButton symbol={quote.symbol} market={quote.market} name={quote.name} />
        </div>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="開盤" value={formatPrice(quote.open, quote.currency)} />
          <Stat label="最高" value={formatPrice(quote.high, quote.currency)} valueClass="text-(--price-up)" />
          <Stat label="最低" value={formatPrice(quote.low, quote.currency)} valueClass="text-(--price-down)" />
          <Stat label="昨收" value={formatPrice(quote.prevClose, quote.currency)} />
          <Stat label="成交量" value={formatVolume(quote.volume, quote.market)} />
        </dl>
      </section>

      <FundamentalsCard fundamentals={fundamentals} currency={quote.currency} />

      <StockChart symbol={quote.symbol} market={quote.market} currentPrice={quote.price} />
      <p className="text-xs text-(--text-muted)">
        圖表上方標籤為根據歷史價量計算出的客觀技術訊號（例如成交量、均線、區間高低），僅描述數據現況，不是買賣建議。
      </p>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular-nums ${valueClass ?? ""}`}>{value}</dd>
    </div>
  );
}
