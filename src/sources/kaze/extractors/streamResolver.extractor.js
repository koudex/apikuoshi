/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Resolves actual streaming video URLs (m3u8/mp4) from embed player URLs.
 *   Follows the chain: megaplay /videojs/ player page → data-id →
 *   stream/getSources(New) → enc decrypt (AES-256-CBC) → m3u8 playlist.
 *   MegaPlay embed URLs are normalized to the /videojs/ prefix — upstream
 *   now serves the working player ONLY under /videojs/stream/... while the
 *   bare /stream/... form renders an error page.
 *   Supports quality selection and subtitle extraction.
 *
 * @exports
 *   resolveStreamUrl, resolveStreamUrls, parseM3u8Qualities
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import axios from "axios";
import { headers } from "../configs/header.config.js";
import {
  isMegaplayUrl,
  normalizeMegaplayEmbedUrl,
  resolveMegaplayStream,
} from "../helper/megaplay.helper.js";

// ══════════════════════════════════════════════════════════════
// STREAM RESOLVER
// ══════════════════════════════════════════════════════════════

// Server name normalization map
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

// Embed domain to API domain mapping.
// NOTE: megaplay-1.buzz no longer resolves — the whole MegaPlay family
// is served from megaplay.buzz (see helper/megaplay.helper.js, which owns
// the live /videojs/ + getSources flow for these hosts).
const EMBED_API_MAP = {
  "vidtube.site": "megaplay.buzz",
  "vid-tube.site": "megaplay.buzz",
  "vidplay.site": "megaplay.buzz",
  "megaplay.buzz": "megaplay.buzz",
  "megaplay-1.buzz": "megaplay.buzz",
  "vidwish.live": "megaplay.buzz",
  "embed.bunkrerrer.com": "megaplay.buzz",
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

// ---- FEATURE: Stream URL Resolution ----
/**
 * Resolves the actual video stream URL from an embed player page.
 *
 * MegaPlay-family embeds (megaplay.buzz / vidtube.site / vidwish.live …)
 * run the dedicated live flow: normalize the URL to the /videojs/ player
 * prefix, pull data-id off the player page, call stream/getSourcesNew
 * (fallback getSources), decrypt the `enc` payload and return the real
 * m3u8/mp4 plus subtitles and skip ranges. See helper/megaplay.helper.js.
 *
 * Other embed hosts keep the legacy flow: extract data-id from the embed
 * HTML, then query the mapped player API.
 *
 * @param {string} embedUrl - The embed player URL (e.g., megaplay.buzz/stream/...)
 * @param {object} [options] - Resolution options
 * @param {boolean} [options.followRedirects=true] - Follow HTTP redirects
 * @param {number} [options.timeout=10000] - Request timeout in ms
 * @returns {Promise<Object>} Object with url, qualities, skipData, type
 *
 * @example
 *   const resolved = await resolveStreamUrl("https://megaplay.buzz/stream/s-2/107257/sub");
 *   console.log(resolved.url);      // m3u8 URL
 *   console.log(resolved.qualities); // [{ label: "720p", url: "..." }]
 */
const resolveStreamUrl = async (embedUrl, options = {}) => {
  const { followRedirects = true, timeout = 10000 } = options;

  // NOTE: MegaPlay owns the live flow — normalize + getSources + enc decrypt
  if (isMegaplayUrl(embedUrl)) {
    return resolveMegaplayStream(embedUrl, { timeout });
  }

  try {
    // NOTE: Extract the embed page to find data-id and API domain
    const embedResponse = await axios.get(embedUrl, {
      headers: {
        ...headers,
        "Referer": "https://anikototv.to/",
        "Origin": "https://anikototv.to",
      },
      timeout,
      maxRedirects: followRedirects ? 5 : 0,
    });

    const embedHtml = typeof embedResponse.data === "string"
      ? embedResponse.data
      : String(embedResponse.data);

    // NOTE: Extract data attributes from the player div
    const dataId = embedHtml.match(/data-id="(\d+)"/)?.[1];
    const realId = embedHtml.match(/data-realid="([^"]+)"/)?.[1];
    const mediaId = embedHtml.match(/data-mediaid="([^"]+)"/)?.[1];

    // NOTE: A MegaPlay page reached through a non-family host alias still
    // needs its /videojs/ player path — normalize any /stream/ page here too.
    const normalizedEmbed = normalizeMegaplayEmbedUrl(embedUrl);

    if (!dataId) {
      return {
        url: null,
        qualities: [],
        skipData: null,
        type: null,
        error: "Could not extract player data-id from embed page",
      };
    }

    // NOTE: Determine API domain from embed URL or extract from page
    const embedDomain = new URL(embedUrl).hostname;
    const apiDomain = EMBED_API_MAP[embedDomain] || embedDomain;

    // NOTE: Query the megaplay API for the actual stream URL
    const apiResponse = await axios.get(
      `https://${apiDomain}/ajax/sources/${dataId}`,
      {
        headers: {
          ...headers,
          "Referer": embedUrl,
          "Origin": `https://${embedDomain}`,
        },
        timeout,
      }
    );

    const apiData = typeof apiResponse.data === "string"
      ? (() => { try { return JSON.parse(apiResponse.data); } catch { return {}; } })()
      : apiResponse.data;

    // NOTE: Extract stream URL from API response
    const streamUrl = apiData?.source || apiData?.url || apiData?.file || null;
    const streamType = apiData?.type || (streamUrl?.includes(".m3u8") ? "hls" : "mp4");

    // NOTE: Parse m3u8 qualities if it's an HLS stream
    let qualities = [];
    if (streamUrl && streamType === "hls") {
      qualities = await parseM3u8Qualities(streamUrl, {
        headers: {
          ...headers,
          "Referer": embedUrl,
        },
        timeout,
      });
    }

    // NOTE: Extract subtitles if available
    const subtitles = extractSubtitles(apiData);

    return {
      url: streamUrl,
      type: streamType,
      qualities,
      subtitles,
      skipData: apiData?.skip_data || null,
      dataId,
      realId,
      mediaId,
      backup: apiData?.backup || null,
      embedUrl: normalizedEmbed !== embedUrl ? normalizedEmbed : undefined,
    };
  } catch (error) {
    return {
      url: null,
      qualities: [],
      skipData: null,
      type: null,
      error: error.message,
    };
  }
};

