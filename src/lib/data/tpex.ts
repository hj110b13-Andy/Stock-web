import https from "node:https";
import tls from "node:tls";
import { cachedMap } from "./cache";
import type { Candle, ChartRange, Chips, Earnings, Fundamentals, MaterialAnnouncement, Quote } from "./types";
import { findInUniverse, type UniverseEntry } from "./universe";
import { TW_INDUSTRY_NAMES } from "./twse";

// TPEx (Taipei Exchange / 證券櫃檯買賣中心) public data endpoints for 上櫃
// (OTC mainboard) stocks. Confirmed live during this module's construction —
// all free, no API key. Deliberately mirrors twse.ts's shape/behaviour
// (never fabricate; return null/undefined/empty when data isn't available)
// but is NOT a straight port: several field names, units, and quirks differ
// from TWSE's equivalents (documented inline below where they do).
//
// Scope boundary: this covers 上櫃 (OTC mainboard) only. 興櫃 (Emerging
// Stock Market) is a separate market with its own different data feed and is
// explicitly out of scope — do not extend this file to cover it.
//
// A plain User-Agent header is sent on every request: TPEx has been observed
// to occasionally 302-redirect requests with no UA at all.
const TPEX_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockRadar/1.0)" };

/**
 * ROOT CAUSE, found live via a temporary diagnostic route deployed to
 * production: every TPEx fetch failed on Vercel (100% of the time — not
 * intermittent) with `TypeError: fetch failed` / cause
 * "unable to verify the first certificate", while the exact same fetch
 * succeeded reliably from this project's local dev machine. `openssl
 * s_client -showcerts` against www.tpex.org.tw confirmed the server presents
 * its leaf cert plus one intermediate ("TWCA SSL Certification Authority")
 * but relies on the client already trusting the root ("TWCA CYBER Root CA",
 * Taiwan's TWCA national CA) — Windows' own certificate store trusts that
 * root (hence curl/Node both working fine on this dev machine), but it is
 * NOT part of Node's bundled Mozilla-derived default CA list, so Node's
 * `fetch`/TLS stack on Vercel's Linux runtime can't complete the chain and
 * refuses the connection outright before any bytes are exchanged. This is
 * NOT the response-truncation issue chased earlier in this same build
 * (that was real too, but separate, and apparently specific to conditions
 * on the local dev network — it never showed up as the failure mode on
 * Vercel; there it was 100% a TLS handshake failure, not a partial body).
 *
 * Fix: a dedicated `https.Agent` for TPEx requests with this one root CA
 * added on top of Node's default trusted set (`tls.rootCertificates`) —
 * this is additive (nothing stops trusting anything it trusted before), not
 * a blanket `rejectUnauthorized: false`, so certificate validation stays
 * fully enforced, just now able to complete the one chain that was missing.
 * Verified live on Vercel after deploying this fix (see PROGRESS.md).
 */
