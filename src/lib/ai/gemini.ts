import { cached, fetchWithTimeout } from "@/lib/data/cache";

// Google Gemini API (generativelanguage.googleapis.com) via plain REST call,
// so no extra SDK dependency is needed. Free tier: apply for a key at
// https://aistudio.google.com/apikey (no credit card required).
//
// Google periodically retires model snapshots (and even "-latest" aliases),
// so instead of hardcoding a model name here (which breaks the moment
// Google retires it), we ask the API which models this key can actually
// use and pick one at runtime. Cached for an hour so it isn't refetched on
// every question.

interface ModelsListResponse {
  models?: Array<{
    name: string; // "models/gemini-x-y"
    supportedGenerationMethods?: string[];
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

async function resolveModel(apiKey: string): Promise<string> {
  return cached(`gemini:model:${apiKey.slice(-8)}`, 60 * 60_000, async () => {
    if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetchWithTimeout(url, 8000);
    const data = (await res.json()) as ModelsListResponse;
    const usable = (data.models ?? []).filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );
    if (usable.length === 0) {
      throw new Error("這組 Gemini API 金鑰目前沒有任何可用的生成模型");
    }

    // Prefer a "flash" model (fast/cheap, free-tier friendly) over "pro";
    // skip anything that looks like an embedding/vision-only variant.
    const preferred =
      usable.find((m) => /flash/i.test(m.name) && !/embedding|vision/i.test(m.name)) ?? usable[0];
    return preferred.name.replace(/^models\//, "");
  });
}

export async function askGemini(system: string, userContent: string, apiKey: string): Promise<string> {
  const model = await resolveModel(apiKey);
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
