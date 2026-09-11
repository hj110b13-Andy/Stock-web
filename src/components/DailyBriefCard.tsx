import type { DailyBrief } from "@/lib/ai/brief";
import MarkdownLite from "./MarkdownLite";

export default function DailyBriefCard({ brief }: { brief: DailyBrief }) {
  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">📰 今日市場快報</h2>
        {!brief.usedAi && (
          <span className="rounded-full bg-(--page-plane) px-2 py-0.5 text-[11px] text-(--text-muted)">資料整理</span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-sm leading-relaxed text-(--text-secondary)">
        <MarkdownLite text={brief.text} />
      </div>
      <p className="mt-3 text-[11px] text-(--text-muted)">
        {brief.usedAi ? "由 AI 依當前市場資料自動生成，" : ""}
        僅為資訊整理與客觀描述，不構成投資建議 · 更新於{" "}
        {new Date(brief.generatedAt).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei" })}
      </p>
    </section>
  );
}
