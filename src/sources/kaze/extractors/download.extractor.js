/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts download links for anime episodes from anikototv.to.
 *   Decodes base64 download-data attributes and follows redirects
 *   to get streaming server URLs.
 *
 *   Download flow:
 *   1. Watch page → base64 decode → nekostream.site URL
 *   2. nekostream.site → Cloudflare Worker → kwik.cx URL
 *   3. kwik.cx → actual download URL (requires browser)
 *
 * @exports
 *   extractDownloadLinks
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import axios from "axios";
import { fetchWithMirror } from "../helper/mirror.helper.js";
import { headers } from "../configs/header.config.js";

// ══════════════════════════════════════════════════════════════
// BASE64 DECODER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Base64 Download Data Decoder ----
/**
 * Decodes base64 download data from the website.
 * The source site encodes download server URLs as base64 JSON.
 *
 * @param {string} encoded - Base64 encoded string
 * @returns {Object|null} Decoded download data, or null on failure
 */
function decodeDownloadData(encoded) {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// REDIRECT FOLLOWER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Redirect Chain Resolver ----
/**
 * Follows redirect chain to get the final URL.
 * Uses axios maxRedirects to auto-follow up to 5 redirects.
 *
 * @param {string} url - Starting URL
 * @returns {Promise<string>} Final URL after redirects
 */
async function followRedirects(url) {
  try {
    const response = await axios.get(url, {
      headers,
      maxRedirects: 5,
      timeout: 10000
    });
    // NOTE: response.request.res.responseUrl contains the final URL after all redirects
    return response.request?.res?.responseUrl || response.config?.url || url;
  } catch (error) {
    // NOTE: On redirect errors, axios throws — extract Location header manually
    if (error.response?.headers?.location) {
      return error.response.headers.location;
    }
    return url;
  }
}

// ══════════════════════════════════════════════════════════════
// DOWNLOAD LINKS EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Download Links Extraction ----
/**
 * Fetches and parses download links for a specific episode.
 * Scrapes the watch page to extract download-data attributes
 * and follows the redirect chain to get streaming server URLs.
 *
 * Note: Download data may be loaded dynamically via JavaScript.
 * If no download links are found in the initial HTML, try using
 * a browser or headless browser to get the full page content.
 *
 * @param {string} slug - The anime slug (e.g., "kill-blue-gcqj5")
 * @param {number} ep - Episode number
 * @returns {Promise<Object>} Object with slug, episode, and downloads array
 *
 * @example
 *   const downloads = await extractDownloadLinks("kill-blue-gcqj5", 1);
 *   console.log(downloads.downloads[0].server); // server name
 *   console.log(downloads.downloads[0].kwikUrl); // kwik.cx URL
 */
const extractDownloadLinks = async (slug, ep) => {
  try {
    const { data } = await fetchWithMirror(`/watch/${slug}/ep-${ep}`);
    
    // NOTE: Response may be raw HTML string or JSON-wrapped HTML
    let html = "";
    if (typeof data === "string") {
      try {
        const json = JSON.parse(data);
        html = json.result || data;
      } catch (e) {
        html = data;
      }
    } else if (data?.result) {
      html = data.result;
    } else if (data?.data) {
      html = data.data;
    } else {
      html = String(data);
    }
    
    const $ = cheerio.load(html);

    const downloads = [];

    // NOTE: Multiple selectors to handle different HTML structures across mirrors
    const selectors = [
      "[download-data]",
      "li.download-icon",
      ".download-icon",
      "[onclick*='openDownloadModalDownload']",
      "[onclick*='openDownloadModal']"
    ];
    
    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const encoded = $(el).attr("download-data") || "";
        const serverType = $(el).closest(".type").attr("data-type") || "unknown";
        const serverLabel = $(el).closest(".type").find("label").text().trim() || serverType;

        if (encoded && encoded.length > 10) {
          const decoded = decodeDownloadData(encoded);
          if (decoded) {
            // NOTE: Decoded data is a nested object: { serverGroup: { serverName: url } }
            for (const [serverGroup, servers] of Object.entries(decoded)) {
              for (const [serverName, url] of Object.entries(servers)) {
                // Avoid duplicates by URL
                const exists = downloads.some(d => d.url === url);
                if (!exists) {
                  // NOTE: nekostream.site URLs need Cloudflare Worker proxy
                  const workerUrl = url.includes("nekostream.site")
                    ? url.replace("https://nekostream.site/", "https://proud-dew-d754.download992.workers.dev/")
                    : null;
                  
                  downloads.push({
                    server: serverName,
                    serverGroup,
                    type: serverType,
                    typeLabel: serverLabel,
                    url, // nekostream.site URL
                    workerUrl,
                    kwikUrl: null, // Will be filled after redirect
                    note: "Visit kwikUrl in browser to get actual download link"
                  });
                }
              }
            }
          }
        }
      });
      
      if (downloads.length > 0) break;
    }

    // NOTE: Follow redirects for each download URL to resolve kwik.cx links
    for (const download of downloads) {
      if (download.workerUrl) {
        try {
          const finalUrl = await followRedirects(download.workerUrl);
          if (finalUrl.includes("kwik.cx")) {
            download.kwikUrl = finalUrl;
          }
        } catch (error) {
          // NOTE: Redirect may fail due to Cloudflare — construct placeholder
          download.kwikUrl = "https://kwik.cx/f/[requires-browser]";
        }
      }
    }

    return {
      slug,
      episode: ep,
      totalDownloads: downloads.length,
      downloads,
      note: downloads.length > 0 
        ? "kwikUrl requires browser to bypass Cloudflare protection" 
        : "Download links may be loaded dynamically via JavaScript. Try using a browser."
    };
  } catch (error) {
    throw error;
  }
};

export { extractDownloadLinks };
// ══════════════════════════════════════════════════════════════ END: download.extractor.js
