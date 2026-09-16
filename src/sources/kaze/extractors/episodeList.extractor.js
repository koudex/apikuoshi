/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts the full episode list for a given anime from anikototv.to.
 *   First resolves the anime ID from the watch page, then fetches the
 *   episode list via AJAX endpoint.
 *
 * @exports
 *   extractEpisodeList
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// EPISODE LIST EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract complete episode list for an anime by slug ----
/**
 * Fetches the anime watch page to resolve the internal anime ID, then
 * queries the AJAX episode list endpoint to get all episodes with their
 * metadata (ID, number, slug, title, active state, href).
 *
 * @param {string} slugOrId - The anime slug or numeric ID (e.g. "naruto-shippuden" or "12345")
 * @returns {Promise<Object>} Object with animeId, slug, totalEpisodes, and episodes array
 *
 * @example
 *   const episodeData = await extractEpisodeList("one-piece");
 *   console.log(episodeData.totalEpisodes); // e.g. 1100+
 *   console.log(episodeData.episodes[0].episode_no); // 1
 */
const extractEpisodeList = async (slugOrId) => {
  try {
    let animeId = 0;
    let resolvedSlug = slugOrId;

    if (/^\d+$/.test(slugOrId)) {
      animeId = parseInt(slugOrId);
    } else {
      const path = `/watch/${slugOrId}`;
      const { data: infoData } = await fetchWithMirror(path);
      const $ = cheerio.load(infoData);
      animeId = parseInt($("#watch-main").attr("data-id")) || 0;
    }

    if (!animeId) {
      return { animeId: 0, slug: slugOrId, totalEpisodes: 0, episodes: [] };
    }

    try {
      const ajaxPath = `/ajax/episode/list/${animeId}`;
      const { data: ajaxRaw } = await fetchWithMirror(ajaxPath, {
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });

      // NOTE: Parse JSON response first — fetchWithMirror returns raw text by default
      let ajaxParsed = ajaxRaw;
      if (typeof ajaxRaw === "string") {
        try { ajaxParsed = JSON.parse(ajaxRaw); } catch { ajaxParsed = {}; }
      }
      const ajaxHtml = ajaxParsed?.result || "";
      const $ep = cheerio.load(ajaxHtml);

      const episodes = [];
      $ep("a[data-num], a[data-ep-id], a[data-id]").each((i, el) => {
        const epId = $ep(el).attr("data-ep-id") || $ep(el).attr("data-id") || "";
        const epNum = parseInt($ep(el).attr("data-num")) || i + 1;
        const epSlug = $ep(el).attr("data-slug") || "";
        const href = $ep(el).attr("href") || "";
        const epTitle = $ep(el).find(".ep-title, .ep-name").text().trim() || "";
        const isActive = $ep(el).hasClass("active") || false;
        const serverIds = ($ep(el).attr("data-ids") || "").replace(/^\\?["']|\\?["']$/g, "");
        const timestamp = $ep(el).attr("data-timestamp") || "";
        const malId = $ep(el).attr("data-mal") || "";

        episodes.push({
          id: epId,
          episode_no: epNum,
          slug: epSlug,
          title: epTitle,
          active: isActive,
          href,
          server_ids: serverIds,
          timestamp,
          mal_id: malId
        });
      });

      return {
        animeId,
        slug: slugOrId,
        totalEpisodes: episodes.length,
        episodes
      };
    } catch (ajaxError) {
      return {
        animeId,
        slug: slugOrId,
        totalEpisodes: 0,
        episodes: []
      };
    }
  } catch (error) {
    throw error;
  }
};

export { extractEpisodeList };

// ══════════════════════════════════════════════════════════════ END: episodeList.extractor.js
