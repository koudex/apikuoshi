/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Handles server/stream resolution for episodes — fetches individual
 *   stream URLs, server lists via AJAX, and alternative servers from
 *   the nekostream mapper API.
 *
 * @exports
 *   extractStreamInfo, extractServerList, extractMapperServers
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { headers } from "../configs/header.config.js";
import { BASE_URL } from "../configs/dataUrl.js";
import { fetchWithMirror, getWorkingMirror } from "../helper/mirror.helper.js";
import { normalizeServerName } from "./streamResolver.extractor.js";
import { toVideojsEmbedUrl, resolveVideojsStream } from "./streamResolver.extractor.js";
import { renameServer } from "../helper/cdn.helper.js";

// ══════════════════════════════════════════════════════════════
// STREAM INFO EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Resolve a single stream URL from a linkId ----
/**
 * Fetches the actual stream URL and skip data for a given server link ID.
 * First establishes a session by fetching the watch page, then queries
 * the AJAX stream endpoint with proper session context.
 *
 * The AJAX payload's `url` is a RAW megaplay embed (…/stream/s-2/…/sub)
 * which 410s for direct playback — it is AUTO-MIGRATED to the /videojs/
 * form and resolved to a real m3u8/mp4 through the player's own
 * getSources pipeline (decrypted + CDN-tokenized).
 *
 * @param {string} linkId - The server link ID to resolve
 * @param {string} [watchSlug] - Optional watch page slug to establish session
 * @param {object} [opts]
 * @param {boolean} [opts.deep=true] - Also run the videojs deep resolution
 * @returns {Promise<Object>} { linkId, url, embedUrl, type, skipData,
 *   qualities, subtitles, backup, error? }
 *
 * @example
 *   const stream = await extractStreamInfo("abc123", "one-piece-odmau");
 *   console.log(stream.url);      // tokenized m3u8 URL
 *   console.log(stream.embedUrl); // /videojs/ player page
 *   console.log(stream.skipData); // intro/outro skip ranges
 */
