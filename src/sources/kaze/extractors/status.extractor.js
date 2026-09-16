/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts anime filtered by status (ongoing, completed, etc.).
 *   Supports pagination for browsing large result sets.
 *
 * @exports
 *   extractStatus
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
// STATUS FILTER EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract anime filtered by status with pagination ----
/**
 * Fetches and parses anime filtered by status (ongoing, completed, etc.).
 * Returns paginated results with total page count.
 *
 * @param {string} status - Status to filter by (e.g., "ongoing", "completed")
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages, status, and data array
 * @returns {number} return.totalPages - Total number of pages available
 * @returns {string} return.status - The status filter used
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
 *   const ongoing = await extractStatus("ongoing", 1);
 *   console.log(ongoing.status); // "ongoing"
 *   console.log(ongoing.data[0].title); // First ongoing anime
 */
const extractStatus = async (status, page = 1) => {
  try {
    const url = URLS.status(status);
    const $ = await extractPages(url, page);
    const totalPages = countPages($);
    const results = parseListItems($);

    return { totalPages, status, data: results };
  } catch (error) {
    throw error;
  }
};

export { extractStatus };

// ══════════════════════════════════════════════════════════════ END: status.extractor.js