// ---- FEATURE: Batch Stream URL Resolution ----
/**
 * Resolves stream URLs for multiple episodes in batch
 * @param {string} embedUrl - The embed player URL
 * @param {object} [options] - Resolution options
 * @returns {Promise<Object>} Batch resolution result
 */
const resolveStreamUrls = async (embedUrl, options = {}) => {
  try {
    const resolved = await resolveStreamUrl(embedUrl, options);
    return resolved;
  } catch (error) {
    return { url: null, error: error.message };
  }
};

// ══════════════════════════════════════════════════════════════
// M3U8 PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: M3U8 Quality Parser ----
/**
 * Parses an M3U8 playlist to extract available quality options.
 * Supports both master playlists (multiple qualities) and media playlists.
 *
 * @param {string} m3u8Url - URL of the M3U8 playlist
 * @param {object} [options] - Fetch options
 * @param {object} [options.headers] - Custom headers
 * @param {number} [options.timeout=10000] - Request timeout
 * @returns {Promise<Array<Object>>} Array of quality objects
 *
 * @example
 *   const qualities = await parseM3u8Qualities("https://example.com/master.m3u8");
 *   qualities.forEach(q => console.log(`${q.label}: ${q.url}`));
 */
const parseM3u8Qualities = async (m3u8Url, options = {}) => {
  const { headers: customHeaders = {}, timeout = 10000 } = options;

  try {
    const response = await axios.get(m3u8Url, {
      headers: { ...headers, ...customHeaders },
      timeout,
    });

    const content = typeof response.data === "string"
      ? response.data
      : String(response.data);

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
          // NOTE: Resolve relative URLs against base M3U8 URL
          const qualityUrl = nextLine.startsWith("http")
            ? nextLine
            : new URL(nextLine, m3u8Url).href;

          qualities.push({
            label: height ? `${height}p` : `${bandwidth}bps`,
            width: width || 0,
            height: height || 0,
            bandwidth,
            url: qualityUrl,
          });
        }
      }
    }

    // NOTE: If no qualities found, it's likely a single-quality stream
    if (qualities.length === 0 && content.includes("#EXTINF")) {
      qualities.push({
        label: "default",
        width: 0,
        height: 0,
        bandwidth: 0,
        url: m3u8Url,
      });
    }

    // NOTE: Sort by resolution/bandwidth descending (highest first)
    qualities.sort((a, b) => (b.height || b.bandwidth) - (a.height || a.bandwidth));

    return qualities;
  } catch (error) {
    return [];
  }
};

// ══════════════════════════════════════════════════════════════
// SUBTITLE EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Subtitle Track Extractor ----
/**
 * Extracts subtitle information from API response data
 * @param {object} apiData - The megaplay API response
 * @returns {Array<Object>} Array of subtitle objects
 */
const extractSubtitles = (apiData) => {
  const subtitles = [];

  // NOTE: Subtitles may be in different formats depending on the source
  if (apiData?.subtitles && Array.isArray(apiData.subtitles)) {
    for (const sub of apiData.subtitles) {
      subtitles.push({
        label: sub.label || sub.language || "Unknown",
        language: sub.code || sub.language || "unknown",
        url: sub.url || sub.file || null,
        format: sub.format || "srt",
      });
    }
  }

  // NOTE: Some sources embed subtitles in tracks array
  if (apiData?.tracks && Array.isArray(apiData.tracks)) {
    for (const track of apiData.tracks) {
      if (track.kind === "subtitles" || track.type === "subtitles") {
        subtitles.push({
          label: track.label || track.language || "Unknown",
          language: track.srclang || track.language || "unknown",
          url: track.file || track.src || null,
          format: track.format || "srt",
        });
      }
    }
  }

  return subtitles;
};

export {
  resolveStreamUrl,
  resolveStreamUrls,
  parseM3u8Qualities,
  normalizeServerName,
  extractSubtitles,
  isMegaplayUrl,
  normalizeMegaplayEmbedUrl,
};

// ══════════════════════════════════════════════════════════════ END: streamResolver.extractor.js
