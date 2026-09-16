/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Provides search functionality for anikototv.to — supports paginated
 *   search results and lightweight autocomplete suggestions.
 *
 * @exports
 *   extractSearchResults, extractSearchSuggestions
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { URLS } from "../configs/dataUrl.js";
import { extractPages } from "../helper/extractPages.helper.js";
import { countPages } from "../helper/countPages.helper.js";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// SEARCH RESULTS EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract paginated search results for a keyword ----
/**
 * Searches anikototv.to for anime matching the given keyword and returns
 * paginated results with full metadata including episode counts and genres.
 *
 * @param {string} keyword - The search query string
 * @param {number} [page=1] - Page number for pagination
 * @returns {Promise<Object>} Object with totalPages count and data array of results
 *
 * @example
 *   const results = await extractSearchResults("naruto", 1);
 *   console.log(results.totalPages); // total available pages
 *   console.log(results.data[0].title); // first result title
 */
const extractSearchResults = async (keyword, page = 1) => {
  try {
    const url = `${URLS.search}?keyword=${encodeURIComponent(keyword)}`;
    const $ = await extractPages(url, page);
    const totalPages = countPages($);

    const results = [];
    $("#list-items > .item").each((i, el) => {
      const slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".ani.poster.tip > a > img").attr("src") || "";
      const title = $(el).find(".info .b1 a.name.d-title").text().trim() || "";
      const japaneseTitle = $(el).find(".info .b1 a.name.d-title").attr("data-jp") || "";
      const animeId = $(el).find(".ani.poster.tip").attr("data-tip") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
      const type = $(el).find(".info .meta .m-item:nth-child(2) label").text().trim() || "";
      const rating = $(el).find(".info .meta .m-item.rated span").text().trim() || "";
      const genres = [];
      $(el).find(".info .b1 .genre a").each((j, g) => {
        genres.push($(g).text().trim());
      });

      if (slug) {
        results.push({
          slug,
          animeId,
          poster,
          title,
          japaneseTitle,
          sub,
          dub,
          total,
          type,
          rating,
          genres
        });
      }
    });

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

// ══════════════════════════════════════════════════════════════
// SEARCH SUGGESTIONS EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract lightweight autocomplete suggestions (capped at 10) ----
/**
 * Fetches search suggestions for a keyword — returns a lightweight subset
 * of result data suitable for autocomplete dropdowns.
 *
 * @param {string} keyword - The search query string
 * @returns {Promise<Array>} Array of up to 10 suggestion objects with slug, poster, title, type
 *
 * @example
 *   const suggestions = await extractSearchSuggestions("one piece");
 *   console.log(suggestions.length); // max 10
 */
const extractSearchSuggestions = async (keyword) => {
  try {
    const path = `/search?keyword=${encodeURIComponent(keyword)}`;
    const { data } = await fetchWithMirror(path);
    const $ = cheerio.load(data);

    const suggestions = [];
    $("#list-items > .item").each((i, el) => {
      const slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".ani.poster.tip > a > img").attr("src") || "";
      const title = $(el).find(".info .b1 a.name.d-title").text().trim() || "";
      const type = $(el).find(".info .meta .m-item:nth-child(2) label").text().trim() || "";

      if (slug) {
        suggestions.push({ slug, poster, title, type });
      }
    });

    return suggestions.slice(0, 10);
  } catch (error) {
    throw error;
  }
};

export { extractSearchResults, extractSearchSuggestions };

// ══════════════════════════════════════════════════════════════ END: search.extractor.js
