import Anthropic from "@anthropic-ai/sdk";
import { askGemini } from "@/lib/ai/gemini";
import type { ChatTurn } from "./types";

export type { ChatTurn };

export interface ProviderResult {
  answer: string;
  usedAi: boolean;
  /** Set only when usedAi is false — what each configured provider said when it failed. */
  failureReason?: string;
}

const MAX_HISTORY_TURNS = 10;

/**
 * Tries Gemini (free tier) then Anthropic, in that order, returning the
 * first successful text response. Shared by the chat Q&A and the daily
 * brief so both get the same provider fallback + logging behavior.
 * `messages` is the full turn sequence ending with the latest user turn —
 * pass a single-element array for a one-shot (non-chat) generation like
 * the daily brief.
 */
export async function callAiProviders(system: string, messages: ChatTurn[]): Promise<ProviderResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    return { answer: "", usedAi: false, failureReason: "沒有偵測到 GEMINI_API_KEY 或 ANTHROPIC_API_KEY 這兩個環境變數。" };
  }

  // Bound how much history we forward regardless of what the caller sends,
  // to keep latency/cost predictable on a long-running conversation.
  //
  // Then drop any leading assistant turns the window cut into: both
  // providers require the conversation to *start* with a user turn
  // (Anthropic rejects it outright, Gemini likewise). History arrives as
  // user/assistant pairs, so once a chat passed ~5 exchanges this slice
  // began at an assistant turn and every AI call 400'd — the widget quietly
  // stopped answering and fell back to the canned "raw data" reply for the
  // rest of the conversation, which reads as the AI having broken.
  let turns = messages.slice(-MAX_HISTORY_TURNS);
  const firstUser = turns.findIndex((t) => t.role === "user");
  turns = firstUser <= 0 ? turns : turns.slice(firstUser);

  const failures: string[] = [];
  if (turns.length === 0) {
    return { answer: "", usedAi: false, failureReason: "沒有可送出的對話內容。" };
  }

  if (geminiKey) {
    try {
      const answer = await askGemini(system, turns, geminiKey);
      return { answer, usedAi: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ai] Gemini call failed:", message);
      failures.push(`Gemini 呼叫失敗：${message.slice(0, 300)}`);
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system,
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
      });

      const answer = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (answer) return { answer, usedAi: true };
      failures.push("Claude 回傳了空白回覆");
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("[ai] Anthropic call failed:", errMessage);
      failures.push(`Claude 呼叫失敗：${errMessage.slice(0, 300)}`);
    }
  }

  return { answer: "", usedAi: false, failureReason: failures.join(" / ") };
}
