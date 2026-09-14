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

/** Raw tls.connect diagnostic — the most low-level test possible, to see
 *  exactly what Node's TLS stack itself reports (authorized/authorizationError,
 *  the actual peer certificate chain depth/subjects it received) independent
 *  of https/fetch layers, in case something upstream of those is involved. */
function rawTlsConnect(host: string, extraCa: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        ca: extraCa.length > 0 ? [...tls.rootCertificates, ...extraCa] : undefined,
        timeout: 8000,
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        const chain: string[] = [];
        let c: typeof cert | undefined = cert;
        let depth = 0;
        while (c && Object.keys(c).length > 0 && depth < 10) {
          chain.push(`${c.subject?.CN ?? "?"} (issuer: ${c.issuer?.CN ?? "?"})`);
          if (c.issuerCertificate === c) break;
          c = c.issuerCertificate;
          depth++;
        }
        resolve({
          authorized: socket.authorized,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
          protocol: socket.getProtocol(),
          peerChain: chain,
        });
        socket.end();
      }
    );
    socket.on("timeout", () => {
      resolve({ authorized: false, authorizationError: "timeout" });
      socket.destroy();
    });
    socket.on("error", (e) => {
      resolve({ authorized: false, authorizationError: `connect error: ${String(e)}` });
    });
  });
}

export async function GET() {
  const url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";
  const results: Record<string, unknown> = {};

  // Test 0a/0b: raw tls.connect, no fetch/http layer at all — the ground
  // truth for whether Node's TLS stack itself can build a trusted chain,
  // with vs without our extra CA cert.
  results.tlsConnectNoExtraCa = await rawTlsConnect("www.tpex.org.tw", []);
  results.tlsConnectWithTwcaCert = await rawTlsConnect("www.tpex.org.tw", [TWCA_CYBER_ROOT_CA_PEM]);

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
