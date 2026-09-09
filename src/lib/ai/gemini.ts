import { fetchWithTimeout } from "@/lib/data/cache";

// Google Gemini API (generativelanguage.googleapis.com) via plain REST call,
// so no extra SDK dependency is needed. Free tier: apply for a key at
// https://aistudio.google.com/apikey (no credit card required).
//
// Use the "-latest" alias rather than a dated snapshot (e.g. "gemini-2.5-flash")
// so this doesn't silently break again once Google retires today's model —
// override via GEMINI_MODEL if a specific pinned version is ever needed.
const DEFAULT_MODEL = "gemini-flash-latest";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

// If the primary model has also been retired (as happened with the
// previously-hardcoded "gemini-2.5-flash"), fall back to an older but
// broadly-available snapshot rather than failing outright.
const FALLBACK_MODEL = "gemini-2.0-flash";

export async function askGemini(system: string, userContent: string, apiKey: string): Promise<string> {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const candidates = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

  let lastError: unknown;
  for (const model of candidates) {
    try {
      return await callGemini(model, system, userContent, apiKey);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callGemini(model: string, system: string, userContent: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetchWithTimeout(url, 12000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error(data.promptFeedback?.blockReason ?? `Gemini（${model}）回應為空`);
  }
  return text.trim();
}