const TWCA_CYBER_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIFjTCCA3WgAwIBAgIQQAE0jMIAAAAAAAAAATzyxjANBgkqhkiG9w0BAQwFADBQ
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3QgQ0EwHhcNMjIxMTIyMDY1NDI5
WhcNNDcxMTIyMTU1OTU5WjBQMQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FO
LUNBMRAwDgYDVQQLEwdSb290IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3Qg
Q0EwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDG+Moe2Qkgfh1sTs6P
40czRJzHyWmqOlt47nDSkvgEs1JSHWdyKKHfi12VCv7qze33Kc7wb3+szT3vsxxF
avcokPFhV8UMxKNQXd7UtcsZyoC5dc4pztKFIuwCY8xEMCDa6pFbVuYdHNWdZsc/
34bKS1PE2Y2yHer43CdTo0fhYcx9tbD47nORxc5zb87uEB8aBs/pJ2DFTxnk684i
JkXXYJndzk834H/nY62wuFm40AZoNWDTNq5xQwTxaWV4fPMf88oon1oglWa0zbfu
j3ikRRjpJi+NmykosaS3Om251Bw4ckVYsV7r8Cibt4LK/c/WMw+f+5eesRycnupf
Xtuq3VTpMCEobY5583WSjCb+3MX2w7DfRFlDo7YDKPYIMKoNM+HvnKkHIuNZW0CP
2oi3aQiotyMuRAlZN1vH4xfyIutuOVLF3lSnmMlLIJXcRolftBL5hSmO68gnFSDA
S9TMfAxsNAwmmyYxpjyn9tnQS6Jk/zuZQXLB4HCX8SS7K8R0IrGsayIyJNN4KsDA
oS/xUgXJP+92ZuJF2A09rZXIx4kmyA+upwMu+8Ff+iDhcK2wZSA3M2Cw1a/XDBzC
kHDXShi8fgGwsOsVHkQGzaRP6AzRwyAQ4VRlnrZR0Bp2a0JaWHY06rc3Ga4udfmW
5cFZ95RXKSWNOkyrTZpB0F8mAwIDAQABo2MwYTAOBgNVHQ8BAf8EBAMCAQYwDwYD
VR0TAQH/BAUwAwEB/zAfBgNVHSMEGDAWgBSdhWEUfMFib5do5E83QOGt4A1WNzAd
BgNVHQ4EFgQUnYVhFHzBYm+XaORPN0DhreANVjcwDQYJKoZIhvcNAQEMBQADggIB
AGSPesRiDrWIzLjHhg6hShbNcAu3p4ULs3a2D6f/CIsLJc+o1IN1KriWiLb73y0t
tGlTITVX1olNc79pj3CjYcya2x6a4CD4bLubIp1dhDGaLIrdaqHXKGnK/nZVekZn
68xDiBaiA9a5F/gZbG0jAn/xX9AKKSM70aoK7akXJlQKTcKlTfjF/biBzysseKNn
TKkHmvPfXvt89YnNdJdhEGoHK4Fa0o635yDRIG4kqIQnoVesqlVYL9zZyvpoBJ7t
RCT5dEA7IzOrg1oYJkK2bVS1FmAwbLGg+LhBoF1JSdJlBTrq/p1hvIbZv97Tujqx
f36SNI7JAG7cmL3c7IAFrQI932XtCwP39xaEBDG6k5TY8hL4iuO/Qq+n1M0RFxbI
Qh0UqEL20kCGoE8jypZFVmAGzbdVAaYBlGX+bgUJurSkquLvWL69J1bY73NxW0Qz
8ppy6rBePm6pUlvscG21h483XjyMnM7k8M4MZ0HMzvaAq07MTFb1wWFZk7Q+ptq4
NxKfKjLji7gh7MMrZQzvIt6IKTtM1/r+t+FHvpw+PoP7UV31aPcuIYXcv/Fa4nzX
xeSDwWrruoBa3lwtcHb4yOWHh8qgnaHlIhInD0Q9HWzq1MKLL295q39QpsQZp6F6
t5b5wR9iWqJDB0BeJsas7a5wFsWqynKKTbDPAYsDP27X
-----END CERTIFICATE-----`;

/**
 * TWCA turns out to have TWO different certificates sharing the CN "TWCA
 * CYBER Root CA" in circulation — the self-signed one above, and this
 * cross-signed one (issued BY "TWCA Global Root CA", an even older, more
 * widely-trusted root — a common CA-transition technique, similar to how
 * Let's Encrypt's ISRG Root X1 was cross-signed by DST Root X3 for a
 * while). Independently captured via `openssl s_client -showcerts` against
 * www.tpex.org.tw and confirmed to build a complete, valid 4-tier chain
 * (leaf → SSL Sub-CA → this cert → TWCA Global Root CA below) on its own.
 * Which variant actually gets served can depend on handshake specifics, so
 * both are trusted here rather than betting on one.
 */
const TWCA_CYBER_ROOT_CA_CROSS_SIGNED_PEM = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`;

/** Self-signed "TWCA Global Root CA" — the higher root that
 *  TWCA_CYBER_ROOT_CA_CROSS_SIGNED_PEM above chains up to. Valid to 2030. */
