/**
 * ============================================================
 *  APIKuoshi — src/config.js
 * ============================================================
 *  Central environment-driven configuration.
 *  Everything is optional except the port — the API runs fully
 *  free of charge with zero API keys and zero paid services.
 * ============================================================
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root no matter where node was started from.
// (dotenv/config is already imported in server.js; this is a safety net.)
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const env = (key, fallback = "") => (process.env[key] ?? fallback).trim();

export const config = {
  /** HTTP port */
  port: parseInt(env("PORT", "6969"), 10) || 6969,

  /** "production" hides internal error details */
  nodeEnv: env("NODE_ENV", "development"),

  /**
   * Internal data-lane priority. Lanes are an implementation detail —
   * clients never see or address them; the resolver tries them in this
   * order and serves the first result that comes back.
   * Comma-separated subset of: kaze, ishi
   */
  priority: parseOrder(env("SOURCE_PRIORITY", "kaze,ishi")),

  /** CORS: comma-separated origins, or * */
  allowedOrigins: env("ALLOWED_ORIGINS", "*").split(",").map((o) => o.trim()),

  /** Simple in-memory rate limit (0 disables) */
  rateLimitMax: parseInt(env("RATE_LIMIT_MAX", "240"), 10),
  rateLimitWindowMs: parseInt(env("RATE_LIMIT_WINDOW_MS", "60000"), 10),

  /** Per-lane request timeout (ms) */
  sourceTimeoutMs: parseInt(env("SOURCE_TIMEOUT_MS", "20000"), 10),

  /** Response cache TTL (seconds, 0 disables) */
  cacheSeconds: parseInt(env("CACHE_SECONDS", "180"), 10),

  /**
   * Title-match strictness (0..100). The API automatically merges listings
   * that refer to the same anime under different spellings — e.g. romaji
   * ("Shingeki no Kyojin") vs English ("Attack on Titan"). 78 = confident
   * matches only, after normalization.
   */
  dedupThreshold: clamp(parseInt(env("DEDUP_THRESHOLD", "78"), 10) || 78, 50, 99),

  /**
   * ---- OPTIONAL PAID/SELF-HOSTED PROXIES (off by default) --------------
   * APIKuoshi needs NEITHER to run. If present, the internal fetchers
   * that natively understand them pick them up automatically.
   */
  scraperApiKey: env("SCRAPER_API_KEY"),      // https://scraperapi.com (paid)
  flaresolverrUrl: env("FLARESOLVERR_URL"),   // self-hosted FlareSolverr (free software)
};

function parseOrder(raw) {
  const valid = ["kaze", "ishi"];
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => valid.includes(s));
  // de-duplicate, keep order
  return [...new Set(list.length ? list : valid)];
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

export default config;
