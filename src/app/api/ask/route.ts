import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/ask";
import type { ChatTurn } from "@/lib/ai/types";

const MAX_HISTORY_TURNS = 10;
const MAX_TURN_LENGTH = 2000;

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ChatTurn[] = [];
  for (const entry of raw.slice(-MAX_HISTORY_TURNS)) {
    if (
      entry &&
      typeof entry === "object" &&
      (entry.role === "user" || entry.role === "assistant") &&
      typeof entry.content === "string" &&
      entry.content.trim()
    ) {
      turns.push({ role: entry.role, content: entry.content.slice(0, MAX_TURN_LENGTH) });
    }
  }
  return turns;
}

export async function POST(req: NextRequest) {
  let body: { question?: string; symbol?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "問題不可為空" }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "問題過長，請控制在 500 字以內" }, { status: 400 });
  }

  const history = parseHistory(body.history);
  const result = await answerQuestion(question, body.symbol, history);
  return NextResponse.json(result);
}
