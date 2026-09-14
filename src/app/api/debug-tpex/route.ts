import { NextResponse } from "next/server";

// TEMPORARY diagnostic route — added to debug a production-only TPEx fetch
// failure (works from local dev machine, fails from Vercel). Reports the
// raw fetch outcome (status, headers, byte counts, error details) rather
// than swallowing it into the app's normal "資料暫缺" fallback. Delete this
// file once the TPEx integration is confirmed working end-to-end on Vercel.
export async function GET() {
  const url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; StockRadar/1.0)" };
  try {
    const start = Date.now();
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const elapsedToHeaders = Date.now() - start;
    const contentLength = res.headers.get("content-length");
    const buf = await res.arrayBuffer();
    const elapsedTotal = Date.now() - start;
    const bytes = Buffer.from(buf);
    let parseOk = false;
    let parseErr = "";
    let rowCount: number | undefined;
    try {
      const parsed = JSON.parse(bytes.toString("utf8"));
      parseOk = true;
      rowCount = Array.isArray(parsed) ? parsed.length : undefined;
    } catch (e) {
      parseErr = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json({
      ok: true,
      status: res.status,
      contentLength,
      actualBytes: bytes.length,
      elapsedToHeadersMs: elapsedToHeaders,
      elapsedTotalMs: elapsedTotal,
      parseOk,
      parseErr,
      rowCount,
      responseHeaders: Object.fromEntries(res.headers.entries()),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCause: err instanceof Error && err.cause ? String(err.cause) : undefined,
      errorStack: err instanceof Error ? err.stack : undefined,
    });
  }
}