const TWCA_GLOBAL_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIFQTCCAymgAwIBAgICDL4wDQYJKoZIhvcNAQELBQAwUTELMAkGA1UEBhMCVFcx
EjAQBgNVBAoTCVRBSVdBTi1DQTEQMA4GA1UECxMHUm9vdCBDQTEcMBoGA1UEAxMT
VFdDQSBHbG9iYWwgUm9vdCBDQTAeFw0xMjA2MjcwNjI4MzNaFw0zMDEyMzExNTU5
NTlaMFExCzAJBgNVBAYTAlRXMRIwEAYDVQQKEwlUQUlXQU4tQ0ExEDAOBgNVBAsT
B1Jvb3QgQ0ExHDAaBgNVBAMTE1RXQ0EgR2xvYmFsIFJvb3QgQ0EwggIiMA0GCSqG
SIb3DQEBAQUAA4ICDwAwggIKAoICAQCwBdvI64zEbooh745NnHEKH1Jw7W2CnJfF
10xORUnLQEK1EjRsGcJ0pDFfhQKX7EMzClPSnIyOt7h52yvVavKOZsTuKwEHktSz
0ALfUPZVr2YOy+BHYC8rMjk1Ujoog/h7FsYYuGLWRyWRzvAZEk2tY/XTP3VfKfCh
MBwqoJimFb3u/Rk28OKRQ4/6ytYQJ0lM793B8YVwm8rqqFpD/G2Gb3PpN0Wp8DbH
zIh1HrtsBv+baz4X7GGqcXzGHaL3SekVtTzWoWH1EfcFbx39Eb7QMAfCKbAJTibc
46KokWofwpFFiFzlmLhxpRUZyXx1EcxwdE8tmx2RRP1WKKD+u4ZqyPpcC1jcxkt2
yKsi2XMPpfRaAok/T54igu6idFMqPVMnaR1sjjIsZAAmY2E2TqNGtz99sy2sbZCi
laLOz9qC5wc0GZbpuCGqKX6mOL6OKUohZnkfs8O1CWfe1tQHRvMq2uYiN2DLgbYP
oA/pyJV/v1WRBXrPPRXAb94JlAGD1zQbzECl8LibZ9WYkTunhHiVJqRaCPgrdLQA
BDzfuBSO6N+pjWxnkjMdwLfS7JLIvgm/LCkFbwJrnu+8vyq8W8BQj0FwcYeyTbcE
qYSjMq+u7msXi7Kx/mzhkIyIqJdIzshNy/MGz19qCkKxHh53L46g5pIOBvwFItIm
4TFRfTLcDwIDAQABoyMwITAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAgEAXzSBdu+WHdXltdkCY4QWwa6gcFGn90xHNcgL
1yg9iXHZqjNB6hQbbCEAwGxCGX6faVsgQt+i0trEfJdLjbDorMjupWkEmQqSpqsn
LhpNgb+E1HAerUf+/UqdM+DyucRFCCEK2mlpc3INvjT+lIutwx4116KD7+U4x6WF
H6vPNOw/KP4M8VeGTslV9xzU2KV9Bnpv1d8Q34FOIWWxtuEXeZVFBs5fzNxGiWNo
RI2T9GRwoD2dKAXDOXC4Ynsg/eTb6QihuJ49CcdP+yz4k3ZB3lLg4VfSnQO8d57+
nile98FRYB/e2guyLXW3Q0iT5/Z5xoRdgFlglPx4mI88k1HtQJAH32RjJMtOcQWh
15QaiDLxInQirqWm2BJpTGCjAu4r7NRjkgtevi92a6O2JryPA9gK8kxkRr05YuWW
6zRjESjMlfGt7+/cgFhI6Uu46mWs6fyAtbXIRfmswZ/ZuepiiI7E8UuDEq3mi4TW
nsLrgxifarsbJGAzcMzs9zLzXNl5fe+epP7JI8Mk7hWSsT2RTyaGvWZzJBPqpK5j
wa19hAM8EHiGG3njxPPyBJUgriOCxLM6AGK/5jYk4Ve6xx6QddVfP5VhK8E7zeWz
aGHQRiapIVJpLesux+t3zqY6tQMzT3bR51xUAV3LePTJDL/PEo4XLSNolOer/qmy
KwbQBM0=
-----END CERTIFICATE-----`;

// Built once per process (not per request): building the trusted-CA list
// and Agent is pure/cheap but there's no reason to redo it every call.
// NOTE: these three certs are valid to Dec 2030 (checked via `openssl x509
// -noout -dates`) — this hardcoded workaround will need refreshing (repeat
// `openssl s_client -showcerts -connect www.tpex.org.tw:443` and update the
// PEM blocks above) once they approach expiry, since Node will go back to
// failing the same chain-verification error once these certs are no longer
// valid rather than merely "missing".
const tpexHttpsAgent = new https.Agent({
  ca: [...tls.rootCertificates, TWCA_CYBER_ROOT_CA_PEM, TWCA_CYBER_ROOT_CA_CROSS_SIGNED_PEM, TWCA_GLOBAL_ROOT_CA_PEM],
  keepAlive: true,
});

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** Node `https` request (not the global `fetch`) specifically so the custom
 *  `tpexHttpsAgent` above (carrying the extra trusted root CA) applies —
 *  the global `fetch`/undici stack doesn't offer a simple per-call `ca`
 *  override, and every TPEx URL in this module is on the same host, so one
 *  shared low-level helper covers all of them. */
function tpexHttpsGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: tpexHttpsAgent, headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`TPEx request timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
  });
}

async function fetchTpexJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const text = await fetchTpexFullBody(url, timeoutMs);
  return JSON.parse(text) as T;
}

/**
 * Separately from the TLS root-cause above, TPEx's large whole-market
 * payloads were also observed (from the local dev machine, pre-dating the
 * TLS diagnosis — see git history) to sometimes arrive short of their own
 * `Content-Length`. Kept as defense-in-depth even though the TLS fix above
 * was the actual production blocker: resumes any shortfall with a
 * `Range: bytes=<received>-` request for exactly the missing tail (pinned
 * to the same file version via `If-Range`/ETag), rather than either
 * trusting a short body or blindly re-downloading everything.
 */
const TPEX_MAX_RESUME_ATTEMPTS = 6;

async function fetchTpexFullBody(url: string, timeoutMs: number): Promise<string> {
  const first = await tpexHttpsGet(url, TPEX_HEADERS, timeoutMs);
  const contentLength = first.headers["content-length"];
  const expected = parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength ?? "0", 10);
  const etagRaw = first.headers["etag"];
  const etag = Array.isArray(etagRaw) ? etagRaw[0] : etagRaw;
  let bytes = first.body;

  let attempts = 0;
  while (Number.isFinite(expected) && expected > 0 && bytes.length < expected && attempts < TPEX_MAX_RESUME_ATTEMPTS) {
    attempts++;
    try {
      const headers: Record<string, string> = { ...TPEX_HEADERS, Range: `bytes=${bytes.length}-` };
      if (etag) headers["If-Range"] = etag;
      const res = await tpexHttpsGet(url, headers, timeoutMs);
      if (res.status === 206 && res.body.length > 0) {
        bytes = Buffer.concat([bytes, res.body]);
      } else if (res.body.length > bytes.length) {
        // Server ignored Range and sent the whole file again (200) — only
        // worth keeping if it's actually more complete than what we have.
        bytes = res.body;
      }
    } catch {
      // This resume attempt failed outright; loop will try again (or give
      // up once TPEX_MAX_RESUME_ATTEMPTS is hit) rather than aborting on
      // the first hiccup.
    }
  }
  return bytes.toString("utf8");
}

function parseTpexNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** ROC compact date ("1150910") -> ISO ("2026-09-10"). */
function rocCompactToIso(roc: string): string {
  if (roc.length < 5) return roc;
  const year = parseInt(roc.slice(0, -4), 10) + 1911;
  const month = roc.slice(-4, -2);
  const day = roc.slice(-2);
  return `${year}-${month}-${day}`;
}

/** ROC slash date ("115/09/01", as returned by the per-symbol history
 *  endpoint) -> ISO ("2026-09-01"). Same underlying calendar as TWSE's
 *  STOCK_DAY dates, just re-implemented here to keep this module
 *  self-contained (see us.ts for the same "each exchange owns its own copy
 *  of small date helpers" convention already used in this codebase). */
function rocSlashToIso(roc: string): string {
  const [y, m, d] = roc.split("/").map((n) => parseInt(n, 10));
  return `${y + 1911}-${pad(m)}-${pad(d)}`;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

interface TpexQuoteRow {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
  Change: string;
  Open: string;
  High: string;
  Low: string;
  TradingShares: string;
}

/**
 * Confirmed live: TradingShares here is already in raw shares (股), NOT
 * lots (張) — cross-checked against the per-symbol history endpoint's 成交
 * 張數 column for the same stock/day (e.g. 3293 on 115/09/11: history says
 * 1,922 張 = ~1,922,000 股, and this endpoint's TradingShares for the same
 * day is 1,922,407 — matching within odd-lot rounding). This is the
 * opposite of TWSE's MIS `v` field, which IS in 張 and needs ×1000 (see
 * twse.ts's rowToQuote) — copying that ×1000 step here would silently
 * inflate every TPEx stock's reported volume 1000x, so it's deliberately
 * NOT applied.
 */
function rowToTpexQuote(row: TpexQuoteRow): Quote | null {
  const close = parseTpexNumber(row.Close);
  if (close == null || close <= 0) return null; // no real trade data for this code
  const change = parseTpexNumber(row.Change) ?? 0;
  const prevClose = close - change;
  const known = findInUniverse(row.SecuritiesCompanyCode, "TW");

  return {
    symbol: row.SecuritiesCompanyCode,
    market: "TW",
    name: row.CompanyName || known?.name || row.SecuritiesCompanyCode,
    price: round2(close),
    change: round2(change),
    changePercent: prevClose ? round2((change / prevClose) * 100) : 0,
    open: round2(parseTpexNumber(row.Open) ?? close),
    high: round2(parseTpexNumber(row.High) ?? close),
    low: round2(parseTpexNumber(row.Low) ?? close),
    prevClose: round2(prevClose),
    volume: parseInt((row.TradingShares || "0").replace(/,/g, ""), 10) || 0,
    currency: "TWD",
    updatedAt: new Date().toISOString(),
  };
}

// TPEx's whole-market quote snapshot endpoint does NOT support per-symbol
// filtering — every call returns the entire OTC mainboard (~1000 rows,
// several hundred KB) regardless of what's actually needed. Unlike TWSE's
// MIS endpoint (a genuinely cheap single-symbol request), a TPEx "single
// quote" is unavoidably a whole-market fetch — so the whole-market result
// itself is cached here (short TTL, matching index.ts's QUOTE_TTL_MS) and
// shared by every caller: an individual /api/quote/<TPEx symbol> page load
// and a batch search/highlights fetch both hit the same cached snapshot
// instead of each re-downloading the full OTC market independently. This is
// the key perf-preserving design decision for TPEx quotes (see PROGRESS.md
// for measured cold/warm numbers).
const TPEX_QUOTE_SNAPSHOT_TTL_MS = 20_000;

async function fetchTpexQuoteSnapshot(): Promise<Map<string, Quote>> {
  return cachedMap("tpex-quote-snapshot-raw", TPEX_QUOTE_SNAPSHOT_TTL_MS, async () => {
    const rows = await fetchTpexJson<TpexQuoteRow[]>(
      "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
    );
    const map = new Map<string, Quote>();
    for (const row of rows) {
      const q = rowToTpexQuote(row);
      if (q) map.set(row.SecuritiesCompanyCode, q);
    }
    return map;
  });
}

export async function fetchTpexQuote(stockNo: string): Promise<Quote> {
  const map = await fetchTpexQuoteSnapshot();
  const quote = map.get(stockNo);
  if (!quote) throw new Error(`No TPEx quote for ${stockNo}`);
  return quote;
}

export async function fetchTpexQuotesBatch(stockNos: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  if (stockNos.length === 0) return map;
  const all = await fetchTpexQuoteSnapshot();
  const wanted = new Set(stockNos);
  for (const [symbol, quote] of all) {
    if (wanted.has(symbol)) map.set(symbol, quote);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Historical daily candles (for charts)
// ---------------------------------------------------------------------------

const RANGE_MONTHS: Record<ChartRange, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };

function taipeiToday(): { year: number; month: number; day: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" })
    .format(new Date())
    .split("-")
    .map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d };
}

function monthsBefore(year: number, month: number, day: number, months: number): string {
  const lastDayOfTarget = new Date(Date.UTC(year, month - months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 - months, Math.min(day, lastDayOfTarget)))
    .toISOString()
    .slice(0, 10);
}

interface TpexHistoryResponse {
  tables?: Array<{ data?: string[][] }>;
}

/**
 * Per-symbol historical OHLC — NOT part of openapi/v1 (TPEx doesn't expose
 * per-symbol date-ranged history there); this is TPEx's own website's
 * legacy query endpoint, confirmed live and stable during this build. `date`
 * MUST be Gregorian YYYY/MM/DD (an ROC-formatted date returns
 * `{"stat":"參數輸入錯誤"}`) — the opposite convention from TWSE's
 * STOCK_DAY, which wants an ROC-compact date. Any day-of-month works; the
 * whole calendar month containing it comes back.
 */
async function fetchTpexMonth(stockNo: string, year: number, month: number): Promise<Candle[]> {
  const dateParam = `${year}/${pad(month)}/01`;
  const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock/st43_result.php?l=zh-tw&date=${dateParam}&code=${stockNo}`;
  const data = await fetchTpexJson<TpexHistoryResponse>(url, 6000);
  const rows = data.tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): Candle | null => {
      const [rocDate, lots, , open, high, low, close] = row;
      const closeNum = parseFloat((close ?? "").replace(/,/g, ""));
      if (!Number.isFinite(closeNum)) return null;
      return {
        time: rocSlashToIso(rocDate),
        open: parseFloat((open ?? "").replace(/,/g, "")),
        high: parseFloat((high ?? "").replace(/,/g, "")),
        low: parseFloat((low ?? "").replace(/,/g, "")),
        close: closeNum,
        // 成交張數 (lots) -> shares, same normalization twse.ts applies to
        // STOCK_DAY's own lot-denominated column, so TW candle volume stays
        // one consistent unit (shares) across both exchanges.
        volume: (parseInt((lots ?? "").replace(/,/g, ""), 10) || 0) * 1000,
      };
    })
    .filter((c): c is Candle => c !== null);
}

