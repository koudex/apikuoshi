/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module
 *
 * @description
 *   Resolves actual streaming video URLs (m3u8/mp4) from embed player
 *   URLs through the CURRENT megaplay pipeline (v2, 2026 refresh):
 *
 *     megaplay.buzz/stream/s-{sv}/{realId}/{type}      (raw AJAX url)
 *        ↓  insert /videojs/                            (the fix)
 *     megaplay.buzz/videojs/stream/s-{sv}/{realId}/{type}
 *        ↓  player page exposes data-id                 (file id)
 *     megaplay.buzz/videojs/stream/getSources?id=…
 *        ↓  AES-256-CBC decrypt of `enc`                (cdn.helper)
 *     https://…/master.m3u8  →  ?token=…                (90 s HMAC)
 *
 *   The legacy `ajax/sources` hop (megaplay-1.buzz) is gone — that
 *   domain no longer resolves and answered 410/403. Embed URLs found
 *   in the wild are AUTO-MIGRATED to the /videojs/ form.
 *
 * @exports
 *   toVideojsEmbedUrl, resolveVideojsStream, resolveStreamUrl,
 *   resolveStreamUrls, parseM3u8Qualities, normalizeServerName,
 *   extractSubtitles
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import axios from "axios";
import { headers } from "../configs/header.config.js";
import { decryptSourcesEnc, withCdnToken, needsCdnToken } from "../helper/cdn.helper.js";

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════

/** Player origin the embed + getSources requests expect. */
const MEGAPLAY_ORIGIN = process.env.MEGAPLAY_ORIGIN || "https://megaplay.buzz";

/** Sites the upstream AJAX links can arrive as — all are megaplay hosts. */
const EMBED_HOSTS = ["megaplay.buzz", "vidtube.site", "vid-tube.site", "vidplay.site"];

// Legacy map kept ONLY to answer "is this one of ours" questions.
const EMBED_DOMAINS = new Set([...EMBED_HOSTS, "embed.bunkrerrer.com"]);

/**
 * The site's raw server labels we know. Used by normalizeServerName for
 * back-compat; friendly codenames live in cdn.helper (SERVER_CODENAMES).
 */
const SERVER_NAME_MAP = {
  "VidPlay-1": "vidplay",
  "VidPlay-2": "vidplay",
  "HD-1": "hd",
  "HD-2": "hd",
  "Vidstream-1": "vidstream",
  "Vidstream-2": "vidstream",
  "VidCloud-1": "vidcloud",
  "VidCloud-2": "vidcloud",
  "StreamTape-1": "streamtape",
  "StreamTape-2": "streamtape",
};

// ---- FEATURE: Server Name Normalization ----
/**
 * Normalizes server display names to clean identifiers
 * @param {string} name - Raw server name (e.g., "VidPlay-1")
 * @returns {string} Normalized name (e.g., "vidplay")
 */
const normalizeServerName = (name) => {
  if (!name) return "unknown";
  return SERVER_NAME_MAP[name] || name.toLowerCase().replace(/[-\s]+\d+$/, "").trim();
};

// ══════════════════════════════════════════════════════════════
// VIDEOJS EMBED URL MIGRATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Auto-Migrate Embed URLs to /videojs/ Form ----
/**
 * Rewrites any megaplay-family stream/embed URL to the working
 * `/videojs/` player form. This is the 2026 fix for the 410s: the
 * bare `/stream/...` route now serves an error page, while
 * `/videojs/stream/...` serves the real player.
 *
 *   https://megaplay.buzz/stream/s-2/118984/sub
 *     → https://megaplay.buzz/videojs/stream/s-2/118984/sub
 *
 * Also normalizes legacy hosts (vidtube.site, vidplay.site) onto the
 * current megaplay origin and drops `?s=tcdn|bcdn` hints (they select
 * the CDN in the browser player; our resolver handles CDNs itself).
 *
 * @param {string} url - Raw embed/stream URL
 * @returns {string|null} Normalized videojs player URL (null if not ours)
 */
