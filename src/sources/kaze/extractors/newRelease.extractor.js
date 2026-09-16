/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts newly released and newly added anime with pagination.
 *   Provides both new releases and sorted by addition date.
 *
 * @exports
 *   extractNewRelease
 *   extractNewlyAdded
 *   extractLatestUpdated
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
// NEW RELEASE EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract newly released anime with pagination ----
/**
 * Fetches and parses newly released anime with pagination.
 * Returns paginated results with total page count.
 *
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages and data array
 * @returns {number} return.totalPages - Total number of pages available
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
 *   const newRelease = await extractNewRelease(1);
 *   console.log(newRelease.totalPages);
 *   console.log(newRelease.data[0].title);
 */
const extractNewRelease = async (page = 1) => {
  try {
    const $ = await extractPages(URLS.newRelease, page);
    const totalPages = countPages($);
    const results = parseListItems($);

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

// ══════════════════════════════════════════════════════════════
// NEWLY ADDED EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract newly added anime sorted by addition date ----
/**
 * Fetches and parses newly added anime sorted by addition date.
 * Uses the latestUpdated endpoint with sort=added parameter.
 *
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages and data array
 * @returns {number} return.totalPages - Total number of pages available
 * @returns {Array<Object>} return.data - Array of anime objects
 * @returns {string} return.data[].slug - URL slug for the anime
 * @returns {string} return.data[].poster - Poster image URL
 * @returns {string} return.data[].title - English title
 * @returns {string} return.data[].japaneseTitle - Japanese title
 * @returns {number} return.data[].sub - Subbed episode count
 * @returns {number} return.data[].dub - Dubbed episode count
 * @returns {number} return.data[].total - Total episode count
 * @returns {string} return.data[].type - Anime type (TV, Movie, etc.)
 *
 * @example
 *   const newlyAdded = await extractNewlyAdded(1);
 *   console.log(newlyAdded.totalPages);
 *   console.log(newlyAdded.data[0].title);
 */
const extractNewlyAdded = async (page = 1) => {
  try {
    const $ = await extractPages(`${URLS.latestUpdated}?sort=added`, page);
    const totalPages = countPages($);
    const results = parseListItems($);

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

// ══════════════════════════════════════════════════════════════
// LATEST UPDATED EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Latest Updated Extraction ----
/**
 * Fetches and parses recently updated anime with pagination.
 * Uses the /latest-updated page which shows anime sorted by last update time.
 *
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Promise<Object>} Object containing totalPages and data array
 *
 * @example
 *   const latest = await extractLatestUpdated(1);
 *   console.log(latest.totalPages);
 *   console.log(latest.data[0].title);
 */
const extractLatestUpdated = async (page = 1) => {
  try {
    const $ = await extractPages("/latest-updated", page);
    const totalPages = countPages($);
    const results = parseListItems($, ".item");

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

export { extractNewRelease, extractNewlyAdded, extractLatestUpdated };

// ══════════════════════════════════════════════════════════════ END: newRelease.extractor.js
