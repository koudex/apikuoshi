/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module
 *
 * @description
 *   MegaPlay stream-chain helper — the single source of truth for
 *   everything MegaPlay.
 *
 *   UPSTREAM FORMAT (verified live, 2026-09):
 *   1. The player pages now LIVE under the /videojs/ prefix:
 *        https://megaplay.buzz/videojs/stream/s-2/107257/sub   -> <title>File 13461 - MegaPlay</title>
 *        https://megaplay.buzz/stream/s-2/107257/sub           -> <title>Error - MegaPlay</title>
 *      so every /stream/... embed URL issued by upstream MUST be
 *      normalized to /videojs/stream/... or it renders an error page.
 *
 *   2. /stream/getSources?id=<data-id> answers
 *        { tracks, t, intro, outro, server, enc }
 *      where `enc` is base64url(AES-256-CBC(JSON.stringify({file: m3u8})))
 *      — key "i?LMTAx0Q6,:}50U" zero-padded to 32 bytes,
 *        IV  "W0;27ToaUpl_P%'c" (both lifted from the player bundle
 *        videojs/lib/newclient.min.js). The legacy cleartext shape
 *        { sources: { file } } is kept as a fallback path.
 *
 *   3. The player also rewrites stream/getSources -> stream/getSourcesNew
 *      (GetSourcesRewrite in the same bundle); both endpoints answer the
 *      same payload, so we try getSourcesNew first and fall back.
 *
 *   4. Decrypted m3u8 hosts (fetch.nexabloom.top, *.qeltrix.top, ...)
 *      expect the player Referer; subtitles (*.qeltrix.top) answer 200
 *      with Referer https://megaplay.buzz/ and 403 without it.
 *
 * @exports
 *   MEGAPLAY_HOSTS, isMegaplayUrl, normalizeMegaplayEmbedUrl,
 *   decryptMegaplayPayload, parseMegaplaySources, resolveMegaplayStream,
 *   clearMegaplayCache
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import crypto from "node:crypto";
import axios from "axios";
import { headers } from "../configs/header.config.js";

// ══════════════════════════════════════════════════════════════
// MEGAPLAY FAMILY CONFIGURATION
// ══════════════════════════════════════════════════════════════

/** Hosts that serve (or served) the MegaPlay player. */
const MEGAPLAY_HOSTS = [
  "megaplay.buzz",
  "megaplay-1.buzz",   // dead — normalized to megaplay.buzz
  "vidwish.live",      // mirror, flaky — normalized to megaplay.buzz
  "vidtube.site",      // legacy embed host
  "vid-tube.site",     // legacy embed host
  "megacloud.bloggy.click", // legacy alias — normalized to megaplay.buzz
];

const HOST_ALIASES = {
  "megaplay-1.buzz": "megaplay.buzz",
  "vidwish.live": "megaplay.buzz",
  "megacloud.bloggy.click": "megaplay.buzz",
  "vid-tube.site": "vidtube.site",
};

/** Dead hosts collapse onto the live player host. */
const CANONICAL_HOST = "megaplay.buzz";

// ---- FEATURE: MegaPlay AES key material (from videojs/lib/newclient.min.js)
const MEGAPLAY_AES_KEY = "i?LMTAx0Q6,:}50U"; // zero-padded to 32 bytes -> AES-256-CBC
const MEGAPLAY_AES_IV = "W0;27ToaUpl_P%'c"; // 16 bytes

// ---- FEATURE: Resolution cache (small, TTL-based, per-process) ----
const RESOLVE_CACHE = new Map();
const RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESOLVE_CACHE_MAX = 500;

// ══════════════════════════════════════════════════════════════
// URL UTILITIES
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: MegaPlay URL detection ----
/**
 * True when the URL points at any MegaPlay-family host.
 * @param {string} url
 * @returns {boolean}
 */
const isMegaplayUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return MEGAPLAY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

