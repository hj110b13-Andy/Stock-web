import type { Metadata } from "next";
import NewsFeedList from "@/components/NewsFeedList";

export const metadata: Metadata = {
  title: "重大新聞",
  description: "台股與美股近期重要新聞總覽，重大消息置頂，其餘依時間排序，可持續下滑載入更多。",
  alternates: { canonical: "/news" },
};

export default function NewsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">重大新聞</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          彙整台股與美股近期新聞，AI 判斷可能影響整體大盤的重大消息會置頂顯示（數量依當下情況而定，可能沒有），其餘依時間新到舊排列，往下捲動載入更多。內容不限當天，只要是近期、可能有影響力的消息都會收錄。
        </p>
      </div>
      <NewsFeedList />
    </div>
  );
}