export async function fetchTpexCandles(stockNo: string, range: ChartRange): Promise<Candle[]> {
  const months = RANGE_MONTHS[range];
  const { year, month, day } = taipeiToday();

  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const requests: Promise<Candle[]>[] = [];
  for (let i = 0; i <= months; i++) {
    requests.push(fetchTpexMonth(stockNo, cursor.getUTCFullYear(), cursor.getUTCMonth() + 1));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  const cutoffIso = monthsBefore(year, month, day, months);
  const monthly = await Promise.all(requests);
  const merged = monthly
    .flat()
    .filter((c) => c.time >= cutoffIso)
    .sort((a, b) => a.time.localeCompare(b.time));
  if (merged.length === 0) throw new Error(`No TPEx candles for ${stockNo}`);
  return merged;
}

// ---------------------------------------------------------------------------
// Fundamentals (P/E, dividend yield, P/B)
// ---------------------------------------------------------------------------

interface TpexPeratioRow {
  SecuritiesCompanyCode: string;
  PriceEarningRatio: string;
  YieldRatio: string;
  PriceBookRatio: string;
}

export async function fetchTpexFundamentalsAll(): Promise<Map<string, Fundamentals>> {
  const rows = await fetchTpexJson<TpexPeratioRow[]>(
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"
  );
  const map = new Map<string, Fundamentals>();
  for (const row of rows) {
    if (!row.SecuritiesCompanyCode) continue;
    const peRatio = parseFloat(row.PriceEarningRatio);
    const dividendYield = parseFloat(row.YieldRatio);
    const pbRatio = parseFloat(row.PriceBookRatio);
    map.set(row.SecuritiesCompanyCode, {
      peRatio: Number.isFinite(peRatio) && peRatio > 0 ? peRatio : undefined,
      dividendYield: Number.isFinite(dividendYield) && dividendYield > 0 ? dividendYield : undefined,
      pbRatio: Number.isFinite(pbRatio) && pbRatio > 0 ? pbRatio : undefined,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Institutional trading (三大法人)
// ---------------------------------------------------------------------------

/**
 * TPEx's field names here are verbose English phrases with genuinely
 * inconsistent whitespace (confirmed live — e.g. a leading space on one
 * "-Total Sell" key, an internal space in "...Include MainlandArea...", and
 * TWO differently-spaced "Dealers ... TotalSell"-looking keys that coexist
 * with different values — this is TPEx's own export quirk, not a fetch bug).
 * Hardcoding exact key strings would be fragile, so keys are normalized
 * (lowercase, whitespace stripped) and matched by stable substring instead.
 * Only the four "-Difference" fields are needed (TPEx already computes
 * buy-minus-sell net for us, unlike TWSE's T86 which this codebase nets
 * itself from two raw components) — verified live that
 * Buy - Sell === Difference for sampled real rows, and that
 * TotalDifference === foreign(incl. mainland, excl. dealer) + foreignDealer
 * + trust + dealer for a sampled row (3293: -962746 + 0 + 35000 + 6571 =
 * -921175 = TotalDifference). Order of the substring checks below matters:
 * "foreigninvestorsincludemainlandareainvestors(foreigndealersexcluded)"
 * itself CONTAINS "foreigndealers" as a substring, so that check must come
 * after the more specific foreign-investors check or it would wrongly steal
 * that row's value.
 *
 * Units: confirmed 股 (shares), same as TWSE's T86 — sanity-checked against
 * 3293's actual TradingShares for the same day (foreign sell of 1,289,306
 * shares against a ~1.9M-share trading day is plausible; it would be an
 * absurd 1000x too large if this were actually 張).
 */
function extractTpexInstiNet(row: Record<string, string | undefined>): {
  foreignNet?: number;
  trustNet?: number;
  dealerNet?: number;
  totalNet?: number;
} {
  let foreignExclDealer: number | undefined;
  let foreignDealer: number | undefined;
  let trust: number | undefined;
  let dealer: number | undefined;
  let total: number | undefined;

  for (const [key, raw] of Object.entries(row)) {
    if (typeof raw !== "string") continue;
    const norm = key.toLowerCase().replace(/\s+/g, "");
    if (norm === "totaldifference") {
      total = parseTpexNumber(raw);
      continue;
    }
    if (!norm.endsWith("-difference")) continue;
    const prefix = norm.slice(0, -"-difference".length);
    if (prefix.includes("foreigninvestorsincludemainlandareainvestors")) {
      foreignExclDealer = parseTpexNumber(raw);
    } else if (prefix.includes("foreigndealers")) {
      foreignDealer = parseTpexNumber(raw);
    } else if (prefix.includes("securitiesinvestmenttrustcompanies")) {
      trust = parseTpexNumber(raw);
    } else if (prefix === "dealers") {
      dealer = parseTpexNumber(raw);
    }
  }

  const foreignNet =
    foreignExclDealer != null || foreignDealer != null ? (foreignExclDealer ?? 0) + (foreignDealer ?? 0) : undefined;
  return { foreignNet, trustNet: trust, dealerNet: dealer, totalNet: total };
}

export async function fetchTpexInstitutionalTradingAll(): Promise<Map<string, Chips>> {
  const rows = await fetchTpexJson<Array<Record<string, string | undefined>>>(
    "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading"
  );
  const map = new Map<string, Chips>();
  for (const row of rows) {
    const code = row.SecuritiesCompanyCode?.trim();
    if (!code) continue;
    const { foreignNet, trustNet, dealerNet, totalNet } = extractTpexInstiNet(row);
    const date = row.Date && row.Date.length === 7 ? rocCompactToIso(row.Date) : undefined;
    map.set(code, {
      date,
      foreignNetShares: foreignNet,
      trustNetShares: trustNet,
      dealerNetShares: dealerNet,
      institutionalNetShares: totalNet,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Margin trading (融資融券)
// ---------------------------------------------------------------------------

interface TpexMarginRow {
  SecuritiesCompanyCode: string;
  MarginPurchaseBalance: string;
  MarginPurchaseBalancePreviousDay: string;
  ShortSaleBalance: string;
  ShortSaleBalancePreviousDay: string;
}

/** Confirmed 張 (lots), same unit as TWSE's MI_MARGN — magnitudes for 3293
 *  (MarginPurchaseBalance 2922) are consistent with lots, not shares. */
export async function fetchTpexMarginTradingAll(): Promise<Map<string, Chips>> {
  const rows = await fetchTpexJson<TpexMarginRow[]>(
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance"
  );
  const map = new Map<string, Chips>();
  for (const row of rows) {
    const code = row.SecuritiesCompanyCode?.trim();
    if (!code) continue;
    const marginBalance = parseTpexNumber(row.MarginPurchaseBalance);
    const marginPrev = parseTpexNumber(row.MarginPurchaseBalancePreviousDay);
    const shortBalance = parseTpexNumber(row.ShortSaleBalance);
    const shortPrev = parseTpexNumber(row.ShortSaleBalancePreviousDay);
    map.set(code, {
      marginBalance,
      marginBalanceChange: marginBalance != null && marginPrev != null ? marginBalance - marginPrev : undefined,
      shortBalance,
      shortBalanceChange: shortBalance != null && shortPrev != null ? shortBalance - shortPrev : undefined,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Material announcements (重大訊息公告)
// ---------------------------------------------------------------------------

interface TpexAnnouncementRow {
  公司代號?: string;
  SecuritiesCompanyCode?: string;
  發言日期: string;
  // Unlike TWSE's t187ap04_L (whose "主旨" key has a confirmed trailing
  // space — see twse.ts), TPEx's mopsfin_t187ap04_O key here has NO trailing
  // space, confirmed live. Copying TWSE's "主旨 " literally here would
  // silently match nothing.
  主旨: string;
}

export async function fetchTpexMaterialAnnouncementsAll(): Promise<Map<string, MaterialAnnouncement[]>> {
  const rows = await fetchTpexJson<TpexAnnouncementRow[]>(
    "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O"
  );
  const map = new Map<string, MaterialAnnouncement[]>();
  for (const row of rows) {
    const code = (row.SecuritiesCompanyCode ?? row.公司代號)?.trim();
    if (!code || !row.發言日期) continue;
    const subject = row.主旨?.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!subject) continue;
    const list = map.get(code) ?? [];
    list.push({ date: rocCompactToIso(row.發言日期), subject });
    map.set(code, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Monthly revenue
// ---------------------------------------------------------------------------

interface TpexRevenueRow {
  公司代號: string;
  資料年月: string;
  "營業收入-去年同月增減(%)": string;
}

/** Confirmed live: TPEx's field names here are identical to TWSE's
 *  (including the exact "營業收入-去年同月增減(%)" key) — no divergence to
 *  work around, unlike several of the other endpoints. */
export async function fetchTpexMonthlyRevenueAll(): Promise<Map<string, Earnings>> {
  const rows = await fetchTpexJson<TpexRevenueRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O");
  const map = new Map<string, Earnings>();
  for (const row of rows) {
    const yoy = parseFloat(row["營業收入-去年同月增減(%)"]);
    if (!row.公司代號 || !Number.isFinite(yoy)) continue;
    const yearMonth = row.資料年月;
    const period =
      yearMonth?.length >= 5
        ? `${parseInt(yearMonth.slice(0, -2), 10) + 1911}年${parseInt(yearMonth.slice(-2), 10)}月`
        : undefined;
    map.set(row.公司代號, { monthlyRevenueYoyPercent: round2(yoy), monthlyRevenuePeriod: period });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Quarterly EPS
// ---------------------------------------------------------------------------

interface TpexQuarterlyRow {
  Year: string;
  Season: string;
  SecuritiesCompanyCode: string;
  [key: string]: string;
}

/**
 * Unlike TWSE's quarterly endpoint (whose top-level identity fields —
 * 公司代號/年度/季別 — are Chinese), TPEx's mopsfin_t187ap06_O_ci mixes
 * English identity fields (Year/Season/SecuritiesCompanyCode) with Chinese
 * financial-statement line items, confirmed live. The EPS field name itself
 * DOES match TWSE's exactly ("基本每股盈餘（元）"), but it's located
 * dynamically here (searching for a key containing "每股盈餘") rather than
 * hardcoded, since nothing else about this endpoint's shape can be assumed
 * to match TWSE's — if TPEx ever renames it, this degrades to "no EPS
 * entry" rather than silently reading undefined forever.
 */
export async function fetchTpexQuarterlyEpsAll(): Promise<Map<string, Earnings>> {
  const rows = await fetchTpexJson<TpexQuarterlyRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci");
  const map = new Map<string, Earnings>();
  if (rows.length === 0) return map;
  const epsKey = Object.keys(rows[0]).find((k) => k.includes("每股盈餘"));
  if (!epsKey) return map;
  for (const row of rows) {
    const eps = parseFloat(row[epsKey]);
    if (!row.SecuritiesCompanyCode || !Number.isFinite(eps)) continue;
    map.set(row.SecuritiesCompanyCode, {
      quarterlyEps: round2(eps),
      quarterlyEpsPeriod: `${row.Year}年Q${row.Season}`,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Company listing / universe
// ---------------------------------------------------------------------------

interface TpexCompanyRow {
  SecuritiesCompanyCode: string;
  CompanyAbbreviation: string;
  SecuritiesIndustryCode: string;
  "Paidin.Capital.NTDollars": string;
}

/**
 * TPEx's official OTC-mainboard company listing, mirrors TWSE's
 * fetchTwseListedCompanies. Confirmed live that SecuritiesIndustryCode uses
 * the SAME two-digit classification table as TWSE's 產業別 (Taiwan's
 * official industry categories are shared across both exchanges per the
 * 上市上櫃公司產業類別劃分及調整要點) — cross-checked 3293 鈊象="32"->文化創意業
 * (also independently confirmed by the monthly-revenue endpoint's own
 * 產業別 text field for the same company), 6274 台燿="28"->電子零組件業,
 * 6488 環球晶="24"->半導體業, all matching real-world expectations.
 *
 * Results are sorted by paid-in capital (Paidin.Capital.NTDollars, a real
 * reported field — not a fabricated ranking) descending, largest first.
 * This isn't just cosmetic: universe.ts's capUniverse() takes the first N
 * TPEx entries when the combined TW universe exceeds its cap, and TPEx's
 * codes are NOT ordered large-cap-first the way TWSE's seed seniority
 * roughly is (e.g. 6274/6488 sort well into the back half by code number) —
 * without this ordering, a naive code-order cap would exclude exactly the
 * well-known OTC names (鈊象/台燿/環球晶/世界先進/信驊 etc.) users actually
 * look for. Verified live: this ordering puts 環球晶(6488) at rank 18,
 * 台燿(6274) at rank 38, 鈊象(3293) at rank 40 out of 891 — comfortably
 * inside any reasonable cap.
 */
export async function fetchTpexListedCompanies(): Promise<UniverseEntry[]> {
  const rows = await fetchTpexJson<TpexCompanyRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O");
  return rows
    .filter((r) => r.SecuritiesCompanyCode && r.CompanyAbbreviation)
    .sort(
      (a, b) =>
        (parseFloat(b["Paidin.Capital.NTDollars"]) || 0) - (parseFloat(a["Paidin.Capital.NTDollars"]) || 0)
    )
    .map((r) => ({
      symbol: r.SecuritiesCompanyCode.trim(),
      market: "TW" as const,
      name: r.CompanyAbbreviation.trim(),
      sector: TW_INDUSTRY_NAMES[r.SecuritiesIndustryCode?.trim() ?? ""] ?? "未分類",
      currency: "TWD",
      exchange: "TPEx" as const,
    }));
}
