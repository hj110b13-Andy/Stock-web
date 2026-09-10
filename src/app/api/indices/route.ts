import { NextResponse } from "next/server";
import { getIndices } from "@/lib/data";

export async function GET() {
  try {
    const indices = await getIndices();
    return NextResponse.json({ indices });
  } catch (err) {
    console.error("[indices] getIndices failed:", err);
    return NextResponse.json({ error: "取得指數時發生錯誤" }, { status: 500 });
  }
}
