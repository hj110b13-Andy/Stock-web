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
 * production (and confirmed by an independent research pass that connected
 * directly to Vercel/AWS's outbound IPs): `www.tpex.org.tw` is geo/CDN
 * split. Requests from Taiwan (this project's local dev machine included)
 * hit an origin that sends the full leaf+intermediate chain and just work.
 * Requests from outside Taiwan — which is what Vercel's serverless
 * functions are, regardless of which region is configured — get routed to
 * a Cloudflare-fronted endpoint that sends ONLY the leaf certificate,
 * omitting the intermediate ("TWCA SSL Certification Authority"). Node
 * already bundles the ultimate root ("TWCA CYBER Root CA") in its default
 * trust store, so the root was never actually the missing piece — earlier
 * attempts at this fix added various root certs and made no difference for
 * exactly that reason (the error `UNABLE_TO_VERIFY_LEAF_SIGNATURE` means a
 * missing intermediate; a missing root gives a different OpenSSL error,
 * `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). Verified fix: add the missing
 * intermediate itself to the trusted set — Node/OpenSSL is fine treating a
 * `ca`-supplied cert as a trust anchor even when it isn't a self-signed
 * root, since its own issuer (the root) is already trusted by default.
 *
 * This is NOT the response-truncation issue chased earlier in this same
 * build (that was real too, but separate — see fetchTpexFullBody below).
 *
 * Fix: a dedicated `https.Agent` for TPEx requests with this intermediate
 * added on top of Node's default trusted set (`tls.rootCertificates`) —
 * additive (nothing stops trusting anything it trusted before), not a
 * blanket `rejectUnauthorized: false`, so certificate validation stays
 * fully enforced, just now able to complete the one chain that was missing.
 */
const TWCA_SSL_SUB_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIG1DCCBLygAwIBAgIQQAE0sE8AAAAAAAAAA+MkrDANBgkqhkiG9w0BAQwFADBQ
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3QgQ0EwHhcNMjMwMjIzMDcyMjI0
WhcNMzMwMjIzMTU1OTU5WjBhMQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FO
LUNBMRMwEQYDVQQLEwpTU0wgU3ViLUNBMSkwJwYDVQQDEyBUV0NBIFNTTCBDZXJ0
aWZpY2F0aW9uIEF1dGhvcml0eTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoC
ggIBAMquxiSlMrxfOO29yqxCo/BIYBswnE7snZnuZDPcx8N9WhOdNGDsF024VjXK
nXoVaZBcv56eFsU+w9Mcq+uIVYzjVrBoe5u8ZLE0hPSkluH8URhcxtSQJ+gXcB0L
JHsseAeXVcgqoxTSJ6/n0xTCeXEnGwSRAzrqTvjS2gbd3TILxsfIHwRgwwPjBDgm
tjzbHHOFTJB3GCtH65T9A0viM2B/IW9Wz73jkz02AVMrZBHQ67IJ2W9CoIjd5mdG
eIV36U9NXl+wZa/D90pLRsFVbItKgLXgF71CQ92vS/biTx8fA6UUCU2ToNczP5Ur
A/mDXCBCLakwa1I3ylRkgFwluJw9DqiYh56MRgsEABa+ZPrm1Qb9njQZK4Y4V+ML
IvGM3xVoHIlvaSN29ubTueLpTeuAwN2VTiRzfOyCRKTcMBCtlMw1WCJNAMiNWDWS
BMnY9SlKv1oujmjS/ti0ptcipMymIoeWpVuQt3Mj8lYlKRpd6Zg8MbljMwQRSClK
6O6MSwpM3Xy5uJGh2cY5oYmKtxfyHSuKtKsk+daAPV1lpWYp9bNrbsLUPwmSY+zk
VgkZdiWBF//RP/72/esANONINy5hkWjkVd0NLjA5TAgk+DVVmnPtQIj1vBgtk8ak
Y9CczIbEgKBonkHWn+GX2ycR6jadg2P+xrBFg4MGjomkb2gtAgMBAAGjggGXMIIB
kzAfBgNVHSMEGDAWgBSdhWEUfMFib5do5E83QOGt4A1WNzAdBgNVHQ4EFgQU8ijU
+dQcfhprFoLl75Mpae3KFSAwDgYDVR0PAQH/BAQDAgEGMBMGA1UdJQQMMAoGCCsG
AQUFBwMBMEoGA1UdIARDMEEwNQYLKwYBBAGCvyUBARUwJjAkBggrBgEFBQcCARYY
aHR0cHM6Ly93d3cudHdjYS5jb20udHcvMAgGBmeBDAECAjBNBgNVHR8ERjBEMEKg
QKA+hjxodHRwOi8vUm9vdENBLnR3Y2EuY29tLnR3L1RXQ0FSQ0EvY3liZXJfcm9v
dF9yZXZva2VfMjAyMi5jcmwwEgYDVR0TAQH/BAgwBgEB/wIBADB9BggrBgEFBQcB
AQRxMG8wQwYIKwYBBQUHMAKGN2h0dHA6Ly9zc2xzZXJ2ZXIudHdjYS5jb20udHcv
Y2FjZXJ0L2N5YmVyX3Jvb3RfMjAyMi5jcnQwKAYIKwYBBQUHMAGGHGh0dHA6Ly9y
b290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcNAQEMBQADggIBAIFF/6Gnvu8L
3xQDIampB8QVgoKS2bcjte0uJBbCrQHpzcGTuVTkZaiA86LwVz6SAU7TVgVYRXmt
x8l29WzfKI6wOAzmvlGZxSYAdN0I6YBkJK1nmDs0+TSw5lCzb+UOpajNOaMdJ5SN
YTN87yRwl82AFrwUmSLaMV4tN7W49N0SsELWs/d4uNHSMM0mBjd0hLDIWJFwOkuD
yOWahnCVfPlCwSVWpUntOGgOHOA02IUE+JNX+spIV1SwAMYaEVyHe316YUgiGA5y
k3liTa3vuv06eE1J2yiWrs9booW2VTHD+amzucFFNN1KvSLjSbYxG1t/FclHEN/y
6hGM3bkjRC31A0jzpv93D3MUQTdJascicPa0H4i8hviRriyetaC6HC4q8FQUTo2A
cEpxicNGgyHhDV+YdbnS6GZL+f3bsmMM8ZFYZ77mDTS9mRO1VnIwkjiN4vpzh67a
KTpoD9TQzZcGQiJy6Pi+PCSFiqjK7UD/63L/Pt0hpoNKvZLrz4ngrlpyzpx8KjeS
A5cjKcc6vlHm0Kk07k5djhJsaqQELso5r+UXi9qC+nwqPuR/w5kJZv4fz0ND4UhY
5y3qd+iCikkF3WzOzey7jUH9URKb3iZnRAHZvmyLK57UI0FwP+5xZEByvwXDtxbe
914Hj3cSUrmKT3g/ZlOQQ1THeu48MA79
-----END CERTIFICATE-----`;

// Built once per process (not per request): building the trusted-CA list
// and Agent is pure/cheap but there's no reason to redo it every call.
// NOTE: this cert is valid to 2033-02-23 (checked via `openssl x509 -noout
// -dates`) — this hardcoded workaround will need refreshing (repeat
// `openssl s_client -showcerts -connect www.tpex.org.tw:443` from a
// non-Taiwan vantage point and update the PEM block above) once it
// approaches expiry, since Node will go back to failing the same
// chain-verification error once this cert is no longer valid rather than
// merely "missing".
const tpexHttpsAgent = new https.Agent({
  ca: [...tls.rootCertificates, TWCA_SSL_SUB_CA_PEM],
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
 * `Content-Length`, cutting off roughly every ~200KB on average. Kept as
 * defense-in-depth even though the TLS fix above was the main production
 * blocker for the quotes endpoint: resumes any shortfall with a
 * `Range: bytes=<received>-` request for exactly the missing tail (pinned
 * to the same file version via `If-Range`/ETag), rather than either
 * trusting a short body or blindly re-downloading everything.
 *
 * Budget sized for the LARGEST payload this module fetches (the ~1MB
 * company listing, mopsfin_t187ap03_O — roughly 3x the ~350KB quotes
 * snapshot): at a ~200KB-per-successful-segment rate, completing 1MB can
 * genuinely take on the order of 5+ resume hops even when nothing is
 * actually failing outright, so a budget sized for the smaller endpoint
 * (6 was enough for quotes, confirmed live) left too little margin for the
 * company listing specifically — confirmed live as the reason the merged TW
 * universe was still TWSE-only after the TLS fix landed (the quotes
 * endpoint completed fine within budget; the larger company listing did
 * not, so fetchTpexListedCompanies() kept throwing and getTwUniverse()'s
 * merge fell back to TWSE-only via its per-exchange catch). Each attempt is
 * fast (sub-second, confirmed via timing logs) so a larger budget doesn't
 * meaningfully change the happy-path latency, only the worst case.
 */
const TPEX_MAX_RESUME_ATTEMPTS = 25;
// Separate from the resume-attempt budget above: this covers the INITIAL
// request failing outright (connection reset, TLS hiccup, timeout) before
// any bytes — and therefore before any Content-Length — are even known, a
// gap the resume loop alone can't cover since it only starts once there's
// something to resume from. Confirmed live that this does happen (an
// ECONNRESET on the very first connection attempt, independent of the TLS
// chain-verification issue this module also works around).
const TPEX_MAX_INITIAL_ATTEMPTS = 3;

async function fetchTpexFullBody(url: string, timeoutMs: number): Promise<string> {
  let first: RawResponse | undefined;
  let initialErr: unknown;
  for (let attempt = 0; attempt < TPEX_MAX_INITIAL_ATTEMPTS; attempt++) {
    try {
      first = await tpexHttpsGet(url, TPEX_HEADERS, timeoutMs);
      break;
    } catch (err) {
      initialErr = err;
    }
  }
  if (!first) throw initialErr ?? new Error(`TPEx request failed after ${TPEX_MAX_INITIAL_ATTEMPTS} attempts: ${url}`);

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
