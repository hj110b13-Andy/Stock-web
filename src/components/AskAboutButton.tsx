"use client";

import { ASK_ABOUT_EVENT, type AskAboutDetail } from "@/lib/chatEvents";

export default function AskAboutButton({ symbol, market, name }: AskAboutDetail) {
  function handleClick() {
    window.dispatchEvent(new CustomEvent<AskAboutDetail>(ASK_ABOUT_EVENT, { detail: { symbol, market, name } }));
  }

  return (
    <button
      onClick={handleClick}
      className="shrink-0 rounded-md border border-(--gridline) bg-(--surface-2) px-4 py-2 text-sm font-medium hover:bg-(--page-plane)"
    >
      問 AI 關於 {name}
    </button>
  );
}
