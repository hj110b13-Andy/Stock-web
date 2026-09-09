import Anthropic from "@anthropic-ai/sdk";
import { askGemini } from "@/lib/ai/gemini";

export interface ProviderResult {
  answer: string;
  usedAi: boolean;
  /** Set only when usedAi is false — what each configured provider said when it failed. */
  failureReason?: string;
}

/**
 * Tries Gemini (free tier) then Anthropic, in that order, returning the
 * first successful text response. Shared by the chat Q&A and the daily
 * brief so both get the same provider fallback + logging behavior.
 */
export async function callAiProviders(system: string, userContent: string): Promise<ProviderResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    return { answer: "", usedAi: false, failureReason: "沒有偵測到 GEMINI_API_KEY 或 ANTHROPIC_API_KEY 這兩個環境變數。" };
  }

  const failures: string[] = [];

  if (geminiKey) {
    try {
      const answer = await askGemini(system, userContent, geminiKey);
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
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: userContent }],
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
