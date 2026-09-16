/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module
 *
 * @description
 *   Crypto + naming helpers for the megaplay /videojs/ playback
 *   pipeline (reverse-engineered from the site's own player):
 *
 *   1. SOURCE BLOB — `stream/getSources` answers `enc`, a base64url
 *      AES-256-CBC blob that decrypts to `{"file": "<stream url>"}`.
 *      Key/IV are the site's constants, zero-padded to 32/16 bytes.
 *
 *   2. CDN TOKEN — the stream CDNs (nexabloom/qeltrix/…) answer 403
 *      unless the URL carries a fresh `?token=`. The token is
 *      `b64url("<unix-exp>|<hash1>/<hash2>") + "." + b64url(HMAC-SHA256)`,
 *      TTL 90 s, where hash1/hash2 are the two 32-hex path segments.
 *
 *   3. SERVER NAMES — the site's raw server labels ("Vidstream-2",
 *      "HD-1", …) are mapped to friendly codenames via the editable
 *      SERVER_CODENAMES table; both fields stay exposed.
 *
 * @exports
 *   decryptSourcesEnc, needsCdnToken, generateCdnToken,
 *   withCdnToken, tokenUpToDate, SERVER_CODENAMES, renameServer
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import crypto from "crypto";

// ══════════════════════════════════════════════════════════════
// PLAYER CRYPTO CONSTANTS (from the site's own /videojs/ player)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Source Blob Decryption Keys ----
/**
 * AES-256-CBC key/iv used by the site's player to decrypt the `enc`
 * sources blob returned by `videojs/stream/getSources`. Both are used
 * zero-padded to the AES block sizes (key 32 bytes, iv 16 bytes).
 * Overridable through env in case the site rotates them.
 */
const SOURCE_ENC_KEY = process.env.MEGAPLAY_SOURCE_ENC_KEY || "i?LMTAx0Q6,:}50U";
const SOURCE_ENC_IV = process.env.MEGAPLAY_SOURCE_ENC_IV || "W0;27ToaUpl_P%'c";

/** HMAC secret for the stream CDN `?token=` gate. */
const CDN_TOKEN_SECRET = process.env.MEGAPLAY_CDN_TOKEN_SECRET || "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";

/** Token lifetime in seconds — the site's player uses 90. */
const CDN_TOKEN_TTL_SEC = parseInt(process.env.MEGAPLAY_CDN_TOKEN_TTL || "90", 10);

const padKeyBytes = (str, len) => {
  const raw = Buffer.from(String(str), "utf8");
  return raw.length >= len ? raw.subarray(0, len) : Buffer.concat([raw, Buffer.alloc(len - raw.length)]);
};

const b64UrlEncode = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const b64UrlDecode = (str) => {
  let b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64");
};

// ══════════════════════════════════════════════════════════════
// SOURCE BLOB DECRYPTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Decrypt Encrypted Sources Blob ----
/**
 * Decrypts the `enc` field from the /videojs/stream/getSources payload.
 * @param {string} enc - base64url AES-256-CBC ciphertext
 * @returns {{ file: string } | null} Decrypted payload (null on failure)
 *
 * @example
 *   const { file } = decryptSourcesEnc(payload.enc); // master.m3u8 URL
 */
