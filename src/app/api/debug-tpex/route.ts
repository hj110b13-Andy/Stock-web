import { NextResponse } from "next/server";
import https from "node:https";
import tls from "node:tls";
import { fetchTpexQuote } from "@/lib/data/tpex";

// TEMPORARY diagnostic route — added to debug a production-only TPEx fetch
// failure (works from local dev machine, fails from Vercel). Reports the
// raw fetch outcome (status, headers, byte counts, error details) rather
// than swallowing it into the app's normal "資料暫缺" fallback. Delete this
// file once the TPEx integration is confirmed working end-to-end on Vercel.

function rawHttpsGet(url: string, agent: https.Agent): Promise<{ status: number; bytes: number; err?: string }> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { agent, headers: { "User-Agent": "Mozilla/5.0 (compatible; StockRadar/1.0)" }, timeout: 8000 },
      (res) => {
        let bytes = 0;
        res.on("data", (c: Buffer) => (bytes += c.length));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, bytes }));
        res.on("error", (e) => resolve({ status: 0, bytes: 0, err: String(e) }));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, bytes: 0, err: "timeout" });
    });
    req.on("error", (e) => resolve({ status: 0, bytes: 0, err: e instanceof Error ? `${e.name}: ${e.message}${e.cause ? ` cause=${String(e.cause)}` : ""}` : String(e) }));
  });
}

export async function GET() {
  const url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";
  const results: Record<string, unknown> = {};

  // Test 1: plain global fetch (expected to fail with the TLS error, per
  // the original diagnosis) — baseline to confirm the environment is
  // unchanged.
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    const buf = await res.arrayBuffer();
    results.plainFetch = { ok: true, status: res.status, bytes: buf.byteLength };
  } catch (err) {
    results.plainFetch = {
      ok: false,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      cause: err instanceof Error && err.cause ? String(err.cause) : undefined,
    };
  }

  // Test 2: node:https with default agent (no extra CA) — should fail the
  // same way as plain fetch, confirming it's a Node-TLS-level issue, not a
  // fetch-API-specific quirk.
  results.httpsDefaultAgent = await rawHttpsGet(url, new https.Agent({}));

  // Test 3: node:https with tls.rootCertificates only (no TWCA certs added)
  // — same as test 2 in effect, sanity check the baseline default set.
  results.httpsRootCertsOnly = await rawHttpsGet(url, new https.Agent({ ca: [...tls.rootCertificates] }));

  // Test 4: the actual fetchTpexQuote() from tpex.ts, exactly as the real
  // app calls it — this is the one that matters.
  try {
    const start = Date.now();
    const quote = await fetchTpexQuote("3293");
    results.fetchTpexQuote = { ok: true, elapsedMs: Date.now() - start, quote };
  } catch (err) {
    results.fetchTpexQuote = {
      ok: false,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      cause: err instanceof Error && err.cause ? String(err.cause) : undefined,
    };
  }

  return NextResponse.json(results);
}
