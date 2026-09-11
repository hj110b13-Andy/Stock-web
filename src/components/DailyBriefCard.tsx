"use client";

import { useEffect, useState } from "react";
import type { DailyBrief } from "@/lib/ai/brief";
import MarkdownLite from "./MarkdownLite";

/**
 * Fetched client-side rather than server-rendered — the brief now covers
 * four sections (大盤連動/台股/美股/近期重點回顧) with news + chip grounding,
 * which made it the slowest thing on the homepage on a cache-cold day (see
 * MomentumSection.tsx for the same pattern, first used to fix this exact
 * class of problem on /highlights). This keeps a heavy/rare-cold-path AI
 * call from blocking the rest of the homepage (indices, movers, watchlist).
 */
export default function DailyBriefCard() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-brief")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data) => !cancelled && setBrief(data.brief))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-lg border border-(--gridline) bg-(--surface-1) p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">📰 今日市場快報</h2>
        {brief && !brief.usedAi && (
          <span className="rounded-full bg-(--page-plane) px-2 py-0.5 text-[11px] text-(--text-muted)">資料整理</span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-sm leading-relaxed text-(--text-secondary)">
        {failed ? (
          <p className="text-(--text-muted)">快報目前無法取得，請稍後再試。</p>
        ) : brief ? (
          <MarkdownLite text={brief.text} />
        ) : (
          <BriefSkeleton />
        )}
      </div>
      <p className="mt-3 text-[11px] text-(--text-muted)">
        {brief?.usedAi ? "由 AI 依當前市場資料自動生成，" : ""}
        僅為資訊整理與客觀描述，不構成投資建議
        {brief ? ` · 更新於 ${new Date(brief.generatedAt).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei" })}` : ""}
      </p>
    </section>
  );
}

function BriefSkeleton() {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded bg-(--page-plane)" style={{ width: `${85 - i * 8}%` }} />
      ))}
    </div>
  );
}
