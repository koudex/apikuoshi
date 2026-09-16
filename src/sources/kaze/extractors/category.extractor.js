/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts anime filtered by category (genre, type, status, etc.).
 *   Supports multiple category types with automatic URL detection.
 *
 * @exports
 *   extractCategory
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import { URLS } from "../configs/dataUrl.js";
import { countPages } from "../helper/countPages.helper.js";
import { extractPages } from "../helper/extractPages.helper.js";
import { parseListItems } from "../helper/parseListItem.helper.js";

// ══════════════════════════════════════════════════════════════
// CATEGORY FILTER EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract anime filtered by category with pagination ----
/**
 * Fetches and parses anime filtered by category.
 * Automatically detects category type (genre, type, status) from the input.
 *
 * @param {string} category - Category to filter by (e.g., "genre/action", "type/tv", "status/ongoing")
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages and data array
 * @returns {number} return.totalPages - Total number of pages available
 * @returns {Array<Object>} return.data - Array of anime objects
 * @returns {string} return.data[].slug - URL slug for the anime
 * @returns {string} return.data[].animeId - Internal anime ID
 * @returns {string} return.data[].poster - Poster image URL
 * @returns {string} return.data[].title - English title
 * @returns {string} return.data[].japaneseTitle - Japanese title
 * @returns {number} return.data[].sub - Subbed episode count
 * @returns {number} return.data[].dub - Dubbed episode count
 * @returns {number} return.data[].total - Total episode count
 * @returns {string} return.data[].type - Anime type (TV, Movie, etc.)
 * @returns {string} return.data[].rating - Anime rating
 *
 * @example
 *   const actionAnime = await extractCategory("genre/action", 1);
 *   console.log(actionAnime.data[0].title); // First action anime
 *
 *   const tvAnime = await extractCategory("type/tv", 1);
 *   console.log(tvAnime.data[0].title); // First TV anime
 */
const extractCategory = async (category, page = 1) => {
  try {
    let url;
    if (category.startsWith("genre/")) {
      url = URLS.genre(category.replace("genre/", ""));
    } else if (category.startsWith("type/")) {
      url = URLS.type(category.replace("type/", ""));
    } else if (category.startsWith("status/")) {
      // NOTE: Map short status names to full slugs used by the site
      const statusSlug = category.replace("status/", "");
      const statusMap = {
        ongoing: "currently-airing",
        airing: "currently-airing",
        completed: "finished-airing",
        finished: "finished-airing",
        upcoming: "not-yet-aired"
      };
      const mapped = statusMap[statusSlug] || statusSlug;
      url = URLS.status(mapped);
    } else {
      url = `${URLS.home}/${category}`;
    }

    const $ = await extractPages(url, page);
    const totalPages = countPages($);
    const results = parseListItems($, "#list-items > .item", { includeAnimeId: true });

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

export { extractCategory };

// ══════════════════════════════════════════════════════════════ END: category.extractor.js