// ---- FEATURE: /videojs/ prefix normalization ----
/**
 * Rewrites a MegaPlay embed URL into the working /videojs/ player form.
 *
 *   megaplay.buzz/stream/s-2/107257/sub
 *     -> megaplay.buzz/videojs/stream/s-2/107257/sub   (works)
 *
 * Also swaps dead family hosts onto the live one and preserves any
 * query string (e.g. ?s=tcdn). Idempotent: URLs already carrying the
 * /videojs/ prefix are returned unchanged.
 *
 * @param {string} url - Raw embed URL from upstream
 * @returns {string} Normalized embed URL (or the input untouched when
 *                   it is not a MegaPlay URL / cannot be parsed)
 */
const normalizeMegaplayEmbedUrl = (url) => {
  if (!url || typeof url !== "string" || !isMegaplayUrl(url)) return url;
  try {
    const u = new URL(url);
    const alias = HOST_ALIASES[u.hostname.toLowerCase()];
    if (alias) u.hostname = alias;
    // insert /videojs before the player path — but only once
    if (!u.pathname.startsWith("/videojs/") && /^\/stream(\/|$)/.test(u.pathname)) {
      u.pathname = `/videojs${u.pathname}`;
    }
    return u.toString();
  } catch {
    return url;
  }
};

// ══════════════════════════════════════════════════════════════
// PAYLOAD DECRYPTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: enc payload decryption (AES-256-CBC, base64url) ----
/**
 * Decrypts the MegaPlay getSources `enc` field into its JSON payload.
 * @param {string} enc - base64url-encoded AES-256-CBC ciphertext
 * @returns {{ file: string } | null} Parsed payload, null on failure
 */