const extractStreamInfo = async (linkId, watchSlug = null, opts = {}) => {
  const { deep = true } = opts;
  try {
    // NOTE: Establish session with cookies — AJAX endpoints require session cookies
    const mirror = await getWorkingMirror();
    let cookieHeader = "";

    if (watchSlug) {
      try {
        const sessionRes = await axios.get(`${mirror}/watch/${watchSlug}`, {
          headers,
          timeout: 10000,
          maxRedirects: 5,
        });
        const setCookies = sessionRes.headers["set-cookie"];
        if (Array.isArray(setCookies)) {
          cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
        }
      } catch { /* session establishment is best-effort */ }
    }

    // NOTE: Fallback — if no slug provided, try fetching any page to get session cookies
    if (!cookieHeader) {
      try {
        const fallbackRes = await axios.get(`${mirror}/home`, {
          headers,
          timeout: 10000,
          maxRedirects: 5,
        });
        const setCookies = fallbackRes.headers["set-cookie"];
        if (Array.isArray(setCookies)) {
          cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
        }
      } catch { /* fallback is best-effort */ }
    }

    const path = `/ajax/server?get=${linkId}`;
    const requestHeaders = {
      ...headers,
      "X-Requested-With": "XMLHttpRequest",
      ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
    };

    const { data: raw } = await fetchWithMirror(path, {
      headers: requestHeaders
    });

    // NOTE: Handle both string JSON and parsed object responses
    let data = raw;
    if (typeof raw === "string") {
      try { data = JSON.parse(raw); } catch { data = {}; }
    }

    // NOTE: Detect upstream API error responses (e.g. {status: 500, result: "Bad request"})
    if (data && typeof data === "object" && data.status && Number(data.status) >= 400) {
      throw new Error(`Upstream API error (${data.status}): ${data.result || "Unknown error"}`);
    }

    if (!data || !data.result) {
      return { linkId, url: null, type: null, skipData: null };
    }

    // NOTE: If result is a non-JSON string (error message), treat as upstream failure
    const result = typeof data.result === "string"
      ? (() => {
          try { return JSON.parse(data.result); }
          catch {
            if (!data.result.startsWith("{") && !data.result.startsWith("[")) {
              throw new Error(`Upstream returned invalid data: ${data.result}`);
            }
            return {};
          }
        })()
      : data.result;

    const rawUrl = result.url || null;
    const skipData = result.skip_data
      ? {
          intro: Array.isArray(result.skip_data.intro)
            ? { start: Number(result.skip_data.intro[0]) || 0, end: Number(result.skip_data.intro[1]) || 0 }
            : result.skip_data.intro || null,
          outro: Array.isArray(result.skip_data.outro)
            ? { start: Number(result.skip_data.outro[0]) || 0, end: Number(result.skip_data.outro[1]) || 0 }
            : result.skip_data.outro || null,
        }
      : null;

    const out = {
      linkId,
      url: rawUrl,
      embedUrl: rawUrl ? toVideojsEmbedUrl(rawUrl) || rawUrl : null,
      type: rawUrl?.includes(".m3u8") ? "hls" : rawUrl ? "mp4" : null,
      skipData,
      qualities: [],
      subtitles: [],
      backup: result.backup || null,
    };

    // NOTE: The raw AJAX url is a 410-prone embed page — resolve it deep
    // through the /videojs/ pipeline so callers always get a playable URL.
    if (deep && rawUrl && !rawUrl.includes(".m3u8")) {
      const resolved = await resolveVideojsStream(rawUrl).catch(() => null);
      if (resolved?.url) {
        out.url = resolved.url;
        out.embedUrl = resolved.embedUrl || out.embedUrl;
        out.type = resolved.type || out.type;
        out.qualities = resolved.qualities || [];
        out.subtitles = resolved.subtitles || [];
        out.skipData = resolved.skipData || out.skipData;
      } else {
        out.error = resolved?.error || "videojs resolution failed";
      }
    }

    return out;
  } catch (error) {
    throw error;
  }
};

// ══════════════════════════════════════════════════════════════
// SERVER LIST EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Fetch available servers for a set of episode IDs ----
/**
 * Retrieves the server list for the given episode IDs from the AJAX endpoint.
 * First establishes a session by fetching the watch page, then queries
 * the AJAX server list endpoint with proper session context.
 *
 * @param {string} episodeIds - Comma-separated or single episode ID string
 * @param {string} [watchSlug] - Optional watch page slug to establish session
 * @returns {Promise<Array>} Array of server objects with type, link_id, ep_id, etc.
 *
 * @example
 *   const servers = await extractServerList("12345", "one-piece-odmau");
 *   console.log(servers[0].link_id); // first server's link ID
 */