function decryptSourcesEnc(enc) {
  try {
    const key = padKeyBytes(SOURCE_ENC_KEY, 32);
    const iv = padKeyBytes(SOURCE_ENC_IV, 16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const out = Buffer.concat([decipher.update(b64UrlDecode(enc)), decipher.final()]);
    const obj = JSON.parse(out.toString("utf8"));
    return obj && typeof obj.file === "string" ? obj : null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// CDN TOKEN GATE
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: CDN Path-Key Extraction ----
/**
 * The token gate signs the two 32-hex path segments of the stream URL
 * (`/anime/<hash1>/<hash2>/…`). Returns `hash1/hash2` or null.
 * @param {string} url
 * @returns {string|null}
 */
function extractCdnPathKey(url) {
  const m = String(url).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
  return m ? `${m[1].toLowerCase()}/${m[2].toLowerCase()}` : null;
}

// ---- FEATURE: Token Requirement Check ----
/**
 * True when the URL points at a token-gated CDN (i.e. it has the
 * signed path shape). Non-gated CDNs are returned untouched.
 * @param {string} url
 * @returns {boolean}
 */
function needsCdnToken(url) {
  return Boolean(extractCdnPathKey(url));
}

// ---- FEATURE: HMAC CDN Token Builder ----
/**
 * Builds a fresh 90-second CDN token for one URL.
 * @param {string} url - Stream URL with the signed path shape
 * @param {number} [ttlSec=CDN_TOKEN_TTL_SEC]
 * @returns {string|null} Token string (`payload.signature`), null if not applicable
 */
function buildCdnToken(url, ttlSec = CDN_TOKEN_TTL_SEC) {
  const pathKey = extractCdnPathKey(url);
  if (!pathKey) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${exp}|${pathKey}`;
  const sig = crypto.createHmac("sha256", CDN_TOKEN_SECRET).update(payload).digest();
  return `${b64UrlEncode(Buffer.from(payload))}.${b64UrlEncode(sig)}`;
}

// ---- FEATURE: Token Freshness Check ----
/**
 * Parses an existing `?token=` and reports whether it is still valid
 * for at least `minTtl` more seconds (payload is `exp|pathKey`).
 * @param {string} url
 * @param {number} [minTtl=15]
 * @returns {boolean}
 */
function tokenUpToDate(url, minTtl = 15) {
  try {
    const tok = new URL(url).searchParams.get("token");
    if (!tok) return false;
    const payload = b64UrlDecode(tok.split(".")[0]).toString("utf8");
    const exp = parseInt(payload.split("|")[0], 10);
    if (!Number.isFinite(exp)) return false;
    return exp - Math.floor(Date.now() / 1000) >= minTtl;
  } catch {
    return false;
  }
}

// ---- FEATURE: Attach Fresh CDN Token ----
/**
 * Returns the URL with a fresh (or still-valid) `?token=` attached.
 * Safe to call on any URL — non-gated ones pass through unchanged.
 * @param {string} url
 * @returns {string}
 */
function withCdnToken(url) {
  if (!url || !needsCdnToken(url)) return url;
  if (tokenUpToDate(url)) return url;
  const token = buildCdnToken(url);
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

// ══════════════════════════════════════════════════════════════
// SERVER NAME MAP — EDIT ME
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Friendly Server Codenames ----
/**
 * Raw site label -> friendly codename. Edit freely: unknown labels
 * fall back to a stable generated alias (`srv-<hash>`) and the raw
 * name is always preserved in `originalName`.
 *
 * Assigned in the order the site lists servers, starting with the
 * user's reference pair (Vidstream-2 -> riyo).
 */
const SERVER_CODENAMES = {
  "Vidstream-2": "riyo",
  "Vidstream-1": "kaito",
  "Vidstream": "kaito",
  "HD-1": "hana",
  "HD-2": "sora",
  "HD": "hana",
  "VidCloud-1": "akira",
  "VidCloud-2": "yuki",
  "Mycloud-1": "akira",
  "Mycloud": "akira",
  "VidPlay-1": "miso",
  "VidPlay-2": "kenji",
  "StreamTape-1": "arashi",
  "StreamTape-2": "taiki",
};

/** Ishi playback channels reuse the same friendly-name style. */
const CHANNEL_CODENAMES = {
  "Stream-A": "shiro",
  "Stream-B": "kuro",
  "Stream-C": "cha",
};

const stableAlias = (raw) =>
  `srv-${crypto.createHash("md5").update(String(raw || "?")).digest("hex").slice(0, 6)}`;

// ---- FEATURE: Server Renaming ----
/**
 * Maps a raw upstream server label to its codename, keeping both.
 * @param {string} rawName - e.g. "Vidstream-2"
 * @returns {{ name: string, originalName: string }}
 *
 * @example
 *   renameServer("Vidstream-2") // { name: "riyo", originalName: "Vidstream-2" }
 */
function renameServer(rawName) {
  const raw = String(rawName || "").replace(/\s+/g, " ").trim() || "server";
  const mapped = SERVER_CODENAMES[raw] || CHANNEL_CODENAMES[raw] || stableAlias(raw);
  return { name: mapped, originalName: raw };
}

export {
  decryptSourcesEnc,
  extractCdnPathKey,
  needsCdnToken,
  buildCdnToken,
  tokenUpToDate,
  withCdnToken,
  SERVER_CODENAMES,
  CHANNEL_CODENAMES,
  renameServer,
};

// ══════════════════════════════════════════════════════════════ END: cdn.helper.js