const decryptMegaplayPayload = (enc) => {
  if (!enc || typeof enc !== "string") return null;
  try {
    const key = Buffer.alloc(32);
    key.set(Buffer.from(MEGAPLAY_AES_KEY, "utf8").subarray(0, 32));
    const iv = Buffer.from(MEGAPLAY_AES_IV, "utf8");
    let b64 = String(enc).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const data = Buffer.from(b64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
};

// ---- FEATURE: getSources payload parsing (new + legacy shapes) ----
/**
 * Normalizes a getSources payload into a uniform shape.
 *
 * New (live) shape: { tracks, t, intro, outro, server, enc }
 * Legacy shape:     { sources: { file }, tracks, skip_data, backup }
 *
 * @param {object} data - Parsed getSources JSON
 * @returns {{ url: string|null, subtitles: Array, skipData: object|null, backup: any }}
 */
const parseMegaplaySources = (data) => {
  if (!data || typeof data !== "object") {
    return { url: null, subtitles: [], skipData: null, backup: null };
  }

  let url = null;

  // NOTE: legacy cleartext shape first (cheap), then the encrypted one
  const legacyFile = data?.sources?.file || data?.sources?.[0]?.file || data?.sources?.[0]?.url || null;
  if (typeof legacyFile === "string" && legacyFile) {
    url = legacyFile;
  }

  if (!url && data.enc) {
    const payload = decryptMegaplayPayload(data.enc);
    if (payload?.file) url = payload.file;
  }

  // NOTE: tracks: [{file, label, kind:"captions"}|{file, lang}] — same in both shapes
  const subtitles = Array.isArray(data.tracks)
    ? data.tracks
        .filter((t) => t?.file && (t.kind === "captions" || t.kind === "subtitles" || !t.kind))
        .map((t) => ({
          label: t.label || t.lang || "Unknown",
          language: t.srclang || t.label || t.lang || "unknown",
          url: t.file,
          format: String(t.file || "").includes(".vtt") ? "vtt" : "srt",
          default: Boolean(t.default),
        }))
    : [];

  // NOTE: skip data moved from skip_data (legacy) to intro/outro (new)
  const skipData =
    data.intro || data.outro
      ? {
          intro: data.intro ? { start: data.intro.start ?? null, end: data.intro.end ?? null } : null,
          outro: data.outro ? { start: data.outro.start ?? null, end: data.outro.end ?? null } : null,
        }
      : data.skip_data || null;

  return { url, subtitles, skipData, backup: data.backup ?? null };
};

// ══════════════════════════════════════════════════════════════
// STREAM RESOLVER
// ══════════════════════════════════════════════════════════════

const PLAYER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Headers the player/CDN pair expects. Without the Referer the CDNs 403. */
const playerHeaders = (embedUrl) => {
  let referer = `https://${CANONICAL_HOST}/`;
  if (embedUrl) {
    try {
      referer = new URL(embedUrl).origin + "/";
    } catch { /* keep default */ }
  }
  return {
    "User-Agent": PLAYER_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
    Origin: new URL(referer).origin,
  };
};

/** Tiny TTL cache put/get with a hard size cap. */
const cacheGet = (key) => {
  const hit = RESOLVE_CACHE.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > RESOLVE_CACHE_TTL_MS) {
    RESOLVE_CACHE.delete(key);
    return undefined;
  }
  return hit.value;
};
const cachePut = (key, value) => {
  if (RESOLVE_CACHE.size >= RESOLVE_CACHE_MAX) {
    const oldest = RESOLVE_CACHE.keys().next().value;
    RESOLVE_CACHE.delete(oldest);
  }
  RESOLVE_CACHE.set(key, { at: Date.now(), value });
};

/** Drop every cached MegaPlay resolution (used by tests / operators). */
const clearMegaplayCache = () => RESOLVE_CACHE.clear();

// ---- FEATURE: Full MegaPlay embed -> m3u8 resolution ----
/**
 * Resolves a MegaPlay embed/player URL into a real stream.
 *
 * Chain: normalize (/videojs/) -> fetch player page -> data-id ->
 * getSourcesNew|getSources -> parse (enc decrypt / legacy) ->
 * { url (m3u8|mp4), subtitles, skipData, qualities }.
 *
 * Never throws — failures return { url: null, error }.
 *
 * @param {string} embedUrl - MegaPlay embed/player URL
 * @param {object} [options]
 * @param {number} [options.timeout=10000]
 * @param {boolean} [options.parseQualities=true] - fetch master m3u8 to list variants
 * @returns {Promise<object>} Resolution result
 */
const resolveMegaplayStream = async (embedUrl, options = {}) => {
  const { timeout = 10000, parseQualities = true } = options;

  const normalized = normalizeMegaplayEmbedUrl(embedUrl);
  if (!normalized) {
    return { url: null, qualities: [], subtitles: [], skipData: null, embedUrl: null, error: "empty embed url" };
  }
  if (!isMegaplayUrl(normalized)) {
    return { url: null, qualities: [], subtitles: [], skipData: null, embedUrl: normalized, error: "not a megaplay url" };
  }

  const cacheKey = `resolve:${normalized}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  try {
    // NOTE: 1. player page — for the data-id (and as an embed fallback)
    const pageRes = await axios.get(normalized, {
      headers: playerHeaders(normalized),
      timeout,
      maxRedirects: 5,
    });
    const html = typeof pageRes.data === "string" ? pageRes.data : String(pageRes.data || "");

    const dataId =
      html.match(/id="megaplay-player"[\s\S]{0,200}?data-id="(\d+)"/)?.[1] ||
      html.match(/data-id="(\d+)"/)?.[1] ||
      html.match(/<title>File\s+(\d+)/i)?.[1] ||
      null;

    if (!dataId) {
      const result = {
        url: null,
        qualities: [],
        subtitles: [],
        skipData: null,
        embedUrl: normalized,
        dataId: null,
        error: "player page did not expose a data-id (episode missing upstream?)",
      };
      cachePut(cacheKey, result);
      return result;
    }

    const realId = html.match(/data-realid="([^"]+)"/)?.[1] || null;
    const mediaId = html.match(/data-mediaid="([^"]+)"/)?.[1] || null;
    const fileVersion = html.match(/data-fileversion="([^"]+)"/)?.[1] || null;

    // NOTE: 2. sources — the player rewrites getSources -> getSourcesNew; try both
    const origin = new URL(normalized).origin;
    const sourcesHeaders = {
      "User-Agent": PLAYER_UA,
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: normalized,
      Origin: origin,
    };

    let payload = null;
    let sourcesEndpoint = null;
    for (const endpoint of ["getSourcesNew", "getSources"]) {
      const url = `${origin}/stream/${endpoint}?id=${dataId}`;
      try {
        const res = await axios.get(url, { headers: sourcesHeaders, timeout });
        const body = typeof res.data === "string" ? (() => { try { return JSON.parse(res.data); } catch { return null; } })() : res.data;
        if (body && typeof body === "object" && (body.enc || body.sources || body.tracks)) {
          payload = body;
          sourcesEndpoint = endpoint;
          break;
        }
      } catch { /* try the next endpoint */ }
    }

    if (!payload) {
      const result = {
        url: null,
        qualities: [],
        subtitles: [],
        skipData: null,
        embedUrl: normalized,
        dataId,
        realId,
        mediaId,
        error: "getSources returned no usable payload",
      };
      cachePut(cacheKey, result);
      return result;
    }

    // NOTE: 3. uniform parse — handles the encrypted AND legacy shapes
    const { url: streamUrl, subtitles, skipData, backup } = parseMegaplaySources(payload);

    if (!streamUrl) {
      const result = {
        url: null,
        qualities: [],
        subtitles,
        skipData,
        embedUrl: normalized,
        dataId,
        realId,
        mediaId,
        sourcesEndpoint,
        error: "sources payload contained no stream url (enc decrypt empty?)",
      };
      cachePut(cacheKey, result);
      return result;
    }

    const isHls = streamUrl.toLowerCase().includes(".m3u8");

    // NOTE: 4. quality variants — best-effort; CDNs blocked in some
    // environments answer 403 here, in which case qualities stays empty
    // and the master URL itself remains fully playable.
    let qualities = [];
    if (parseQualities && isHls) {
      try {
        const m3u8Res = await axios.get(streamUrl, {
          headers: { "User-Agent": PLAYER_UA, Referer: "https://megaplay.buzz/" },
          timeout,
          responseType: "text",
        });
        const content = typeof m3u8Res.data === "string" ? m3u8Res.data : "";
        const lines = content.split("\n").map((l) => l.trim());
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
          const attrs = lines[i].slice("#EXT-X-STREAM-INF:".length);
          const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] || "0", 10);
          const resolution = attrs.match(/RESOLUTION=(\d+x\d+)/)?.[1] || "";
          const [width, height] = resolution.split("x").map(Number);
          const next = lines[i + 1];
          if (next && !next.startsWith("#")) {
            qualities.push({
              label: height ? `${height}p` : bandwidth ? `${bandwidth}bps` : "default",
              width: width || 0,
              height: height || 0,
              bandwidth,
              url: next.startsWith("http") ? next : new URL(next, streamUrl).href,
            });
          }
        }
        qualities.sort((a, b) => (b.height || b.bandwidth) - (a.height || a.bandwidth));
      } catch { /* CDN unreachable from here — qualities stay empty */ }
    }

    const result = {
      url: streamUrl,
      type: isHls ? "hls" : "mp4",
      qualities,
      subtitles,
      skipData,
      embedUrl: normalized,
      dataId,
      realId,
      mediaId,
      fileVersion,
      sourcesEndpoint,
      backup,
    };
    cachePut(cacheKey, result);
    return result;
  } catch (error) {
    return {
      url: null,
      qualities: [],
      subtitles: [],
      skipData: null,
      embedUrl: normalized,
      error: error?.message || "megaplay resolution failed",
    };
  }
};

export {
  MEGAPLAY_HOSTS,
  isMegaplayUrl,
  normalizeMegaplayEmbedUrl,
  decryptMegaplayPayload,
  parseMegaplaySources,
  resolveMegaplayStream,
  clearMegaplayCache,
};

// ══════════════════════════════════════════════════════════════ END: megaplay.helper.js
