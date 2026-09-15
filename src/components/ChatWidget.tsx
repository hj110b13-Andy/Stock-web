"use client";

import { useEffect, useRef, useState } from "react";
import { ASK_ABOUT_EVENT, type AskAboutDetail } from "@/lib/chatEvents";
import { getWatchlist } from "@/lib/watchlist";
import MarkdownLite from "./MarkdownLite";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = ["2330 最近走勢如何？", "AAPL 現在多少錢？", "今天大盤表現如何？"];

// Web Speech API 沒有內建在 TypeScript 的 lib.dom.d.ts 裡（各瀏覽器支援度也不一致，
// Chrome/Edge 用 webkit 前綴），這裡只宣告本元件實際會用到的最小介面，避免用 `any`。
interface SpeechRecognitionResultEvent extends Event {
  results: {
    length: number;
    [index: number]: { length: number; [index: number]: { transcript: string } };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// 長輩看得懂的簡短說法，涵蓋常見的語音辨識失敗情境。
const VOICE_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "請允許使用麥克風，才能用語音輸入喔。",
  "permission-denied": "請允許使用麥克風，才能用語音輸入喔。",
  "no-speech": "沒有偵測到聲音，請再靠近一點、慢慢說一次。",
  "audio-capture": "找不到麥克風，請確認裝置有連接麥克風。",
  network: "網路連線有問題，請稍後再試一次。",
  aborted: "語音輸入已取消。",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextSymbol, setContextSymbol] = useState<AskAboutDetail | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

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

  // 元件卸載時務必停止語音辨識，避免瀏覽器繼續在背景錄音、造成資源浪費或殘留的
  // onresult/onend callback 觸發已經不存在的 state setter。
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      // 不悶不吭聲：偵測不到 API 時明確告知使用者，不要讓按鈕看起來毫無反應。
      setVoiceError("您的瀏覽器不支援語音輸入，請改用輸入文字（建議改用電腦版 Chrome 或 Edge 瀏覽器）。");
      return;
    }

    setVoiceError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-TW";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        // 只填入輸入框、不自動送出——語音辨識偶爾會有錯字，讓使用者先看過再按送出。
        setInput(transcript);
      }
    };
    recognition.onerror = (event) => {
      setVoiceError(VOICE_ERROR_MESSAGES[event.error] ?? "語音辨識發生錯誤，請再試一次或改用輸入文字。");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError("語音輸入啟動失敗，請再試一次或改用輸入文字。");
      setListening(false);
    }
  }

  async function send(question: string, holdings?: ReturnType<typeof getWatchlist>) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, symbol: contextSymbol?.symbol, history, holdings }),
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
        // Fixed px, not rem: this box's own size is deliberately independent
        // of the site-wide root font-size (globals.css) — sizing it in rem
        // meant a global text-size increase silently grew this floating
        // panel too (448px -> 504px tall), which could push it past the top
        // of a modest browser window since it's anchored to the bottom
        // (fixed bottom-4 right-4) with nothing to shrink it back down,
        // showing as the widget being cut off / not fully visible. A
        // max-height safety clamp on top of the fixed size means this can't
        // recur even if the root font-size changes again later.
        <div className="mb-3 flex h-[448px] max-h-[calc(100vh-6rem)] w-[352px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-(--gridline) bg-(--surface-1) shadow-xl">
          <div className="flex items-center justify-between border-b border-(--gridline) px-4 py-3">
            <div>
              <p className="font-semibold text-sm">AI 股票問答</p>
              {contextSymbol && (
                // Clearable: the widget lives in the root layout, so the
                // focus set by "問 AI 關於 X" outlived navigating away from
                // that stock's page. Asking "今天大盤表現如何？" from the
                // homepage afterwards was still being answered as a question
                // about X, with no way to undo it short of a reload.
                <p className="flex items-center gap-1 text-xs text-(--text-muted)">
                  目前聚焦：{contextSymbol.name}（{contextSymbol.symbol}）
                  <button
                    onClick={() => setContextSymbol(null)}
                    className="rounded px-1 leading-none hover:bg-(--page-plane) hover:text-(--text-primary)"
                    aria-label="取消聚焦此股票"
                    title="取消聚焦，改問一般問題"
                  >
                    ✕
                  </button>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([]);
                    setContextSymbol(null);
                  }}
                  className="text-xs text-(--text-muted) hover:text-(--text-primary)"
                  title="清空對話"
                >
                  清空對話
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-(--text-muted) hover:text-(--text-primary)" aria-label="關閉">
                ✕
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                {getWatchlist().length > 0 && (
                  <button
                    onClick={() => send("幫我分析一下我關注清單裡的每一檔股票", getWatchlist())}
                    // text-(--accent) on bg-(--accent-soft) measured 3.34:1 light /
                    // 2.23:1 dark — both under WCAG AA's 4.5:1 for text. text-primary
                    // on the same background clears 14.87:1 / 8.10:1 while the
                    // border+background still read as the same accent-tinted button.
                    className="block w-full rounded-md border border-(--accent) bg-(--accent-soft) px-3 py-2 text-left text-xs font-medium text-(--text-primary) hover:opacity-90"
                  >
                    📋 分析我的關注清單（{getWatchlist().length} 檔）
                  </button>
                )}
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
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-(--accent) text-white" : "bg-(--page-plane) text-(--text-primary)"
                  }`}
                >
                  {m.role === "assistant" ? <MarkdownLite text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                </div>
              </div>
            ))}
            {loading && <p className="text-xs text-(--text-muted)">思考中…</p>}
          </div>

          <div className="border-t border-(--gridline) p-3">
            {(listening || voiceError) && (
              <p
                className={`mb-2 text-xs font-medium ${listening ? "text-(--accent)" : "text-(--price-up)"}`}
                role="status"
              >
                {listening ? "🎤 聆聽中…請說話" : `⚠️ ${voiceError}`}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="輸入你的問題，或按🎤說話…"
                maxLength={500}
                className="min-w-0 flex-1 rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--accent)"
              />
              <button
                type="button"
                onClick={toggleVoiceInput}
                aria-label={listening ? "停止語音輸入" : "開始語音輸入"}
                title={listening ? "停止語音輸入" : "語音輸入（用講的問問題）"}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  listening
                    ? "animate-pulse bg-(--price-up) text-white"
                    : "border border-(--gridline) bg-(--surface-2) text-(--text-primary) hover:bg-(--page-plane)"
                }`}
              >
                {listening ? "⏹" : "🎤"}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                送出
              </button>
            </form>
          </div>
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
