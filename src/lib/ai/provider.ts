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

export interface CallAiProvidersOptions {
  /** Gemini request timeout in ms (default 12000). */
  timeoutMs?: number;
  /** Output token cap for both providers (default 1000). The daily brief
   *  passes a higher value since it now generates a longer, four-section
   *  write-up than a typical chat answer. */
  maxOutputTokens?: number;
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
export async function callAiProviders(
  system: string,
  messages: ChatTurn[],
  options: CallAiProvidersOptions = {}
): Promise<ProviderResult> {
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

  // Both providers also reject two consecutive turns with the same role.
  // The chat widget always alternates strictly so this never fires there,
  // but `messages` is caller-supplied, and a caller that ever passes two
  // user (or assistant) turns back to back would otherwise 400 the same
  // way the leading-assistant-turn bug used to.
  turns = turns.reduce<ChatTurn[]>((merged, turn) => {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
    return merged;
  }, []);

  const failures: string[] = [];
  if (turns.length === 0) {
    return { answer: "", usedAi: false, failureReason: "沒有可送出的對話內容。" };
  }

  if (geminiKey) {
    try {
      const answer = await askGemini(system, turns, geminiKey, {
        timeoutMs: options.timeoutMs,
        maxOutputTokens: options.maxOutputTokens,
      });
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
        max_tokens: options.maxOutputTokens ?? 1000,
        system,
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
      });

      const answer = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      // Same failure mode Gemini had (see gemini.ts's finishReason check): a
      // reply cut off by the output-token cap is still a non-empty string,
      // so without this an Opus QA pass correctly flagged that a truncated
      // Claude answer — most likely exactly when it's being used because
      // Gemini already failed — would sail through as usedAi:true and get
      // cached as-is (the daily brief caches for ~25h) instead of falling
      // through to the "raw data" canned answer.
      if (message.stop_reason === "max_tokens") {
        failures.push("Claude 回覆被輸出長度上限截斷");
      } else if (answer) {
        return { answer, usedAi: true };
      } else {
        failures.push("Claude 回傳了空白回覆");
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("[ai] Anthropic call failed:", errMessage);
      failures.push(`Claude 呼叫失敗：${errMessage.slice(0, 300)}`);
    }
  }

  return { answer: "", usedAi: false, failureReason: failures.join(" / ") };
}