const extractServerList = async (episodeIds, watchSlug = null) => {
  try {
    // NOTE: Establish session with cookies — AJAX endpoints require session cookies
    const mirror = await getWorkingMirror();
    let cookieHeader = "";

    if (watchSlug) {
      try {
        const sessionRes = await axios.get(`${mirror}/watch/${watchSlug}`, {
          headers,
          timeout: 10000,
          maxRedirects: 5,
        });
        const setCookies = sessionRes.headers["set-cookie"];
        if (Array.isArray(setCookies)) {
          cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
        }
      } catch { /* session establishment is best-effort */ }
    }

    if (!cookieHeader) {
      try {
        const fallbackRes = await axios.get(`${mirror}/home`, {
          headers,
          timeout: 10000,
          maxRedirects: 5,
        });
        const setCookies = fallbackRes.headers["set-cookie"];
        if (Array.isArray(setCookies)) {
          cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
        }
      } catch { /* fallback is best-effort */ }
    }

    const path = `/ajax/server/list?servers=${episodeIds}`;
    const requestHeaders = {
      ...headers,
      "X-Requested-With": "XMLHttpRequest",
      ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
    };

    const { data: raw } = await fetchWithMirror(path, {
      headers: requestHeaders
    });

    // NOTE: Parse JSON response first — fetchWithMirror returns raw text by default
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    }

    // NOTE: Detect upstream API error responses
    if (parsed && typeof parsed === "object" && parsed.status && Number(parsed.status) >= 400) {
      throw new Error(`Upstream API error (${parsed.status}): ${parsed.result || "Unknown error"}`);
    }

    const html = parsed?.result || "";
    const $ = cheerio.load(html);

    const servers = [];
      $(".servers .type").each((_, typeEl) => {
        const type = $(typeEl).attr("data-type") || "sub";
        const label = $(typeEl).find("label").text().trim() || type.toUpperCase();
        $(typeEl).find("li[data-link-id]").each((__, li) => {
          // NOTE: The beta server carries a <span class="sv-pretest">beta</span>
          // badge inside the <li> — clone-and-remove so the name stays clean.
          const rawName = $(li).clone().find(".sv-pretest").remove().end().text().replace(/\s+/g, " ").trim() || "";
          const isBeta = ($(li).attr("class") || "").includes("sv-pretest-btn");
          const renamed = renameServer(rawName);
          servers.push({
            type,
            typeLabel: label,
            ep_id: $(li).attr("data-ep-id") || "",
            link_id: $(li).attr("data-link-id") || "",
            cmid: $(li).attr("data-cmid") || "",
            sv_id: $(li).attr("data-sv-id") || "",
            name: renamed.name,
            originalName: renamed.originalName,
            normalizedName: normalizeServerName(rawName),
            ...(isBeta ? { beta: true } : {}),
          });
        });
      });

    return servers;
  } catch (error) {
    throw error;
  }
};

// ══════════════════════════════════════════════════════════════
// MAPPER SERVERS EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Fetch alternative streaming servers from nekostream mapper API ----
/**
 * Queries the nekostream mapper API for alternative streaming providers
 * (sub and dub) for a given anime identified by MAL ID, slug, and timestamp.
 * Returns a flat array of server objects per provider.
 *
 * @param {number|string} malId - MyAnimeList ID for the anime
 * @param {string} slug - The anime slug on anikototv.to
 * @param {string|number} timestamp - Episode timestamp identifier
 * @returns {Promise<Array>} Array of server objects with provider, type, url, download fields
 *
 * @example
 *   const servers = await extractMapperServers(21, "one-piece", 1234567890);
 *   console.log(servers[0].provider); // "vidstreaming"
 *   console.log(servers[0].type);     // "sub" or "dub"
 */
const extractMapperServers = async (malId, slug, timestamp) => {
  try {
    if (!Number.isFinite(Number(malId))) throw new Error("Invalid malId");
    if (!/^[a-zA-Z0-9-]+$/.test(slug)) throw new Error("Invalid slug");
    if (!Number.isFinite(Number(timestamp))) throw new Error("Invalid timestamp");

    const path = `/ajax/mapper/${encodeURIComponent(malId)}/${encodeURIComponent(slug)}/${encodeURIComponent(timestamp)}`;
    const { data: rawData } = await fetchWithMirror(path);

    // NOTE: Parse JSON response first — fetchWithMirror returns raw text by default
    let data = rawData;
    if (typeof rawData === "string") {
      try { data = JSON.parse(rawData); } catch { data = {}; }
    }

    const servers = [];

    if (data && typeof data === "object") {
      for (const [provider, sources] of Object.entries(data)) {
        if (sources && sources.sub) {
          servers.push({
            provider,
            type: "sub",
            url: sources.sub.url || null,
            download: sources.sub.download || null
          });
        }
        if (sources && sources.dub) {
          servers.push({
            provider,
            type: "dub",
            url: sources.dub.url || null,
            download: sources.dub.download || null
          });
        }
      }
    }

    return servers;
  } catch (error) {
    return [];
  }
};

export { extractStreamInfo, extractServerList, extractMapperServers };

// ══════════════════════════════════════════════════════════════ END: streamInfo.extractor.js
