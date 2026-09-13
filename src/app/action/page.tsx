import type { Metadata } from "next";
import ActionBriefCard from "@/components/ActionBriefCard";

export const metadata: Metadata = {
  title: "今日建議",
  description: "給沒有股市背景的人看的今日行動建議，用白話文直接講今天該注意什麼、留意哪些標的。",
  alternates: { canonical: "/action" },
};

export default function ActionPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">今日建議</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          不需要懂股票也看得懂：用白話文直接講今天市場大概是什麼氣氛、有哪些具體值得留意的標的與消息、要注意什麼風險，專有名詞會順帶解釋。
        </p>
      </div>
      <ActionBriefCard />
    </div>
  );
}