const toVideojsEmbedUrl = (url) => {
  try {
    const u = new URL(String(url));
    if (!EMBED_DOMAINS.has(u.hostname.toLowerCase())) return null;
    let path = u.pathname;
    if (!path.includes("/videojs/")) {
      path = path.replace(/^\/stream\//, "/videojs/stream/").replace(/^\/embed\//, "/videojs/stream/");
      if (!path.startsWith("/videojs/")) path = `/videojs${path}`;
    }
    return `${MEGAPLAY_ORIGIN}${path}${u.search || ""}`;
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════
// STREAM RESOLVER (videojs pipeline)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Videojs Stream Resolution ----
/**
 * Resolves the real, playable stream URL from a megaplay embed URL:
 * embed page → data-id → getSources → decrypt `enc` → CDN token.
 * Also returns subtitle tracks, intro/outro skip ranges and per-
 * quality variant URLs (master playlists only).
 *
 * @param {string} embedUrl - Embed/player URL in ANY known form
 *   (with or without /videojs/, any megaplay-family host)
 * @param {object} [options]
 * @param {number} [options.timeout=12000] - Request timeout in ms
 * @param {boolean} [options.qualities=true] - Parse variant playlist URLs
 * @returns {Promise<Object>} { url, embedUrl, type, qualities, subtitles,
 *   skipData, dataId, realId, mediaId, server, error }
 */
const resolveVideojsStream = async (embedUrl, options = {}) => {
  const { timeout = 12000, qualities: wantQualities = true } = options;
  const out = {
    url: null,
    embedUrl: null,
    type: null,
    qualities: [],
    subtitles: [],
    skipData: null,
    dataId: null,
    realId: null,
    mediaId: null,
    server: null,
    error: null,
  };

  const playerUrl = toVideojsEmbedUrl(embedUrl);
  if (!playerUrl) {
    out.error = `Not a recognized megaplay embed URL: ${embedUrl}`;
    return out;
  }
  out.embedUrl = playerUrl;

  try {
    // NOTE: 1. player page — carries the file's data-id
    const page = await axios.get(playerUrl, {
      headers: { ...headers, Referer: "https://anikototv.to/" },
      timeout,
      maxRedirects: 5,
    });
    const html = typeof page.data === "string" ? page.data : String(page.data);

    out.dataId = html.match(/data-id="(\d+)"/)?.[1] || null;
    out.realId = html.match(/data-realid="([^"]+)"/)?.[1] || null;
    out.mediaId = html.match(/data-mediaid="([^"]+)"/)?.[1] || null;
    const fileError = /class="error-content"|title>Error - MegaPlay/i.test(html);

    if (!out.dataId) {
      out.error = fileError
        ? "Upstream returned an error page for this embed (episode file may not exist yet)"
        : "Could not extract player data-id from embed page";
      return out;
    }

    // NOTE: 2. getSources — subtitles, skip data and the encrypted stream
    const srcRes = await axios.get(`${MEGAPLAY_ORIGIN}/videojs/stream/getSources?id=${out.dataId}`, {
      headers: {
        ...headers,
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: playerUrl,
        Origin: MEGAPLAY_ORIGIN,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout,
      maxRedirects: 5,
    });
    const data = typeof srcRes.data === "string"
      ? (() => { try { return JSON.parse(srcRes.data); } catch { return {}; } })()
      : srcRes.data;

    if (data?.error) {
      out.error = `getSources error: ${data.error}`;
      return out;
    }

    // NOTE: 3. decrypt `enc` → { file }
    let file = null;
    if (data?.enc) {
      const dec = decryptSourcesEnc(data.enc);
      file = dec?.file || null;
      if (!file) out.error = "Failed to decrypt sources blob (keys may have rotated)";
    } else if (typeof data?.sources?.file === "string") {
      file = data.sources.file; // legacy plaintext shape, just in case
    }
    if (!file) {
      out.error = out.error || "No stream file in getSources payload";
      out.subtitles = extractSubtitles(data);
      out.skipData = normalizeSkipData(data?.intro, data?.outro);
      return out;
    }

    // NOTE: 4. attach a fresh 90 s CDN token (gated CDNs 403 without it)
    out.url = withCdnToken(file);
    out.type = out.url?.includes(".m3u8") ? "hls" : "mp4";
    out.server = data?.server ?? null;
    out.subtitles = extractSubtitles(data);
    out.skipData = normalizeSkipData(data?.intro, data?.outro);

    // NOTE: 5. per-quality variants (master playlists only)
    if (wantQualities && out.type === "hls") {
      out.qualities = await parseM3u8Qualities(out.url, {
        headers: { ...headers, Referer: `${MEGAPLAY_ORIGIN}/` },
        timeout,
      });
    }
    return out;
  } catch (error) {
    out.error = out.error || error?.message || String(error);
    return out;
  }
};

// ---- FEATURE: Skip Range Normalizer ----
/**
 * getSources answers `intro:{start,end}` / `outro:{start,end}`; the
 * AJAX server payload uses arrays `[start,end]`. Normalize both to
 * the API's long-standing skipData shape ({intro:{start,end},…}).
 */
const normalizeSkipData = (intro, outro) => {
  const norm = (v) => {
    if (!v) return null;
    if (Array.isArray(v)) return { start: Number(v[0]) || 0, end: Number(v[1]) || 0 };
    if (typeof v === "object") return { start: Number(v.start) || 0, end: Number(v.end) || 0 };
    return null;
  };
  const i = norm(intro);
  const o = norm(outro);
  if (!i && !o) return null;
  return { intro: i, outro: o };
};

// ---- FEATURE: Legacy-Compatible Stream Resolution ----
/**
 * Back-compat entry point (same signature the chain/adapter used with
 * the old ajax/sources resolver). Auto-migrates the URL to /videojs/
 * and runs the new pipeline. Returns the same field names as before
 * plus embedUrl/subtitles.
 */
const resolveStreamUrl = async (embedUrl, options = {}) => {
  const r = await resolveVideojsStream(embedUrl, options);
  return {
    url: r.url,
    type: r.type,
    qualities: r.qualities,
    subtitles: r.subtitles,
    skipData: r.skipData,
    dataId: r.dataId,
    realId: r.realId,
    mediaId: r.mediaId,
    backup: null,
    embedUrl: r.embedUrl,
    error: r.error,
  };
};

/** Alias kept for older call sites. */
const resolveStreamUrls = resolveStreamUrl;

// ══════════════════════════════════════════════════════════════
// M3U8 PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: M3U8 Quality Parser ----
/**
 * Parses an M3U8 master playlist to extract available quality options.
 * Token-gated CDNs get a fresh token per variant URL. Relative variant
 * paths are resolved against the (tokenized) base URL.
 *
 * @param {string} m3u8Url - URL of the M3U8 playlist
 * @param {object} [options] - Fetch options { headers, timeout }
 * @returns {Promise<Array<Object>>} [{ label, width, height, bandwidth, url }]
 */
const parseM3u8Qualities = async (m3u8Url, options = {}) => {
  const { headers: customHeaders = {}, timeout = 12000 } = options;

  try {
    const response = await axios.get(m3u8Url, {
      headers: { ...headers, ...customHeaders, Referer: `${MEGAPLAY_ORIGIN}/` },
      timeout,
    });

    const content = typeof response.data === "string" ? response.data : String(response.data);
    const qualities = [];
    const lines = content.split("\n").map((l) => l.trim());

    // NOTE: Parse master playlist (contains #EXT-X-STREAM-INF)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
        const attrs = lines[i].substring("#EXT-X-STREAM-INF:".length);
        const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] || "0");
        const resolution = attrs.match(/RESOLUTION=(\d+x\d+)/)?.[1] || "";
        const [width, height] = resolution.split("x").map(Number);
        const nextLine = lines[i + 1];

        if (nextLine && !nextLine.startsWith("#")) {
          const base = m3u8Url.split("?")[0];
          const raw = nextLine.startsWith("http") ? nextLine : new URL(nextLine, base).href;
          qualities.push({
            label: height ? `${height}p` : `${bandwidth}bps`,
            width: width || 0,
            height: height || 0,
            bandwidth,
            url: needsCdnToken(raw) ? withCdnToken(raw) : raw,
          });
        }
      }
    }

    // NOTE: If no qualities found, it's likely a single-quality stream
    if (qualities.length === 0 && content.includes("#EXTINF")) {
      qualities.push({ label: "default", width: 0, height: 0, bandwidth: 0, url: m3u8Url });
    }

    qualities.sort((a, b) => (b.height || b.bandwidth) - (a.height || a.bandwidth));
    return qualities;
  } catch {
    return [];
  }
};

