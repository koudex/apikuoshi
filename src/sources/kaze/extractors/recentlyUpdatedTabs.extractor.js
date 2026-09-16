/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts recently updated anime from homepage with tab filtering.
 *   Supports three tabs: all, dub, and sub for different update types.
 *
 * @exports
 *   extractRecentlyUpdatedTabs
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// RECENTLY UPDATED TABS EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract recently updated anime with tab filtering ----
/**
 * Fetches and parses the recently updated anime section from the homepage.
 * Supports filtering by update type: all, dub, or sub.
 *
 * @param {string} tab - Tab filter: "all", "dub", or "sub" (default: "all")
 * @returns {Promise<Array<Object>>} Array of recently updated anime objects
 * @returns {string} return[].slug - URL slug for the anime
 * @returns {string} return[].poster - Poster image URL
 * @returns {string} return[].title - English title
 * @returns {string} return[].japaneseTitle - Japanese title
 * @returns {number} return[].sub - Subbed episode count
 * @returns {number} return[].dub - Dubbed episode count
 * @returns {number} return[].total - Total episode count
 * @returns {string} return[].type - Anime type
 * @returns {string} return[].episodeInfo - Latest episode info
 *
 * @example
 *   const all = await extractRecentlyUpdatedTabs("all");
 *   console.log(all.length); // number of updated anime
 *
 *   const dubOnly = await extractRecentlyUpdatedTabs("dub");
 *   console.log(dubOnly[0].title); // first dubbed updated anime
 */
const extractRecentlyUpdatedTabs = async (tab = "all") => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const results = [];

    // NOTE: #recent-update has tabs (all/dub/sub/trending/random) but filtering is client-side
    // Items are <div class="item"> inside #recent-update .ani.items
    // Each item has .ani.poster with <a> link and .info .name.d-title
    const allItems = $("#recent-update .ani.items .item");

    allItems.each((i, el) => {
      // NOTE: The item itself is a div, the link is inside .ani.poster a or .info a.name
      const link = $(el).find(".ani.poster a").attr("href") || $(el).find(".info a.name").attr("href") || "";
      const slug = link.split("/watch/").pop()?.split("/ep-")[0] || "";
      if (!slug) return;

      // NOTE: Check sub/dub status for tab filtering
      const hasSub = $(el).find(".ep-status.sub").length > 0;
      const hasDub = $(el).find(".ep-status.dub").length > 0;

      // NOTE: Filter by tab if not "all" — since server-side rendering shows all items
      if (tab === "dub" && !hasDub) return;
      if (tab === "sub" && !hasSub) return;

      const poster = $(el).find("img").attr("src") || "";
      const title = $(el).find(".name").text().trim() || "";
      const japaneseTitle = $(el).find(".name").attr("data-jp") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
      const type = $(el).find(".meta .right, .type").text().trim() || "";

      results.push({ slug, poster, title, japaneseTitle, sub, dub, total, type });
    });

    return results;
  } catch (error) {
    throw error;
  }
};

export { extractRecentlyUpdatedTabs };

// ══════════════════════════════════════════════════════════════ END: recentlyUpdatedTabs.extractor.js
