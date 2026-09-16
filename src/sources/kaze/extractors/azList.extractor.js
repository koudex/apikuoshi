/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts anime from A-Z listing pages with pagination.
 *   Supports filtering by letter (a-z) or "all" for complete list.
 *
 * @exports
 *   extractAzList
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import { URLS } from "../configs/dataUrl.js";
import { extractPages } from "../helper/extractPages.helper.js";
import { countPages } from "../helper/countPages.helper.js";
import { parseListItems } from "../helper/parseListItem.helper.js";

// ══════════════════════════════════════════════════════════════
// A-Z LIST EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract anime from A-Z listing with pagination ----
/**
 * Fetches and parses anime from the A-Z listing page.
 * Supports filtering by letter (a-z) or "all" for complete list.
 *
 * @param {string} letter - Letter to filter by (a-z) or "all" (default: "all")
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages, letter, and data array
 * @returns {number} return.totalPages - Total number of pages available
 * @returns {string} return.letter - The letter filter used
 * @returns {Array<Object>} return.data - Array of anime objects
 * @returns {string} return.data[].slug - URL slug for the anime
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
 *   const azList = await extractAzList("a", 1);
 *   console.log(azList.letter); // "a"
 *   console.log(azList.data[0].title); // First anime starting with "a"
 */
const extractAzList = async (letter = "all", page = 1) => {
  try {
    const url = URLS.azList(letter);
    const $ = await extractPages(url, page);
    const totalPages = countPages($);
    const results = parseListItems($);

    return { totalPages, letter, data: results };
  } catch (error) {
    throw error;
  }
};

export { extractAzList };

// ══════════════════════════════════════════════════════════════ END: azList.extractor.js
