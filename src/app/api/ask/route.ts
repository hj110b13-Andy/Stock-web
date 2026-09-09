import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/ask";

export async function POST(req: NextRequest) {
  let body: { question?: string; symbol?: string };
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

  const result = await answerQuestion(question, body.symbol);
  return NextResponse.json(result);
}
