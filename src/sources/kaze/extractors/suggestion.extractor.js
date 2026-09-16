/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts search suggestions/autocomplete results for a keyword.
 *   Returns up to 10 matching anime suggestions.
 *
 * @exports
 *   extractSuggestions
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { URLS } from "../configs/dataUrl.js";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// SUGGESTION EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract search suggestions for a keyword ----
/**
 * Fetches and parses search suggestions for a given keyword.
 * Returns up to 10 matching anime suggestions.
 *
 * @param {string} keyword - Search keyword to get suggestions for
 * @returns {Promise<Array<Object>>} Array of suggestion objects (max 10)
 * @returns {string} return.slug - URL slug for the anime
 * @returns {string} return.poster - Poster image URL
 * @returns {string} return.title - English title
 * @returns {string} return.japaneseTitle - Japanese title
 * @returns {string} return.type - Anime type (TV, Movie, etc.)
 * @returns {number} return.sub - Subbed episode count
 * @returns {number} return.dub - Dubbed episode count
 *
 * @example
 *   const suggestions = await extractSuggestions("naruto");
 *   console.log(suggestions.length); // Up to 10 results
 *   console.log(suggestions[0].title);
 */
const extractSuggestions = async (keyword) => {
  try {
    const path = `/search?keyword=${encodeURIComponent(keyword)}`;
    const { data } = await fetchWithMirror(path);
    const $ = cheerio.load(data);

    const suggestions = [];

    $("#list-items > .item").each((i, el) => {
      const slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".ani.poster.tip > a > img").attr("src") || "";
      const title = $(el).find(".info .b1 a.name.d-title").text().trim() || "";
      const japaneseTitle = $(el).find(".info .b1 a.name.d-title").attr("data-jp") || "";
      const type = $(el).find(".info .meta .m-item:nth-child(2) label").text().trim() || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;

      if (slug) {
        suggestions.push({ slug, poster, title, japaneseTitle, type, sub, dub });
      }
    });

    return suggestions.slice(0, 10);
  } catch (error) {
    throw error;
  }
};

export { extractSuggestions };

// ══════════════════════════════════════════════════════════════ END: suggestion.extractor.js
