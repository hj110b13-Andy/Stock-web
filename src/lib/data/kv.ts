import { Redis } from "@upstash/redis";

// Shared Redis-backed cache, used so TTLs are actually shared across
// Vercel's serverless instances instead of each one keeping its own
// process-local copy (see cache.ts). Entirely optional: without credentials
// configured, callers fall back to the existing in-memory cache and the
// app behaves exactly as before — this never becomes a hard dependency.
//
// Accepts either naming convention so it works with a Vercel Marketplace
// Redis integration (KV_REST_API_URL / KV_REST_API_TOKEN) or a directly
// connected Upstash database (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = Boolean(url && token);
export const redis = kvEnabled ? new Redis({ url: url!, token: token! }) : null;
