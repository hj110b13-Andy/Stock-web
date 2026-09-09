"use client";

import { useEffect, useRef, useState } from "react";
import { ASK_ABOUT_EVENT, type AskAboutDetail } from "@/lib/chatEvents";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = ["2330 最近走勢如何？", "AAPL 現在多少錢？", "今天大盤表現如何？"];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextSymbol, setContextSymbol] = useState<AskAboutDetail | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleAskAbout(e: Event) {
      const detail = (e as CustomEvent<AskAboutDetail>).detail;
      setContextSymbol(detail);
      setOpen(true);
      setInput(`關於 ${detail.name}（${detail.symbol}），最近走勢如何？`);
    }
    window.addEventListener(ASK_ABOUT_EVENT, handleAskAbout);
    return () => window.removeEventListener(ASK_ABOUT_EVENT, handleAskAbout);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, symbol: contextSymbol?.symbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "發生錯誤");
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `抱歉，發生錯誤：${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-3 flex h-[28rem] w-[22rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-(--gridline) bg-(--surface-1) shadow-xl">
          <div className="flex items-center justify-between border-b border-(--gridline) px-4 py-3">
            <div>
              <p className="font-semibold text-sm">AI 股票問答</p>
              {contextSymbol && (
                <p className="text-xs text-(--text-muted)">目前聚焦：{contextSymbol.name}（{contextSymbol.symbol}）</p>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-(--text-muted) hover:text-(--text-primary)" aria-label="關閉">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-(--text-muted)">試試看這樣問：</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-md border border-(--gridline) px-3 py-2 text-left text-xs hover:bg-(--page-plane)"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-(--accent) text-white" : "bg-(--page-plane) text-(--text-primary)"
                  }`}
                >
                  {m.text}
                </p>
              </div>
            ))}
            {loading && <p className="text-xs text-(--text-muted)">思考中…</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-(--gridline) p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="輸入你的問題…"
              maxLength={500}
              className="flex-1 rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--accent)"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              送出
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-(--accent) text-white shadow-lg hover:opacity-90"
        aria-label="開啟 AI 問答"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
