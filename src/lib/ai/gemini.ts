import { fetchWithTimeout } from "@/lib/data/cache";
import type { ChatTurn } from "./types";

// Google Gemini API (generativelanguage.googleapis.com) via plain REST call,
// so no extra SDK dependency is needed. Free tier: apply for a key at
// https://aistudio.google.com/apikey (no credit card required).
//
// Google retires model snapshots (and even "-latest" aliases) over time,
// and its ListModels endpoint can still list a model as
// generateContent-capable even after it's been retired for an account
// (observed: gemini-2.5-flash and gemini-2.0-flash both listed, both
// 404 in practice). So instead of trusting one guessed or listed name,
// we try candidates in order against the real generateContent endpoint
// and remember whichever one actually works.

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

// Per-key cache of the last model confirmed to actually work, so most
// requests skip straight to a single call instead of re-probing.
const knownGoodModel = new Map<string, string>();
const MAX_CANDIDATES = 4;

async function listCandidateModels(apiKey: string): Promise<string[]> {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetchWithTimeout(url, 6000);
  const data = (await res.json()) as ModelsListResponse;
  const usable = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  if (usable.length === 0) {
    throw new Error("這組 Gemini API 金鑰目前沒有任何可用的生成模型");
  }

  // Try "flash" models first (fast/cheap, free-tier friendly), skip
  // embedding/vision-only variants, then fall back to whatever else exists.
  const flash = usable.filter((n) => /flash/i.test(n) && !/embedding|vision/i.test(n));
  const rest = usable.filter((n) => !flash.includes(n));
  return [...flash, ...rest].slice(0, MAX_CANDIDATES);
}

async function callGemini(model: string, system: string, messages: ChatTurn[], apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetchWithTimeout(url, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      // Gemini uses "model" rather than "assistant" for the AI's turns.
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error(data.promptFeedback?.blockReason ?? `Gemini（${model}）回應為空`);
  }
  return text.trim();
}

export async function askGemini(system: string, messages: ChatTurn[], apiKey: string): Promise<string> {
  const keyId = apiKey.slice(-8);
  const known = knownGoodModel.get(keyId);

  if (known) {
    try {
      return await callGemini(known, system, messages, apiKey);
    } catch {
      knownGoodModel.delete(keyId); // it stopped working; re-probe below
    }
  }

  const candidates = await listCandidateModels(apiKey);
  let lastError: unknown;
  for (const model of candidates) {
    if (model === known) continue; // already just failed above
    try {
      const text = await callGemini(model, system, messages, apiKey);
      knownGoodModel.set(keyId, model);
      return text;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError) || "沒有任何 Gemini 模型可用");
}