// ══════════════════════════════════════════════════════════════
// SUBTITLE EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Subtitle Track Extractor ----
/**
 * Extracts subtitle information from getSources / legacy API data.
 * getSources shape: tracks:[{file,label,kind:"captions",default?}]
 * @param {object} apiData
 * @returns {Array<Object>} [{ label, language, url, format, default }]
 */
const extractSubtitles = (apiData) => {
  const subtitles = [];

  if (apiData?.subtitles && Array.isArray(apiData.subtitles)) {
    for (const sub of apiData.subtitles) {
      subtitles.push({
        label: sub.label || sub.language || "Unknown",
        language: sub.code || sub.language || "unknown",
        url: sub.url || sub.file || null,
        format: sub.format || "srt",
        default: Boolean(sub.default),
      });
    }
  }

  if (apiData?.tracks && Array.isArray(apiData.tracks)) {
    for (const track of apiData.tracks) {
      const isSub = track.kind === "subtitles" || track.kind === "captions" || track.type === "subtitles";
      if (!isSub) continue;
      subtitles.push({
        label: track.label || track.language || "Unknown",
        language: track.srclang || track.language || (track.file || track.src || "").match(/([a-z]{3})-\d+\.\w+$/i)?.[1] || "unknown",
        url: track.file || track.src || track.url || null,
        format: track.format || ((track.file || "").endsWith(".vtt") ? "vtt" : "srt"),
        default: Boolean(track.default),
      });
    }
  }

  return subtitles.filter((s) => s.url);
};

export {
  toVideojsEmbedUrl,
  resolveVideojsStream,
  resolveStreamUrl,
  resolveStreamUrls,
  parseM3u8Qualities,
  normalizeServerName,
  extractSubtitles,
  MEGAPLAY_ORIGIN,
};

// ══════════════════════════════════════════════════════════════ END: streamResolver.extractor.js
