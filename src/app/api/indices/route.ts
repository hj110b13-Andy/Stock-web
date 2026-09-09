import { NextResponse } from "next/server";
import { getIndices } from "@/lib/data";

export async function GET() {
  try {
    const indices = await getIndices();
    return NextResponse.json({ indices });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
